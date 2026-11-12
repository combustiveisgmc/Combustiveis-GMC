import { usuarioDaSessao, json } from '../../../lib/auth.js';
import { pode } from '../../../lib/permissoes.js';
import { TANQUES, basesDoUsuario, veBase, lerBases, cadastroFornecedores } from '../../../lib/bomba.js';

// Bomba interna > Rateio das NFs. As notas são as compras (Movimentações); a lista de abastecimentos de cada tanque vem do
// vigia (KV "bomba-rateio", scripts/bomba_rateio.mjs) e o rateio é calculado na página (public/gestao/lib/rateio.js).
// Quem edita valida cada nota (pode corrigir o centro de custo) e a foto validada é o que o fiscal vê e confere.
// GET  /api/bomba/rateio   {bases, notas, inicios, validacoes: [{mov_id, usuario_nome, validado_em, dados}], conferencias,
//                           fornecedores (cadastro com CNPJ), podeEditar, euId; só para quem edita: lista {geradoEm, tanques, centros}, ccs: [{chave, cc, usuario_nome}]}
// POST /api/bomba/rateio   (bomba-rateio-editar)
//   {acao: 'inicio', base_id, tanque, quando: 'AAAA-MM-DDTHH:MM:SS', placa, ja_rateado}
//   {acao: 'cc', chave, cc}                (cc vazio desfaz a correção)
//   {acao: 'validar', mov_id, dados: {linhas, litros, valor, preco, ...}}   |   {acao: 'reabrir', mov_id}
//                          (bomba-rateio) {acao: 'conferir' | 'desconferir', mov_id}   (só nota validada)
const QUANDO_S = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const CHAVE = /^[A-Z0-9]{0,10}\|\d{1,12}\|\d{1,9}$/;

