import { usuarioDaSessao, json } from '../../../../lib/auth.js';
import { pode } from '../../../../lib/permissoes.js';

// POST /api/cartoes/alertas/:id   {acao: 'resolver' | 'reabrir', nota?}   aviso de cartão faltando enviado pelo motorista
export async function onRequestPost({ request, env, params }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'cartoes-frota-editar')) return json({ erro: 'Seu acesso ao controle dos cartões é só de consulta.' }, 403);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ erro: 'Aviso inválido.' }, 400);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const nota = String(corpo.nota || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  let r;
  if (corpo.acao === 'resolver') {
    r = await env.DB.prepare(`UPDATE alertas_cartoes SET estado = 'resolvido', resolvido_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        resolvido_por = ?, nota = ? WHERE id = ? RETURNING id, estado, resolvido_em, resolvido_por, nota`).bind(u.nome, nota, id).first();
  } else if (corpo.acao === 'reabrir') {
    r = await env.DB.prepare(`UPDATE alertas_cartoes SET estado = 'aberto', resolvido_em = NULL, resolvido_por = NULL, nota = NULL
        WHERE id = ? RETURNING id, estado, resolvido_em, resolvido_por, nota`).bind(id).first();
  } else {
    return json({ erro: 'Ação desconhecida.' }, 400);
  }
  if (!r) return json({ erro: 'Aviso não encontrado.' }, 404);
  return json({ ok: true, alerta: r });
}
