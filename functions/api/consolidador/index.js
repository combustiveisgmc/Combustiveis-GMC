import { usuarioDaSessao, json } from '../../../lib/auth.js';
import { pode } from '../../../lib/permissoes.js';

// GET /api/consolidador   decisões de postos já gravadas (aplicadas sozinhas nas próximas consolidações) e os lotes
// recentes (gravação na CONTROLES\Base_copia.xlsx pelo vigia). As chaves dos lotes entram na checagem de duplicidade
// até o histórico da Base ser publicado de novo com eles.
export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'consolidador')) return json({ erro: 'Seu acesso não inclui o consolidador.' }, 403);
  const [postos, lotes] = await Promise.all([
    env.DB.prepare('SELECT chave, nome, decisao, canonico, endereco, cidade, uf, usuario_nome, criado_em FROM consolidador_postos ORDER BY nome').all(),
    env.DB.prepare(`SELECT id, criado_em, usuario_nome, resumo, chaves, estado, mensagem, aplicada_em, linha_inicial, linha_final
                      FROM consolidador_lotes WHERE criado_em >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 days') ORDER BY id DESC LIMIT 40`).all(),
  ]);
  return json({
    podeEditar: pode(u, 'consolidador-editar'),
    postos: postos.results,
    lotes: lotes.results.map((l) => ({ ...l, resumo: JSON.parse(l.resumo), chaves: JSON.parse(l.chaves) })),
  });
}
