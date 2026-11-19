import { tokenSyncValido, json } from '../../../../lib/auth.js';
import { aplicarDepois } from '../../../../lib/aplicar-banco.js';

// Correções automáticas do vigia na fila da página Editar abastecimentos. Ficam pendentes como as feitas à mão e aparecem
// no histórico com o nome de quem fez:
//  - "Recálculo do KM (automático)" (scripts/km_recalcular.mjs): KM rodado e km/L do abastecimento seguinte quando entra
//    um abastecimento no meio da cadeia da placa;
//  - "Estorno TruckPag (automático)" (scripts/estornos_truckpag.mjs): exclui o abastecimento estornado na TruckPag depois
//    de já gravado na Base_copia (e acerta o km do seguinte);
//  - "Duplicado (automático)": exclusão de lançamento em dobro (mesma placa, litros, combustível e hodômetro).
// POST {quem?, itens: [{linha, placa, data, acao?: 'editar'|'excluir', celulas: {R, S} | {}, antes}]} -> {inseridos}
const QUEM = new Set(['Recálculo do KM (automático)', 'Estorno TruckPag (automático)', 'Duplicado (automático)']);
const COLUNAS = new Set(['R', 'S']);   // KM RODADOS e KM/LITRO
const numOuNulo = (v) => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : undefined);

export async function onRequestPost({ request, env, waitUntil }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const quem = QUEM.has(corpo.quem) ? corpo.quem : 'Recálculo do KM (automático)';
  const itens = (Array.isArray(corpo.itens) ? corpo.itens.slice(0, 200) : []).filter((i) => {
    if (!Number.isInteger(i.linha) || i.linha < 2 || typeof i.placa !== 'string' || !i.placa || !Number.isFinite(i.data) || !i.celulas) return false;
    if (i.acao === 'excluir') return Object.keys(i.celulas).length === 0;
    return Object.keys(i.celulas).length && Object.entries(i.celulas).every(([k, v]) => COLUNAS.has(k) && numOuNulo(v) !== undefined);
  });
  // a coluna usuario_id é obrigatória: fica o primeiro usuário (como nas alterações automáticas das APIs dos cartões)
  const u = await env.DB.prepare('SELECT id FROM usuarios ORDER BY id LIMIT 1').first();
  if (!u) return json({ erro: 'Sem usuário para registrar.' }, 500);
  const stmts = itens.map((i) => {
    const excluir = i.acao === 'excluir';
    const celulas = excluir ? {} : Object.fromEntries(Object.entries(i.celulas).map(([k, v]) => [k, numOuNulo(v)]));
    const antes = Object.fromEntries(Object.keys(celulas).map((k) => [k, numOuNulo((i.antes || {})[k]) ?? null]));
    return env.DB.prepare(`INSERT INTO alteracoes_base_copia (usuario_id, usuario_nome, linha, placa, data, acao, celulas, antes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(u.id, quem, i.linha, i.placa.slice(0, 10), i.data, excluir ? 'excluir' : 'editar', JSON.stringify(celulas), JSON.stringify(antes));
  });
  if (stmts.length) { await env.DB.batch(stmts); aplicarDepois({ env, waitUntil }); }   // também direto no banco (15.2 passo 3)
  return json({ ok: true, inseridos: stmts.length });
}
