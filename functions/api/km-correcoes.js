import { usuarioDaSessao, json } from '../../lib/auth.js';
import { pode } from '../../lib/permissoes.js';

// Consulta de KM: correções feitas no "Editar abastecimentos" (CONTROLES\Base_copia.xlsx) que mexem na leitura de
// hodômetro — hodômetro (Q), placa (F) ou exclusão. A Consulta lê a Base.xlsx; com isto ela aplica por cima as
// correções enquanto a Base ainda tiver o valor antigo (quem decide é a página: vale a Base se ela já mudou).
// GET /api/km-correcoes -> {correcoes: [{id, placa, data, acao, celulas, antes}]}  (data = número serial do Excel)
export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'consulta-km')) return json({ erro: 'Seu acesso não inclui a consulta de KM.' }, 403);
  const { results } = await env.DB.prepare(
    `SELECT id, placa, data, acao, celulas, antes FROM alteracoes_base_copia
      WHERE estado IN ('pendente', 'aguardando', 'aplicada')
        AND (acao = 'excluir' OR celulas LIKE '%"Q"%' OR celulas LIKE '%"F"%')
      ORDER BY id`).all();
  return json({ correcoes: results.map((r) => ({ ...r, celulas: JSON.parse(r.celulas), antes: JSON.parse(r.antes) })) });
}
