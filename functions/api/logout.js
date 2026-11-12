import { encerrarSessao, json } from '../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const cookie = await encerrarSessao(env.DB, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
