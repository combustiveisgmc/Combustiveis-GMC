import { json } from '../../../lib/auth.js';
import { exigirAdmin } from '../../../lib/usuarios.js';
import { limparPermissoes } from '../../../lib/permissoes.js';

// Funções (perfis de acesso), só administradores. A lista vem junto com GET /api/usuarios.
//   POST   /api/funcoes        {nome, descricao, permissoes}   cria
//   PUT    /api/funcoes/:id    {nome, descricao, permissoes}   edita (vale na hora para os logins com essa função)
//   DELETE /api/funcoes/:id    exclui; os logins com ela passam a "personalizado" com as mesmas permissões
function validar(d) {
  const erros = [];
  const nome = String(d.nome || '').replace(/\s+/g, ' ').trim();
  const descricao = String(d.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const permissoes = limparPermissoes(d.permissoes);
  if (nome.length < 2 || nome.length > 60) erros.push('Dê um nome à função (até 60 caracteres).');
  if (!permissoes.length) erros.push('Marque pelo menos uma página para a função.');
  return { dados: { nome, descricao, permissoes }, erros };
}
const idDe = (params) => { const v = Array.isArray(params.id) ? params.id[0] : params.id; const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

async function lerCorpo(request) { try { return await request.json(); } catch { return null; } }

export async function onRequestPost({ request, env, params }) {
  const { erro } = await exigirAdmin(request, env, true);
  if (erro) return erro;
  if (idDe(params)) return json({ erro: 'Use PUT para editar uma função.' }, 405);
  const corpo = await lerCorpo(request);
  if (!corpo) return json({ erro: 'Dados inválidos.' }, 400);
  const { dados, erros } = validar(corpo);
  if (erros.length) return json({ erro: erros.join(' ') }, 400);
  const existe = await env.DB.prepare('SELECT id FROM funcoes WHERE nome = ? COLLATE NOCASE').bind(dados.nome).first();
  if (existe) return json({ erro: 'Já existe uma função "' + dados.nome + '".' }, 409);
  const r = await env.DB.prepare('INSERT INTO funcoes (nome, descricao, permissoes) VALUES (?, ?, ?) RETURNING id')
    .bind(dados.nome, dados.descricao, JSON.stringify(dados.permissoes)).first();
  return json({ ok: true, id: r.id }, 201);
}

export async function onRequestPut({ request, env, params }) {
  const { erro } = await exigirAdmin(request, env, true);
  if (erro) return erro;
  const id = idDe(params);
  if (!id) return json({ erro: 'Função não encontrada.' }, 404);
  const corpo = await lerCorpo(request);
  if (!corpo) return json({ erro: 'Dados inválidos.' }, 400);
  const { dados, erros } = validar(corpo);
  if (erros.length) return json({ erro: erros.join(' ') }, 400);
  const outra = await env.DB.prepare('SELECT id FROM funcoes WHERE nome = ? COLLATE NOCASE AND id <> ?').bind(dados.nome, id).first();
  if (outra) return json({ erro: 'Já existe outra função "' + dados.nome + '".' }, 409);
  const r = await env.DB.prepare("UPDATE funcoes SET nome = ?, descricao = ?, permissoes = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(dados.nome, dados.descricao, JSON.stringify(dados.permissoes), id).run();
  if (!r.meta.changes) return json({ erro: 'Função não encontrada.' }, 404);
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const { erro } = await exigirAdmin(request, env, true);
  if (erro) return erro;
  const id = idDe(params);
  const f = id ? await env.DB.prepare('SELECT id, permissoes FROM funcoes WHERE id = ?').bind(id).first() : null;
  if (!f) return json({ erro: 'Função não encontrada.' }, 404);
  // quem tinha a função não perde acesso: vira personalizado com as mesmas permissões
  const r = await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET permissoes = ?, funcao_id = NULL WHERE funcao_id = ?').bind(f.permissoes, id),
    env.DB.prepare('DELETE FROM funcoes WHERE id = ?').bind(id),
  ]);
  return json({ ok: true, loginsAjustados: r[0].meta.changes });
}
