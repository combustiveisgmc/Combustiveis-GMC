import { usuarioDaSessao, json } from '../../lib/auth.js';
import { pode } from '../../lib/permissoes.js';
import { rpc, temBanco } from '../../lib/supabase.js';
import { TELAS, pedidoValido, listasDaTela } from '../../lib/opcoes-cadastro.js';

// Cadastros auxiliares da engrenagem dos formulários. Desde 18/11/2026 são tabelas no banco (Supabase, esquema `cadastro`:
// unidades, categorias de veículo, marcas, avisos de posto, produtos de contrato), as mesmas em todo o portal.
// GET  /api/opcoes?tela=cadastro-placas  -> {opcoes: {campo: [nomes ativos]}, registros: {campo: [{id, nome, ativa, ...}]}, podeEditar}
// POST /api/opcoes {tela, campo, acao: adicionar|renomear|ativar|desativar|editar, id?, dados: {nome?, nome_curto?, centro_custo?,
//      empresa?, operacional?}}  -> o mesmo do GET, já com a mudança
async function listar(env, tela) {
  const listas = await rpc(env, 'gestao_cadastro_listas', {}, { ms: 10000 });
  return listas && typeof listas === 'object' ? listasDaTela(tela, listas) : null;
}

export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  const tela = new URL(request.url).searchParams.get('tela') || '';
  const t = TELAS[tela];
  if (!t) return json({ erro: 'Tela desconhecida.' }, 404);
  if (!pode(u, ...t.ver, t.editar)) return json({ erro: 'Seu acesso não inclui esta tela.' }, 403);
  if (!temBanco(env)) return json({ erro: 'O banco de dados não está configurado no portal.' }, 503);
  const l = await listar(env, tela);
  if (!l) return json({ erro: 'O banco de dados não respondeu. Tente de novo em instantes.' }, 502);
  return json({ ...l, podeEditar: pode(u, t.editar) });
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const p = pedidoValido(d, (perm) => pode(u, perm));
  if (p.erro) return json({ erro: p.erro }, p.status);
  if (!temBanco(env)) return json({ erro: 'O banco de dados não está configurado no portal.' }, 503);
  const v = p.valor;
  const r = await rpc(env, 'gestao_cadastro_salvar', { p_tipo: v.tipo, p_acao: v.acao, p_id: v.id, p_dados: v.dados }, { ms: 10000 });
  if (!r) return json({ erro: 'O banco de dados não respondeu. Tente de novo em instantes.' }, 502);
  if (!r.ok) return json({ erro: r.erro || 'Não foi possível gravar.' }, 400);
  const l = await listar(env, d.tela);
  return json({ ok: true, id: r.id, ...(l || {}), podeEditar: true });
}
