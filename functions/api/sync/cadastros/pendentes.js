import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui as alterações de placas e motoristas que ainda não foram gravadas na planilha (sem os dados pessoais).
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  // dados pessoais para os cartões (CPF, nascimento, CNH) não passam de 7 dias, mesmo que o envio não tenha dado certo
  await env.DB.prepare("UPDATE alteracoes_cadastros SET pessoais = NULL WHERE pessoais IS NOT NULL AND criado_em < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')").run();
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, usuario_nome, tipo, acao, chave, dados, antes, estado FROM alteracoes_cadastros
      WHERE estado IN ('pendente', 'aguardando') ORDER BY id LIMIT 50`).all();
  return json({ pendentes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados), antes: r.antes ? JSON.parse(r.antes) : {} })) });
}
