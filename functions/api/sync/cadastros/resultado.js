import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia informa o resultado de cada alteração: aplicada (com a linha), aguardando (planilha aberta) ou erro.
// As senhas dos cartões ficam como foram digitadas (até 10/11/2026 viravam "••••" aqui, e o cadastro nos cartões recebia isso).
export async function onRequestPost({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const itens = (Array.isArray(corpo.itens) ? corpo.itens.slice(0, 100) : [])
    .filter((i) => Number.isInteger(i.id) && ['aplicada', 'aguardando', 'erro'].includes(i.estado));
  const agora = new Date().toISOString().slice(0, 19) + 'Z';
  const stmts = [];
  for (const i of itens) {
    const msg = i.mensagem ? String(i.mensagem).slice(0, 300) : null;
    const linha = Number.isInteger(i.linha) ? i.linha : null;
    if (i.estado === 'aplicada') {
      stmts.push(env.DB.prepare('UPDATE alteracoes_cadastros SET estado = ?, mensagem = ?, aplicada_em = ?, linha = ? WHERE id = ?')
        .bind('aplicada', msg, agora, linha, i.id));
    } else {
      stmts.push(env.DB.prepare('UPDATE alteracoes_cadastros SET estado = ?, mensagem = ?, linha = ? WHERE id = ?')
        .bind(i.estado, msg, linha, i.id));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, atualizados: stmts.length });
}
