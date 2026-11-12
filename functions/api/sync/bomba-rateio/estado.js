import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui o que precisa para aplicar o preço das notas (Rateio das NFs) aos abastecimentos das bombas internas:
// bases, notas (compras), início do rateio de cada tanque, centros de custo corrigidos na validação e as linhas da Base_copia
// que já têm correção esperando o vigia.
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const [bases, notas, inicios, ccs, pendentes] = await Promise.all([
    env.DB.prepare('SELECT id, nome, posto, tanques, ativo FROM bomba_bases').all(),
    env.DB.prepare('SELECT id, base_id, tanque, quando, litros, valor, nf FROM bomba_movimentacoes WHERE excluida = 0').all(),
    env.DB.prepare('SELECT base_id, tanque, quando, placa, ja_rateado FROM bomba_rateio_inicio').all(),
    env.DB.prepare('SELECT chave, cc FROM bomba_rateio_cc').all(),
    env.DB.prepare("SELECT DISTINCT linha FROM alteracoes_base_copia WHERE estado IN ('pendente', 'aguardando')").all(),
  ]);
  return json({
    bases: bases.results.map((b) => ({ ...b, tanques: JSON.parse(b.tanques) })), notas: notas.results,
    inicios: inicios.results, ccs: ccs.results, linhasPendentes: pendentes.results.map((r) => r.linha),
  });
}