import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui as negociações e os fornecedores da bomba interna ainda não gravados na planilha.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, tipo, dados FROM alteracoes_bomba WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 300`).all();
  return json({ pendentes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados) })) });
}
