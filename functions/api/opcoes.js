import { usuarioDaSessao, json } from '../../lib/auth.js';
import { pode } from '../../lib/permissoes.js';
import { TELAS, limparValores } from '../../lib/opcoes-cadastro.js';

// Opções configuráveis dos cadastros (engrenagem dentro do formulário de cada cadastro; 18/11/2026).
// GET  /api/opcoes?tela=cadastro-placas     {opcoes: {campo: [valores]}, podeEditar}   (quem vê a tela)
// POST /api/opcoes {tela, campo, valores[]}  grava a lista do campo; valores vazios = volta às opções de antes (apaga a linha)
export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  const tela = new URL(request.url).searchParams.get('tela') || '';
  const t = TELAS[tela];
  if (!t) return json({ erro: 'Tela desconhecida.' }, 404);
  if (!pode(u, ...t.ver, t.editar)) return json({ erro: 'Seu acesso não inclui esta tela.' }, 403);
  const { results } = await env.DB.prepare('SELECT campo, valores FROM opcoes_cadastro WHERE tela = ?').bind(tela).all();
  const opcoes = {};
  for (const r of results) {
    if (!t.campos.includes(r.campo)) continue;
    try { const v = JSON.parse(r.valores); if (Array.isArray(v)) opcoes[r.campo] = v; } catch { /* linha estragada: ignora */ }
  }
  return json({ opcoes, podeEditar: pode(u, t.editar) });
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const t = TELAS[d.tela];
  if (!t) return json({ erro: 'Tela desconhecida.' }, 404);
  if (!pode(u, t.editar)) return json({ erro: 'Seu acesso a esta tela é só de consulta.' }, 403);
  if (!t.campos.includes(d.campo)) return json({ erro: 'Este campo não tem opções configuráveis.' }, 400);
  const r = limparValores(d.valores);
  if (r.erro) return json({ erro: r.erro }, 400);
  if (!r.valores.length) {
    await env.DB.prepare('DELETE FROM opcoes_cadastro WHERE tela = ? AND campo = ?').bind(d.tela, d.campo).run();
  } else {
    await env.DB.prepare(`INSERT INTO opcoes_cadastro (tela, campo, valores, atualizado_por) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (tela, campo) DO UPDATE SET valores = ?3, atualizado_por = ?4, atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`)
      .bind(d.tela, d.campo, JSON.stringify(r.valores), u.nome).run();
  }
  return json({ ok: true, campo: d.campo, valores: r.valores });
}
