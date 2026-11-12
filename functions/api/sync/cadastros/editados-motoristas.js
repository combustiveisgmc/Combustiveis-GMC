import { tokenSyncValido, json } from '../../../../lib/auth.js';

// Edições de motoristas feitas por pessoas no portal (Cadastro > Motoristas) e já gravadas na planilha, depois de "desde":
// o vigia repete na TruckPag (scripts/motoristas_cartoes.mjs editarTruckpag). As automáticas (APIs dos cartões) ficam fora.
// GET ?desde=AAAA-MM-DDTHH:MM:SSZ -> {edicoes: [{id, aplicada_em, chave, dados}]}
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const desde = new URL(request.url).searchParams.get('desde') || '9999';
  const { results } = await env.DB.prepare(
    `SELECT id, aplicada_em, chave, dados FROM alteracoes_cadastros
      WHERE tipo = 'motoristas' AND acao = 'editar' AND estado = 'aplicada' AND aplicada_em > ? AND usuario_nome NOT LIKE 'APIs dos cartões%'
      ORDER BY id LIMIT 200`).bind(desde).all();
  return json({ edicoes: results.map((r) => ({ ...r, dados: JSON.parse(r.dados) })) });
}