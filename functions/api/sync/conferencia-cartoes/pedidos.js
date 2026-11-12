import { tokenSyncValido, json } from '../../../../lib/auth.js';

// Pedidos de inclusão da Conferência com os cartões: transações que estão na Ticket/TruckPag e faltam na Base_copia.
// O vigia (scripts/conferencia_cartoes.mjs) monta o lote com o motor do Consolidador e devolve o resultado.
// GET  -> {pedidos: [{id, cartao_id, dia}]}
// POST {itens: [{id, estado: 'feito'|'duplicado'|'erro', mensagem, lote_id}]}
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare("SELECT id, cartao_id, dia FROM conferencia_pedidos WHERE estado = 'pendente' ORDER BY id LIMIT 200").all();
  return json({ pedidos: results });
}

export async function onRequestPost({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const its = (Array.isArray(b.itens) ? b.itens : []).filter((i) => i && Number.isInteger(i.id) && ['feito', 'duplicado', 'erro'].includes(i.estado));
  if (its.length) {
    await env.DB.batch(its.map((i) => env.DB.prepare('UPDATE conferencia_pedidos SET estado = ?, mensagem = ?, lote_id = ? WHERE id = ?')
      .bind(i.estado, i.mensagem ? String(i.mensagem).slice(0, 300) : null, Number.isInteger(i.lote_id) ? i.lote_id : null, i.id)));
  }
  return json({ ok: true, atualizados: its.length });
}