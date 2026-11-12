import { usuarioDaSessao, json } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  return json({ usuario: u.usuario, nome: u.nome, papel: u.papel });
}
