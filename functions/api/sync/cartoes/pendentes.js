import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui as mudanças nos cartões frota que ainda não foram gravadas na planilha.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, acao, chave, dados, estado FROM alteracoes_cartoes
      WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 50`).all();
  return json({ pendentes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados) })) });
}
