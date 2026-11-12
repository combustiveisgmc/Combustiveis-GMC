import { usuarioDaSessao, comSeguranca } from '../../lib/auth.js';
import { pode, USAM_DADOS } from '../../lib/permissoes.js';

// Protege tudo em /gestao: sem sessão válida, volta para a tela inicial.
// O HTML da gestão nem chega ao navegador de quem não entrou.
export async function onRequest({ request, env, next, data }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) {
    return new Response(null, { status: 302, headers: { Location: '/?entrar=1', 'Cache-Control': 'no-store' } });
  }
  // primeiro acesso (ou senha redefinida): só a tela de trocar senha fica liberada
  const caminho = new URL(request.url).pathname;
  if (u.trocar_senha === 1 && !caminho.startsWith('/gestao/senha')) {
    return new Response(null, { status: 302, headers: { Location: '/gestao/senha/', 'Cache-Control': 'no-store' } });
  }
  // o arquivo de abastecimentos só vai para quem pode abrir alguma página que usa ele
  if (caminho.startsWith('/gestao/dados/') && !pode(u, ...USAM_DADOS)) {
    return new Response('Seu acesso não inclui os dashboards.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  data.usuario = u;
  const resp = await next();
  const r = new Response(resp.body, resp);
  // dados: o navegador guarda, mas confere com o servidor a cada acesso (ETag) — sem baixar de novo à toa
  r.headers.set('Cache-Control', caminho.startsWith('/gestao/dados/') ? 'private, no-cache' : 'no-store');
  return comSeguranca(r);
}
