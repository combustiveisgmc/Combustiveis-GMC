import { json } from '../../../lib/auth.js';
import { encerrarSessaoMotorista } from '../../../lib/motoristas.js';

export async function onRequestPost({ request, env }) {
  const cookie = await encerrarSessaoMotorista(env.DB, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}