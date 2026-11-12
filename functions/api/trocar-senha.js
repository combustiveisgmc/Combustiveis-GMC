import {
  usuarioDaSessao, conferirSenha, gerarHashSenha, estaBloqueado, registrarFalha, limparFalhas,
  lerCookie, sha256, COOKIE, json
} from '../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);

  const db = env.DB;
  const u = await usuarioDaSessao(db, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);

  let dados;
  try { dados = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const atual = String(dados.senha_atual || '');
  const nova = String(dados.senha_nova || '');

  if (nova.length < 8) return json({ erro: 'A senha nova precisa ter pelo menos 8 caracteres.' }, 400);
  if (nova.length > 200) return json({ erro: 'A senha nova é longa demais.' }, 400);
  if (nova === atual) return json({ erro: 'A senha nova precisa ser diferente da atual.' }, 400);

  if (await estaBloqueado(db, u.usuario)) {
    return json({ erro: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' }, 429);
  }
  const reg = await db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').bind(u.id).first();
  if (!(await conferirSenha(atual, reg.senha_hash))) {
    await registrarFalha(db, u.usuario);
    return json({ erro: 'A senha atual está incorreta.' }, 400);
  }
  await limparFalhas(db, u.usuario);

  await db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?')
    .bind(await gerarHashSenha(nova), u.id).run();

  // desconecta outros aparelhos; mantém só esta sessão
  const tokenAtual = await sha256(lerCookie(request, COOKIE));
  await db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?').bind(u.id, tokenAtual).run();

  return json({ ok: true });
}
