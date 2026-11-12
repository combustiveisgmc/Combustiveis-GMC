import { usuarioDaSessao, json } from '../../../lib/auth.js';
import { pode } from '../../../lib/permissoes.js';

// Dashboards > Contratos x ANP: contratos cadastrados no portal (unidade, estado de referência da ANP e data do contrato).
// GET  -> {contratos: [{id, unidade, uf, data_contrato, produto, observacao, ativo, ...}], podeEditar}   (permissão contratos-anp)
// POST {acao: 'salvar', id?, unidade, uf, data_contrato, produto?, observacao?, ativo?} · {acao: 'excluir', id}   (contratos-anp-editar)
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const agora = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";
const contrato = (r) => ({ id: r.id, unidade: r.unidade, uf: r.uf, data_contrato: r.data_contrato, produto: r.produto, observacao: r.observacao, ativo: r.ativo === 1,
  criado_por: r.criado_por, criado_em: r.criado_em, atualizado_por: r.atualizado_por, atualizado_em: r.atualizado_em });

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  if (!pode(u, 'contratos-anp')) return json({ erro: 'Seu acesso não inclui os Contratos x ANP.' }, 403);
  const { results } = await env.DB.prepare('SELECT * FROM contratos_anp ORDER BY unidade COLLATE NOCASE, id').all();
  return json({ contratos: results.map(contrato), podeEditar: pode(u, 'contratos-anp-editar') });
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'contratos-anp-editar')) return json({ erro: 'Seu acesso aos Contratos x ANP é só de consulta.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const quem = u.nome || u.usuario, id = Number(d.id);
  if (d.acao === 'excluir') {
    if (!Number.isInteger(id)) return json({ erro: 'Contrato inválido.' }, 400);
    await env.DB.prepare('DELETE FROM contratos_anp WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (d.acao !== 'salvar') return json({ erro: 'Ação desconhecida.' }, 400);
  const unidade = String(d.unidade || '').trim().slice(0, 80);
  const uf = String(d.uf || '').toUpperCase();
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(d.data_contrato || '')) ? d.data_contrato : null;
  const produto = String(d.produto || 'OLEO DIESEL S10').trim().slice(0, 60) || 'OLEO DIESEL S10';
  const observacao = String(d.observacao || '').trim().slice(0, 300) || null;
  const erros = [];
  if (!unidade) erros.push('Informe a unidade.');
  if (!UFS.includes(uf)) erros.push('Escolha o estado de referência da ANP.');
  if (!data) erros.push('Informe a data do contrato.');
  if (erros.length) return json({ erro: erros.join(' ') }, 400);
  const campos = [unidade, uf, data, produto, observacao, d.ativo === false ? 0 : 1, quem];
  let r;
  if (Number.isInteger(id) && id > 0) {
    r = await env.DB.prepare(`UPDATE contratos_anp SET unidade = ?, uf = ?, data_contrato = ?, produto = ?, observacao = ?, ativo = ?, atualizado_por = ?, atualizado_em = ${agora}
      WHERE id = ? RETURNING *`).bind(...campos, id).first();
    if (!r) return json({ erro: 'Esse contrato não existe mais.' }, 404);
  } else {
    r = await env.DB.prepare('INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, observacao, ativo, criado_por, atualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *')
      .bind(...campos, quem).first();
  }
  return json({ ok: true, contrato: contrato(r) });
}