async function notaVisivel(env, permitidas, id) {
  const mov = await env.DB.prepare('SELECT id, base_id, tanque FROM bomba_movimentacoes WHERE id = ? AND excluida = 0').bind(Number(id)).first();
  return mov && veBase(permitidas, mov.base_id) ? mov : null;
}

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'bomba-rateio')) return json({ erro: 'Seu acesso não inclui o rateio das NFs.' }, 403);
  const permitidas = basesDoUsuario(u), podeEditar = pode(u, 'bomba-rateio-editar');
  const [bases, notas, ini, val, conf, fornecedores] = await Promise.all([
    lerBases(env.DB, false, permitidas),
    env.DB.prepare(`SELECT id, base_id, tanque, quando, litros, valor, nf, fornecedor, cnpj, emissao, obs FROM bomba_movimentacoes
      WHERE excluida = 0 ORDER BY quando, id`).all(),
    env.DB.prepare('SELECT base_id, tanque, quando, placa, ja_rateado, usuario_nome, atualizado_em FROM bomba_rateio_inicio').all(),
    env.DB.prepare('SELECT v.mov_id, v.usuario_nome, v.validado_em, v.dados, m.base_id FROM bomba_rateio_validacoes v JOIN bomba_movimentacoes m ON m.id = v.mov_id').all(),
    env.DB.prepare(`SELECT c.mov_id, c.usuario_id, c.usuario_nome, c.criado_em, m.base_id FROM bomba_rateio_conferencias c
      JOIN bomba_movimentacoes m ON m.id = c.mov_id ORDER BY c.id`).all(),
    cadastroFornecedores(env),
  ]);
  const ve = (x) => veBase(permitidas, x.base_id);
  const r = {
    bases: bases.map(({ id, nome, posto, tanques, ativo }) => ({ id, nome, posto, tanques: Object.keys(tanques || {}), ativo })),
    notas: notas.results.filter(ve), inicios: ini.results.filter(ve),
    validacoes: val.results.filter(ve).map(({ base_id, dados, ...v }) => ({ ...v, dados: JSON.parse(dados) })),
    conferencias: conf.results.filter(ve).map(({ base_id, ...c }) => c),
    fornecedores: fornecedores.filter((f) => f.cnpj),
    podeEditar, euId: u.id,
  };
  if (podeEditar) {
    const lista = await env.DADOS.get('bomba-rateio', 'json').catch(() => null);
    // centros: todos os centros de custo da Base_copia (lista de correção do centro de custo)
  r.lista = lista ? { geradoEm: lista.geradoEm, tanques: (lista.tanques || []).filter((t) => veBase(permitidas, t.base_id)), centros: lista.centros || [] } : null;
    r.ccs = (await env.DB.prepare('SELECT chave, cc, usuario_nome, atualizado_em FROM bomba_rateio_cc').all()).results;
  }
  return json(r);
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'bomba-rateio')) return json({ erro: 'Seu acesso não inclui o rateio das NFs.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const permitidas = basesDoUsuario(u);

  if (d.acao === 'conferir' || d.acao === 'desconferir') {
    const mov = await notaVisivel(env, permitidas, d.mov_id);
    if (!mov) return json({ erro: 'Nota não encontrada.' }, 404);
    if (d.acao === 'conferir') {
      const v = await env.DB.prepare('SELECT mov_id FROM bomba_rateio_validacoes WHERE mov_id = ?').bind(mov.id).first();
      if (!v) return json({ erro: 'Este rateio ainda não foi validado.' }, 400);
      await env.DB.prepare('INSERT OR IGNORE INTO bomba_rateio_conferencias (mov_id, usuario_id, usuario_nome) VALUES (?, ?, ?)').bind(mov.id, u.id, u.nome).run();
    } else {
      await env.DB.prepare('DELETE FROM bomba_rateio_conferencias WHERE mov_id = ? AND usuario_id = ?').bind(mov.id, u.id).run();
    }
    return json({ ok: true });
  }

  if (!pode(u, 'bomba-rateio-editar')) return json({ erro: 'Seu acesso ao rateio é só de consulta.' }, 403);
  if (d.acao === 'inicio') {
    const base = veBase(permitidas, d.base_id) ? await env.DB.prepare('SELECT id FROM bomba_bases WHERE id = ?').bind(Number(d.base_id)).first() : null;
    const ja = Number(d.ja_rateado || 0), placa = String(d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || null;
    const erros = [];
    if (!base) erros.push('Escolha a base.');
    if (!TANQUES.includes(d.tanque)) erros.push('Escolha o tanque.');
    if (!QUANDO_S.test(String(d.quando || ''))) erros.push('Escolha o primeiro abastecimento do rateio.');
    if (!(ja >= 0 && ja < 100000)) erros.push('Litros já rateados inválidos.');
    if (erros.length) return json({ erro: erros.join(' ') }, 400);
    await env.DB.prepare(`INSERT INTO bomba_rateio_inicio (base_id, tanque, quando, placa, ja_rateado, usuario_nome) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (base_id, tanque) DO UPDATE SET quando = excluded.quando, placa = excluded.placa, ja_rateado = excluded.ja_rateado,
      usuario_nome = excluded.usuario_nome, atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(base.id, d.tanque, d.quando, placa, ja, u.nome).run();
    return json({ ok: true });
  }
  if (d.acao === 'cc') {
    const chave = String(d.chave || ''), cc = String(d.cc ?? '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 120);
    if (!CHAVE.test(chave)) return json({ erro: 'Abastecimento inválido.' }, 400);
    if (cc) {
      await env.DB.prepare(`INSERT INTO bomba_rateio_cc (chave, cc, usuario_nome) VALUES (?, ?, ?) ON CONFLICT (chave) DO UPDATE SET
        cc = excluded.cc, usuario_nome = excluded.usuario_nome, atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(chave, cc, u.nome).run();
    } else {
      await env.DB.prepare('DELETE FROM bomba_rateio_cc WHERE chave = ?').bind(chave).run();
    }
    return json({ ok: true, chave, cc: cc || null });
  }
  if (d.acao === 'validar' || d.acao === 'reabrir') {
    const mov = await notaVisivel(env, permitidas, d.mov_id);
    if (!mov) return json({ erro: 'Nota não encontrada.' }, 404);
    if (d.acao === 'reabrir') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM bomba_rateio_conferencias WHERE mov_id = ?').bind(mov.id),
        env.DB.prepare('DELETE FROM bomba_rateio_validacoes WHERE mov_id = ?').bind(mov.id),
      ]);
      return json({ ok: true });
    }
    const dados = d.dados;
    if (!dados || !Array.isArray(dados.linhas) || !dados.linhas.length || dados.linhas.length > 3000) return json({ erro: 'Rateio vazio.' }, 400);
    const texto = JSON.stringify(dados);
    if (texto.length > 900_000) return json({ erro: 'Rateio grande demais para guardar.' }, 400);
    await env.DB.prepare(`INSERT INTO bomba_rateio_validacoes (mov_id, usuario_nome, dados) VALUES (?, ?, ?) ON CONFLICT (mov_id) DO UPDATE SET
      usuario_nome = excluded.usuario_nome, dados = excluded.dados, validado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(mov.id, u.nome, texto).run();
    return json({ ok: true });
  }
  return json({ erro: 'Ação inválida.' }, 400);
}