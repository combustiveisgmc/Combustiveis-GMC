import { usuarioDaSessao, json } from '../../lib/auth.js';
import { permissoesDe } from '../../lib/permissoes.js';

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  return json({
    usuario: u.usuario, nome: u.nome, papel: u.papel, trocar_senha: u.trocar_senha === 1,
    permissoes: permissoesDe(u),   // o menu mostra só o que a pessoa pode usar; o servidor confere de novo em cada pedido
  });
}
