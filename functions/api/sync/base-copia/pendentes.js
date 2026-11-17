import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui as correções da página Editar abastecimentos ainda não gravadas na CONTROLES\Base_copia.xlsx.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, linha, placa, data, acao, celulas, tanque FROM alteracoes_base_copia WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 500`).all();
  return json({ pendentes: results.map((r) => ({ ...r, celulas: JSON.parse(r.celulas) })) });
}
