import { json, conferirSenha, gerarHashSenha, chavesTentativas, bloqueioLogin, falhaLogin, limparFalhas, sha256, lerCookie } from '../../../lib/auth.js';
import { motoristaDaSessao, COOKIE_MOTORISTA } from '../../../lib/motoristas.js';

// Área do motorista > Conta: o motorista troca a própria senha (pedido do usuário, 12/11/2026). A senha inicial é o
// próprio usuário (6 números); a gestão pode voltar para ela em Cadastro > Motoristas ("Voltar à senha inicial").
// POST {atual, nova} -> {ok}. As outras sessões abertas do motorista terminam; a deste aparelho continua.
export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const s = await motoristaDaSessao(env.DB, request);
  if (!s) return json({ erro: 'Entre de novo com o seu usuário.' }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const atual = String(d.atual || ''), nova = String(d.nova || '');
  if (!atual || !nova) return json({ erro: 'Preencha a senha atual e a nova.' }, 400);
  if (nova.length < 6 || nova.length > 60) return json({ erro: 'A nova senha precisa ter de 6 a 60 caracteres.' }, 400);
  if (nova.trim() === s.usuario) return json({ erro: 'A nova senha não pode ser igual ao seu usuário.' }, 400);

  // senha atual errada conta como tentativa de login (o mesmo limite da tela de entrada)
  const chaves = await chavesTentativas(request, env, 'mot:' + s.usuario);
  const espera = await bloqueioLogin(env.DB, chaves);
  if (espera) {
    const min = Math.ceil(espera / 60);
    return json({ erro: `Muitas tentativas erradas. Tente de novo em ${min} minuto${min > 1 ? 's' : ''}.` }, 429);
  }
  const a = await env.DB.prepare('SELECT senha_hash FROM motoristas_acesso WHERE usuario = ?').bind(s.usuario).first();
  const ok = a && a.senha_hash ? await conferirSenha(atual, a.senha_hash) : atual.trim() === s.usuario;
  if (!ok) {
    await falhaLogin(env.DB, chaves);
    return json({ erro: 'A senha atual não confere.' }, 400);
  }
  await limparFalhas(env.DB, 'mot:' + s.usuario);
  const agora = new Date().toISOString().slice(0, 19) + 'Z';
  const atualHash = await sha256(lerCookie(request, COOKIE_MOTORISTA) || '');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO motoristas_acesso (usuario, nome, senha_hash, senha_trocada_em) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(usuario) DO UPDATE SET senha_hash = ?3, senha_trocada_em = ?4`).bind(s.usuario, s.nome, await gerarHashSenha(nova), agora),
    env.DB.prepare('DELETE FROM sessoes_motoristas WHERE usuario = ? AND token_hash <> ?').bind(s.usuario, atualHash),
  ]);
  return json({ ok: true });
}
