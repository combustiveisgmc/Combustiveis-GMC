import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui as alterações de placas e motoristas que ainda não foram gravadas na planilha.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, tipo, acao, chave, dados, antes, estado FROM alteracoes_cadastros
      WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 50`).all();
  return json({ pendentes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados), antes: r.antes ? JSON.parse(r.antes) : {} })) });
}
