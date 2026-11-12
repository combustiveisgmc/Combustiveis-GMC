import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui as coordenadas de postos cadastradas pelo mapa de calor e ainda não gravadas na LOCALIZAÇÃO DOS POSTOS.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, nome, cidade, uf, lat, lon FROM alteracoes_locais WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 200`).all();
  return json({ pendentes: results });
}
