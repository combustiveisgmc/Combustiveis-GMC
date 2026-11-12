import { usuarioDaSessao, json } from '../../../lib/auth.js';
import { pode } from '../../../lib/permissoes.js';

// Operacional > Editar abastecimentos (correções na CONTROLES\Base_copia.xlsx, gravadas pelo vigia).
// GET  /api/base-copia   alterações pendentes e as dos últimos 7 dias (a página sobrepõe à lista até ela ser republicada)
// POST /api/base-copia   {itens: [{linha, placa, data, acao, celulas: {coluna: valor}, antes: {coluna: valor}}]}
//   acao 'editar' (padrão): células novas; acao 'excluir': celulas {} (o vigia apaga a linha da Base_copia)
const NUMEROS = new Set(['O', 'P', 'Q', 'R', 'S', 'T']);   // litros, vl/litro, hodômetro, km rodados, km/litro, valor emissão
const TEXTOS = new Set(['AB', 'AD']);                // informação adicional 1 e 3
const PLACA = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;           // F: ABC1234 ou ABC1D23 (sem traço)
const MAX_ITENS = 300;

function valido(it) {
  if (!it || !Number.isInteger(it.linha) || it.linha < 2 || typeof it.placa !== 'string' || !it.placa.trim() ||
      typeof it.data !== 'number' || !Number.isFinite(it.data) || !it.celulas || typeof it.celulas !== 'object') return false;
  const acao = it.acao === undefined ? 'editar' : it.acao;
  if (acao === 'excluir') return Object.keys(it.celulas).length === 0;
  if (acao !== 'editar') return false;
  const cols = Object.keys(it.celulas);
  if (!cols.length) return false;
  return cols.every((c) => {
    const v = it.celulas[c];
    if (NUMEROS.has(c)) return v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e9);
    if (TEXTOS.has(c)) return v === null || (typeof v === 'string' && v.length <= 200);
    if (c === 'F') return typeof v === 'string' && PLACA.test(v);
    if (c === 'L') return typeof v === 'string' && v.trim().length >= 3 && v.length <= 80;   // motorista
    return false;
  });
}

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'abastecimentos')) return json({ erro: 'Seu acesso não inclui a edição de abastecimentos.' }, 403);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, linha, placa, data, acao, celulas, antes, estado, mensagem, aplicada_em
       FROM alteracoes_base_copia
      WHERE estado IN ('pendente', 'aguardando') OR criado_em >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
      ORDER BY id DESC LIMIT 1000`).all();
  return json({
    podeEditar: pode(u, 'abastecimentos-editar'),
    alteracoes: results.map((r) => ({ ...r, celulas: JSON.parse(r.celulas), antes: JSON.parse(r.antes) })),
  });
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'abastecimentos-editar')) return json({ erro: 'Seu acesso aos abastecimentos é só de consulta.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const itens = Array.isArray(d.itens) ? d.itens : [];
  if (!itens.length) return json({ erro: 'Nenhuma alteração para salvar.' }, 400);
  if (itens.length > MAX_ITENS) return json({ erro: `Salve no máximo ${MAX_ITENS} abastecimentos por vez.` }, 400);
  if (!itens.every(valido)) return json({ erro: 'Alterações fora do formato. Recarregue a página e tente de novo.' }, 400);
  const stmts = itens.map((it) => env.DB.prepare(
    `INSERT INTO alteracoes_base_copia (usuario_id, usuario_nome, linha, placa, data, acao, celulas, antes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, criado_em, usuario_nome, linha, placa, data, acao, celulas, antes, estado, mensagem, aplicada_em`)
    .bind(u.id, u.nome, it.linha, it.placa.trim().toUpperCase(), it.data, it.acao === 'excluir' ? 'excluir' : 'editar',
          JSON.stringify(it.celulas), JSON.stringify(it.antes && typeof it.antes === 'object' ? it.antes : {})));
  const res = await env.DB.batch(stmts);
  const alteracoes = res.map((r) => r.results[0]).map((r) => ({ ...r, celulas: JSON.parse(r.celulas), antes: JSON.parse(r.antes) }));
  return json({ ok: true, alteracoes }, 201);
}
