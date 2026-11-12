import { conferirSenha, criarSessao, chavesTentativas, bloqueioLogin, falhaLogin, limparFalhas, json } from '../../lib/auth.js';
import { usuarioMotorista, motoristaDoCadastro, criarSessaoMotorista } from '../../lib/motoristas.js';

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
  // motorista: entra com o usuário de 6 números (os 6 primeiros do CPF); senha inicial = o próprio usuário, ou a que ele
  // escolheu (motoristas_acesso.senha_hash); vai para /motorista/. Desde 12/11/2026 o CPF não é guardado em lugar nenhum
  const motorista = usuarioMotorista(usuario);
  const chaveConta = motorista ? 'mot:' + motorista : usuario;
  const chaves = await chavesTentativas(request, env, chaveConta);
  const espera = await bloqueioLogin(db, chaves);
  if (espera) {
    const min = Math.ceil(espera / 60);
    return json({ erro: `Muitas tentativas erradas. Tente de novo em ${min} minuto${min > 1 ? 's' : ''}.` }, 429);
  }

  if (motorista) {
    const m = await motoristaDoCadastro(env, motorista);
    const a = await db.prepare('SELECT senha_hash FROM motoristas_acesso WHERE usuario = ?').bind(motorista).first();
    const ok = a && a.senha_hash ? await conferirSenha(senha, a.senha_hash)
      : (await conferirSenha(senha, HASH_FALSO), senha.trim() === motorista);   // mesmo tempo de resposta nos dois casos
    if (!m || !ok) {
      await falhaLogin(db, chaves);
      return json({ erro: 'Usuário ou senha incorretos. O usuário são os 6 primeiros números do seu CPF' +
        (a && a.senha_hash ? '.' : ' e a senha é o mesmo número, se você ainda não trocou.') }, 401);
    }
    if (m.situacao === 'DESLIGADO') return json({ erro: 'Seu acesso não está liberado. Fale com a gestão de combustível.' }, 403);
    await limparFalhas(db, chaveConta);
    const agora = new Date().toISOString().slice(0, 19) + 'Z';
    await db.prepare(`INSERT INTO motoristas_acesso (usuario, nome, primeiro_acesso, ultimo_acesso, acessos) VALUES (?1, ?2, ?3, ?3, 1)
      ON CONFLICT(usuario) DO UPDATE SET nome = ?2, primeiro_acesso = COALESCE(primeiro_acesso, ?3), ultimo_acesso = ?3, acessos = acessos + 1`)
      .bind(motorista, m.nome, agora).run();
    return json({ ok: true, motorista: true }, 200, { 'Set-Cookie': await criarSessaoMotorista(db, request, motorista, m.nome) });
  }

  const u = await db.prepare('SELECT id, senha_hash, trocar_senha FROM usuarios WHERE usuario = ? AND ativo = 1').bind(usuario).first();
  const ok = await conferirSenha(senha, u ? u.senha_hash : HASH_FALSO);
  if (!u || !ok) {
    await falhaLogin(db, chaves);
    return json({ erro: 'Usuário ou senha incorretos.' }, 401);
  }

  await limparFalhas(db, usuario);
  await db.prepare("UPDATE usuarios SET ultimo_acesso = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(u.id).run();
  const cookie = await criarSessao(db, request, u.id, dados.manter === true);
  return json({ ok: true, trocar_senha: u.trocar_senha === 1 }, 200, { 'Set-Cookie': cookie });
}
