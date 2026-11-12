import { motoristaDaSessao } from '../../lib/motoristas.js';
import { comSeguranca } from '../../lib/auth.js';

// Área do motorista: sem a sessão do motorista (entrou com o CPF), volta para a tela inicial com o "Entrar" aberto.
export async function onRequest({ request, env, next }) {
  const s = await motoristaDaSessao(env.DB, request);
  if (!s) return new Response(null, { status: 302, headers: { Location: '/?entrar=1', 'Cache-Control': 'no-store' } });
  const resp = await next();
  const r = new Response(resp.body, resp);
  r.headers.set('Cache-Control', 'no-store');
  return comSeguranca(r);
}