import { tokenSyncValido, json } from '../../../lib/auth.js';

// O vigia do computador da sincronização busca aqui as alterações que ainda não foram gravadas na planilha.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, acao, dados, estado FROM alteracoes_postos
      WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 50`).all();
  return json({ pendentes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados) })) });
}
