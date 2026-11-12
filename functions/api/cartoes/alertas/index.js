import { usuarioDaSessao, json } from '../../../../lib/auth.js';
import { pode } from '../../../../lib/permissoes.js';

// GET /api/cartoes/alertas   quantos avisos de cartão faltando estão em aberto (selo no menu da gestão)
export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'cartoes-frota')) return json({ abertos: 0 });
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM alertas_cartoes WHERE estado = 'aberto'`).first();
  return json({ abertos: r.n });
}
