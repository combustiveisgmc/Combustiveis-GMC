import { usuarioDaSessao } from '../../lib/auth.js';

// Protege tudo em /gestao: sem sessão válida, volta para a tela inicial.
// O HTML da gestão nem chega ao navegador de quem não entrou.
export async function onRequest({ request, env, next, data }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) {
    return new Response(null, { status: 302, headers: { Location: '/?entrar=1', 'Cache-Control': 'no-store' } });
  }
  data.usuario = u;
  const resp = await next();
  const r = new Response(resp.body, resp);
  r.headers.set('Cache-Control', 'no-store');
  return r;
}
