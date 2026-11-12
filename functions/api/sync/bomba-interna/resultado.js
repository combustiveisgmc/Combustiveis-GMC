import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia informa o resultado de cada lançamento da bomba interna: aplicada (com a linha), aguardando (planilha aberta
// no Excel) ou erro.
export async function onRequestPost({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const itens = (Array.isArray(corpo.itens) ? corpo.itens.slice(0, 300) : [])
    .filter((i) => Number.isInteger(i.id) && ['aplicada', 'aguardando', 'erro'].includes(i.estado));
  const agora = new Date().toISOString().slice(0, 19) + 'Z';
  const stmts = itens.map((i) => env.DB.prepare('UPDATE alteracoes_bomba SET estado = ?, mensagem = ?, aplicada_em = ?, linha = ? WHERE id = ?')
    .bind(i.estado, i.mensagem ? String(i.mensagem).slice(0, 300) : null, i.estado === 'aplicada' ? agora : null,
      Number.isInteger(i.linha) ? i.linha : null, i.id));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, atualizados: stmts.length });
}
