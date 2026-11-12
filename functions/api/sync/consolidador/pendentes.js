import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui os lotes do Consolidador ainda não gravados na CONTROLES\Base_copia.xlsx.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, linhas FROM consolidador_lotes WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 10`).all();
  return json({ pendentes: results.map((r) => ({ ...r, linhas: JSON.parse(r.linhas) })) });
}
