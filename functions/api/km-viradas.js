import { usuarioDaSessao, json } from '../../lib/auth.js';
import { pode } from '../../lib/permissoes.js';

// Consulta de KM: hodômetros que viraram 1 milhão (passaram de 999.999 para 0).
// GET  /api/km-viradas                        lista
// POST /api/km-viradas {placa, dia, desfazer?}  marca (ou desfaz) a virada da placa no dia (dias desde 01/01/1970)
const normPlaca = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'consulta-km')) return json({ erro: 'Seu acesso não inclui a consulta de KM.' }, 403);
  const { results } = await env.DB.prepare('SELECT placa, dia, usuario_nome, criado_em FROM km_viradas ORDER BY placa, dia').all();
  return json({ viradas: results });
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'consulta-km')) return json({ erro: 'Seu acesso não inclui a consulta de KM.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const placa = normPlaca(d.placa);
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) || !Number.isInteger(d.dia) || d.dia < 15000 || d.dia > 40000) {
    return json({ erro: 'Placa ou data inválida.' }, 400);
  }
  if (d.desfazer) {
    await env.DB.prepare('DELETE FROM km_viradas WHERE placa = ? AND dia = ?').bind(placa, d.dia).run();
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO km_viradas (placa, dia, usuario_nome) VALUES (?, ?, ?)').bind(placa, d.dia, u.nome).run();
  }
  const { results } = await env.DB.prepare('SELECT placa, dia, usuario_nome, criado_em FROM km_viradas ORDER BY placa, dia').all();
  return json({ ok: true, viradas: results });
}
