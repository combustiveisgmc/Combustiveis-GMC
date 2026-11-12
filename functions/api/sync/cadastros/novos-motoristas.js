import { tokenSyncValido, json } from '../../../../lib/auth.js';

// Motoristas adicionados pelo portal (Cadastro > Motoristas) nos últimos 30 dias e já gravados na planilha: o vigia
// cadastra cada um na Ticket (cliente Raja Log) e na TruckPag. Vai com as senhas e a data de nascimento (o vigia precisa).
// GET -> {motoristas: [{id, criado_em, aplicada_em, dados}]}
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, aplicada_em, dados FROM alteracoes_cadastros
      WHERE tipo = 'motoristas' AND acao = 'adicionar' AND estado = 'aplicada' AND sem_cartoes = 0 AND aplicada_em >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
      ORDER BY id`).all();
  return json({ motoristas: results.map((r) => ({ ...r, dados: JSON.parse(r.dados) })) });
}