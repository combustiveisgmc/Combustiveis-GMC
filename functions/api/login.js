import { conferirSenha, criarSessao, chavesTentativas, bloqueioLogin, falhaLogin, limparFalhas, json } from '../../lib/auth.js';
import { pareceCpf, soNumeros, motoristaDoCadastro, criarSessaoMotorista } from '../../lib/motoristas.js';

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
  // motorista: entra com o CPF; senha = 6 primeiros dígitos do CPF (decisão do usuário); vai para /motorista/
  const motorista = pareceCpf(usuario);
  const chaveConta = motorista ? 'cpf:' + soNumeros(usuario) : usuario;
  const chaves = await chavesTentativas(request, env, chaveConta);
  const espera = await bloqueioLogin(db, chaves);
  if (espera) {
    const min = Math.ceil(espera / 60);
    return json({ erro: `Muitas tentativas erradas. Tente de novo em ${min} minuto${min > 1 ? 's' : ''}.` }, 429);
  }

  if (motorista) {
    const cpf = soNumeros(usuario);
    const m = await motoristaDoCadastro(env, cpf);
    if (!m || senha.trim() !== cpf.slice(0, 6)) {
      await falhaLogin(db, chaves);
      return json({ erro: 'CPF ou senha incorretos. A senha são os 6 primeiros números do seu CPF.' }, 401);
    }
    if (m.situacao === 'DESLIGADO') return json({ erro: 'Seu acesso não está liberado. Fale com a gestão de combustível.' }, 403);
    await limparFalhas(db, chaveConta);
    return json({ ok: true, motorista: true }, 200, { 'Set-Cookie': await criarSessaoMotorista(db, request, cpf, m.nome) });
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
