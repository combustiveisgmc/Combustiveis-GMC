import { tokenSyncValido, json } from '../../../../lib/auth.js';

// Placas editadas (ou adicionadas) por pessoas no portal (Cadastro > Placas) e já gravadas na planilha, depois de "desde":
// o vigia repete a unidade na TruckPag como centro de custo do veículo (scripts/placas_truckpag.mjs, 16/11/2026).
// GET ?desde=AAAA-MM-DDTHH:MM:SSZ -> {edicoes: [{id, aplicada_em, acao, chave, dados}]}
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const desde = new URL(request.url).searchParams.get('desde') || '9999';
  const { results } = await env.DB.prepare(
    `SELECT id, aplicada_em, acao, chave, dados FROM alteracoes_cadastros
      WHERE tipo = 'placas' AND acao IN ('editar', 'adicionar') AND estado = 'aplicada' AND aplicada_em > ?
        AND usuario_nome NOT LIKE 'APIs dos cartões%'
      ORDER BY aplicada_em, id LIMIT 200`).bind(desde).all();
  return json({ edicoes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados) })) });
}
