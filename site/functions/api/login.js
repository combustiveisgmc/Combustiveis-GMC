import { conferirSenha, criarSessao, estaBloqueado, registrarFalha, limparFalhas, json } from '../../lib/auth.js';

// hash de uma senha qualquer, usado quando o usuário não existe (mesmo tempo de resposta)
const HASH_FALSO = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);

  let dados;
  try { dados = await request.json(); } catch { return json({ erro: 'Envie usuário e senha.' }, 400); }
  const usuario = String(dados.usuario || '').trim().toLowerCase();
  const senha = String(dados.senha || '');
  if (!usuario || !senha || usuario.length > 64 || senha.length > 200) {
    return json({ erro: 'Preencha usuário e senha.' }, 400);
  }

  const db = env.DB;
  const espera = await estaBloqueado(db, usuario);
  if (espera) {
    const min = Math.ceil(espera / 60);
    return json({ erro: `Muitas tentativas erradas. Tente de novo em ${min} minuto${min > 1 ? 's' : ''}.` }, 429);
  }

  const u = await db.prepare('SELECT id, senha_hash FROM usuarios WHERE usuario = ? AND ativo = 1').bind(usuario).first();
  const ok = await conferirSenha(senha, u ? u.senha_hash : HASH_FALSO);
  if (!u || !ok) {
    await registrarFalha(db, usuario);
    return json({ erro: 'Usuário ou senha incorretos.' }, 401);
  }

  await limparFalhas(db, usuario);
  const cookie = await criarSessao(db, request, u.id);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
