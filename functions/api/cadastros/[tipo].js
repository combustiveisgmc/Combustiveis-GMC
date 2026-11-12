import { usuarioDaSessao, json } from '../../../lib/auth.js';
import { pode } from '../../../lib/permissoes.js';
import { CAMPOS, CHAVE, TIPOS, NOME, normalizarChave, validar } from '../../../lib/cadastros.js';

// GET  /api/cadastros/placas|motoristas   lista publicada pelo vigia + alterações do portal
// POST /api/cadastros/placas|motoristas   {acao: 'editar'|'adicionar', chave, dados}  -> fica pendente até o vigia gravar
const emAberto = (e) => e === 'pendente' || e === 'aguardando';

async function lista(env, tipo) {
  const c = await env.DADOS.get('cadastros', 'json');
  return { itens: c && Array.isArray(c[tipo]) ? c[tipo] : null, atualizadoEm: c ? c.atualizadoEm : null };
}

export async function onRequestGet({ request, env, params }) {
  const tipo = params.tipo;
  if (!TIPOS.includes(tipo)) return json({ erro: 'Cadastro desconhecido.' }, 404);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'cadastro-' + tipo)) return json({ erro: 'Seu acesso não inclui este cadastro.' }, 403);
  const { itens, atualizadoEm } = await lista(env, tipo);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, acao, chave, dados, antes, estado, mensagem, aplicada_em, linha
       FROM alteracoes_cadastros WHERE tipo = ? ORDER BY id DESC LIMIT 80`).bind(tipo).all();
  // sugestões dos campos de texto: os valores que já existem na planilha
  const sugestoes = {};
  for (const c of CAMPOS[tipo]) {
    if (!c.sugestoes) continue;
    const s = new Set(Array.isArray(c.sugestoes) ? c.sugestoes : []);
    (itens || []).forEach((r) => { if (r[c.id]) s.add(String(r[c.id])); });
    sugestoes[c.id] = [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  return json({
    campos: CAMPOS[tipo], chave: CHAVE[tipo], lista: itens, atualizadoEm, sugestoes,
    podeEditar: pode(u, 'cadastro-' + tipo + '-editar'),
    alteracoes: results.map((r) => {
      // senhas dos cartões vão como estão (decisão do usuário em 10/11/2026: não são sensíveis; mascarar gerava erro nos cartões)
      return { ...r, dados: JSON.parse(r.dados), antes: r.antes ? JSON.parse(r.antes) : {} };
    }),
  });
}

export async function onRequestPost({ request, env, params }) {
  const tipo = params.tipo;
  if (!TIPOS.includes(tipo)) return json({ erro: 'Cadastro desconhecido.' }, 404);
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'cadastro-' + tipo + '-editar')) return json({ erro: 'Seu acesso a este cadastro é só de consulta.' }, 403);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const acao = String(corpo.acao || '');
  if (!['editar', 'adicionar'].includes(acao)) return json({ erro: 'Ação desconhecida.' }, 400);
  const { itens, atualizadoEm } = await lista(env, tipo);
  if (!itens) return json({ erro: 'A lista ainda não foi publicada pelo computador da sincronização. Tente mais tarde.' }, 409);

  const { dados, erros } = validar(tipo, acao, corpo.dados && typeof corpo.dados === 'object' ? corpo.dados : {});
  if (erros.length) return json({ erro: erros.join(' ') }, 400);
  const k = CHAVE[tipo];
  const qual = tipo === 'placas' ? 'A placa ' : 'O CPF ';
  const achar = (v) => itens.find((r) => normalizarChave(tipo, r[k]) === normalizarChave(tipo, v));
  // também as já gravadas na planilha que a lista publicada ainda não traz (o vigia republica logo depois)
  const desde = atualizadoEm ? String(atualizadoEm).slice(0, 19) + 'Z' : '';
  const pendentes = (await env.DB.prepare(
    `SELECT acao, chave, dados FROM alteracoes_cadastros WHERE tipo = ? AND (estado IN ('pendente', 'aguardando')
       OR (estado = 'aplicada' AND aplicada_em >= ?))`).bind(tipo, desde).all()).results;
  const chavePendente = (v) => pendentes.some((p) => normalizarChave(tipo, p.chave) === normalizarChave(tipo, v) ||
    normalizarChave(tipo, JSON.parse(p.dados)[k] || '') === normalizarChave(tipo, v));

  let chave;
  const antes = {};
  if (acao === 'editar') {
    const atual = achar(corpo.chave);
    if (!atual) return json({ erro: 'Não encontrei ' + (tipo === 'placas' ? 'esta placa' : 'este motorista') + ' na lista. Recarregue a página.' }, 404);
    chave = atual[k];
    for (const [c, v] of Object.entries(dados)) {
      const velho = atual[c] ?? null;
      if (String(velho ?? '') === String(v ?? '')) delete dados[c];   // não mudou: não grava
      else antes[c] = velho;
    }
    if (!Object.keys(dados).length) return json({ erro: 'Nada foi alterado.' }, 400);
    if (k in dados) {
      const outro = achar(dados[k]);
      if ((outro && outro !== atual) || chavePendente(dados[k])) return json({ erro: qual + dados[k] + ' já está cadastrado.' }, 409);
    }
  } else {
    chave = dados[k];
    if (achar(chave) || chavePendente(chave)) {
      return json({ erro: qual + chave + ' já está cadastrado' + (achar(chave) ? '.' : ' (alteração aguardando gravação).') }, 409);
    }
  }
  // motorista novo com a caixa "cadastrar nos sites dos cartões frota" desmarcada: o vigia não cria na Ticket/TruckPag
  const semCartoes = tipo === 'motoristas' && acao === 'adicionar' && corpo.cartoes === false ? 1 : 0;
  const r = await env.DB.prepare(
    `INSERT INTO alteracoes_cadastros (usuario_id, usuario_nome, tipo, acao, chave, dados, antes, sem_cartoes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, criado_em, estado`)
    .bind(u.id, u.nome, tipo, acao, String(chave), JSON.stringify(dados), JSON.stringify(antes), semCartoes).first();
  return json({ ok: true, alteracao: { ...r, acao, chave, dados, antes, usuario_nome: u.nome, tipo, nome: NOME[tipo] } }, 201);
}
