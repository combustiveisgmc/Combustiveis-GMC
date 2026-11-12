import { tokenSyncValido, json } from '../../../../lib/auth.js';

// Motoristas adicionados pelo portal (Cadastro > Motoristas) e já gravados na planilha que ainda têm os dados para os
// cartões (CPF, nascimento, CNH em "pessoais"): o vigia cadastra cada um na Ticket (cliente Raja Log) e na TruckPag e
// depois avisa em /api/sync/cadastros/cartoes ("limpar"), que apaga esses dados. Sem "pessoais" não há o que mandar.
// GET -> {motoristas: [{id, criado_em, aplicada_em, dados, pessoais}]}
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, criado_em, aplicada_em, dados, pessoais FROM alteracoes_cadastros
      WHERE tipo = 'motoristas' AND acao = 'adicionar' AND estado = 'aplicada' AND sem_cartoes = 0 AND pessoais IS NOT NULL
      ORDER BY id`).all();
  return json({ motoristas: results.map((r) => ({ ...r, dados: JSON.parse(r.dados), pessoais: JSON.parse(r.pessoais) })) });
}
