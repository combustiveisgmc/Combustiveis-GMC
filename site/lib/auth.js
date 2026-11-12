// Autenticação da gestão: senhas com PBKDF2 e sessões guardadas no D1.
// O navegador recebe só um token aleatório (cookie HttpOnly); no banco fica o hash dele.

export const COOKIE = 'sessao';
const DURACAO_SESSAO = 60 * 60 * 12;     // 12 horas
const ITERACOES = 100000;                // máximo aceito pelo PBKDF2 dos Workers
const MAX_FALHAS = 5;
const BLOQUEIO = 60 * 15;                // 15 minutos

const enc = new TextEncoder();

function b64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
function deB64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
function agora() { return Math.floor(Date.now() / 1000); }

async function pbkdf2(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256);
}

// formato: pbkdf2$<iterações>$<sal base64>$<hash base64>
export async function gerarHashSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${b64(sal)}$${b64(hash)}`;
}

export async function conferirSenha(senha, guardado) {
  const [tipo, it, sal, hash] = String(guardado || '').split('$');
  if (tipo !== 'pbkdf2' || !it || !sal || !hash) return false;
  const calculado = new Uint8Array(await pbkdf2(senha, deB64(sal), Number(it)));
  const esperado = deB64(hash);
  if (calculado.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < calculado.length; i++) dif |= calculado[i] ^ esperado[i];
  return dif === 0;
}

async function sha256(texto) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export function lerCookie(request, nome) {
  const cab = request.headers.get('Cookie') || '';
  for (const parte of cab.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

function cookieSessao(request, valor, maxAge) {
  const seguro = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${seguro}`;
}

export async function criarSessao(db, request, usuarioId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
  await db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)')
    .bind(await sha256(token), usuarioId, agora() + DURACAO_SESSAO).run();
  // limpeza oportunista de sessões vencidas
  await db.prepare('DELETE FROM sessoes WHERE expira_em < ?').bind(agora()).run();
  return cookieSessao(request, token, DURACAO_SESSAO);
}

export async function encerrarSessao(db, request) {
  const token = lerCookie(request, COOKIE);
  if (token) await db.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(await sha256(token)).run();
  return cookieSessao(request, '', 0);
}

// Devolve { id, usuario, nome, papel } ou null.
export async function usuarioDaSessao(db, request) {
  const token = lerCookie(request, COOKIE);
  if (!token) return null;
  return db.prepare(
    `SELECT u.id, u.usuario, u.nome, u.papel
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`
  ).bind(await sha256(token), agora()).first();
}

// ---- limite de tentativas por usuário ----
export async function estaBloqueado(db, usuario) {
  const r = await db.prepare('SELECT bloqueado_ate FROM tentativas_login WHERE usuario = ?').bind(usuario).first();
  return r && r.bloqueado_ate > agora() ? r.bloqueado_ate - agora() : 0;
}

export async function registrarFalha(db, usuario) {
  await db.prepare(
    `INSERT INTO tentativas_login (usuario, falhas, bloqueado_ate) VALUES (?1, 1, 0)
     ON CONFLICT(usuario) DO UPDATE SET
       falhas = CASE WHEN bloqueado_ate > 0 AND bloqueado_ate <= ?2 THEN 1 ELSE falhas + 1 END,
       bloqueado_ate = CASE WHEN (CASE WHEN bloqueado_ate > 0 AND bloqueado_ate <= ?2 THEN 1 ELSE falhas + 1 END) >= ?3
                            THEN ?2 + ?4 ELSE 0 END`
  ).bind(usuario, agora(), MAX_FALHAS, BLOQUEIO).run();
}

export async function limparFalhas(db, usuario) {
  await db.prepare('DELETE FROM tentativas_login WHERE usuario = ?').bind(usuario).run();
}

export function json(dados, status = 200, extras = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extras }
  });
}
