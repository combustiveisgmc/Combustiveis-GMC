// Cadastros auxiliares da engrenagem (18/11/2026): eram listas de texto no D1; agora são tabelas no banco (Supabase, esquema
// cadastro: unidades, categorias, marcas, avisos, produtos), as mesmas em todo o portal. Catálogo e validação
// (lib/opcoes-cadastro.js), API (functions/api/opcoes.js, banco simulado) e a lista que os formulários usam. Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, pedidoValido, listasDaTela, MAX_TEXTO } from '../../lib/opcoes-cadastro.js';
import { listaEfetiva, temConfig } from '../../public/gestao/lib/opcoes.js';
import { onRequestGet, onRequestPost } from '../../functions/api/opcoes.js';

test('catálogo: só campos que são cadastro; situação/plataforma/combustível ficam fora', () => {
  assert.deepEqual(TELAS['cadastro-placas'].campos, ['categoria', 'unidade', 'marca']);
  for (const t of Object.values(TELAS)) {
    for (const proibido of ['situacao', 'status', 'plataforma', 'combustivel', 'tipo']) assert.ok(!t.campos.includes(proibido), proibido);
    assert.ok(t.editar.endsWith('-editar'));
  }
});

test('pedidoValido: tela, permissão, campo, ação, id e nome', () => {
  const pode = () => true, naoPode = () => false;
  assert.deepEqual(pedidoValido({ tela: 'cadastro-placas', campo: 'categoria', acao: 'adicionar', dados: { nome: '  Cavalo   mecânico ' } }, pode).valor,
    { tipo: 'categoria', acao: 'adicionar', id: null, dados: { nome: 'Cavalo mecânico' } });
  assert.equal(pedidoValido({ tela: 'outra' }, pode).status, 404);
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'categoria', acao: 'adicionar', dados: { nome: 'X' } }, naoPode).status, 403);
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'situacao', acao: 'adicionar', dados: { nome: 'X' } }, pode).status, 400);
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'categoria', acao: 'apagar', id: 1 }, pode).status, 400);
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'categoria', acao: 'desativar' }, pode).status, 400);      // sem id
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'categoria', acao: 'renomear', id: 3, dados: { nome: ' ' } }, pode).status, 400);
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'categoria', acao: 'adicionar', dados: { nome: 'A'.repeat(MAX_TEXTO + 1) } }, pode).status, 400);
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'marca', acao: 'editar', id: 1, dados: {} }, pode).status, 400);   // só unidade
  assert.equal(pedidoValido({ tela: 'cadastro-placas', campo: 'unidade', acao: 'editar', id: 1, dados: { centro_custo: '0203001' } }, pode).valor.acao, 'editar');
});

test('listasDaTela: os formulários recebem só os ativos; a engrenagem vê todos', () => {
  const l = listasDaTela('cadastro-placas', { categoria: [{ id: 1, nome: 'TRUCK', ativa: true }, { id: 2, nome: 'TOCO', ativa: false }],
    unidade: [{ id: 12, nome: 'RAJA JEQUIE', ativa: true }], marca: [] });
  assert.deepEqual(l.opcoes, { categoria: ['TRUCK'], unidade: ['RAJA JEQUIE'], marca: [] });
  assert.equal(l.registros.categoria.length, 2);
});

test('listaEfetiva: o cadastro manda; banco fora do ar = sugestões dos dados', () => {
  const opc = { opcoes: { categoria: ['TRUCK', 'CAVALO'] } };
  assert.deepEqual(listaEfetiva(opc, 'categoria', ['TOCO']), ['TRUCK', 'CAVALO']);
  assert.deepEqual(listaEfetiva({ opcoes: {} }, 'marca', ['MB']), ['MB']);
  assert.equal(temConfig(opc, 'categoria'), true);
  assert.equal(temConfig(opc, 'marca'), false);
});

// API com o banco simulado: a sessão vem do D1 (lib/auth.js); as listas e a gravação, das funções do Supabase
function envCom(usuario) {
  return { SUPABASE_URL: 'https://banco.exemplo', SUPABASE_KEY: 'chave-de-teste',
    DB: { prepare: () => { const st = { bind: () => st, first: async () => usuario }; return st; } } };
}
const pedido = (metodo, corpo) => new Request('https://exemplo.test/api/opcoes?tela=cadastro-placas', {
  method: metodo, headers: { cookie: 'sessao=abc', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
const login = (papel, perms = []) => ({ id: 1, usuario: 'teste', nome: 'Teste', papel, trocar_senha: 0, permissoes: JSON.stringify(perms), funcao_id: null, funcao_permissoes: null });
const LISTAS = { unidade: [{ id: 12, nome: 'RAJA JEQUIE', ativa: true }], categoria: [{ id: 1, nome: 'TRUCK', ativa: true }], marca: [], aviso: [], produto: [] };

async function comBanco(responder, fn) {
  const original = globalThis.fetch, chamadas = [];
  globalThis.fetch = async (url, op) => {
    const funcao = String(url).split('/rpc/')[1];
    chamadas.push({ funcao, args: JSON.parse(op.body) });
    return new Response(JSON.stringify(responder(funcao)), { status: 200 });
  };
  try { await fn(chamadas); } finally { globalThis.fetch = original; }
}

test('API: lê do banco e grava pela função do cadastro', async () => {
  await comBanco((f) => (f === 'gestao_cadastro_listas' ? LISTAS : { ok: true, id: 9 }), async (chamadas) => {
    const g = await (await onRequestGet({ request: pedido('GET'), env: envCom(login('admin')) })).json();
    assert.deepEqual(g.opcoes.unidade, ['RAJA JEQUIE']);
    assert.equal(g.podeEditar, true);
    const p = await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'categoria', acao: 'adicionar', dados: { nome: 'bitruck' } }), env: envCom(login('admin')) });
    assert.equal(p.status, 200);
    const grav = chamadas.find((c) => c.funcao === 'gestao_cadastro_salvar');
    assert.deepEqual(grav.args, { p_tipo: 'categoria', p_acao: 'adicionar', p_id: null, p_dados: { nome: 'bitruck' } });
  });
});

test('API: erro do banco (nome repetido) volta como 400; quem só consulta lê mas não grava; sem sessão, 401', async () => {
  await comBanco((f) => (f === 'gestao_cadastro_listas' ? LISTAS : { ok: false, erro: 'TRUCK já está cadastrado.' }), async () => {
    const r = await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'categoria', acao: 'adicionar', dados: { nome: 'truck' } }), env: envCom(login('admin')) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).erro, /já está cadastrado/);
    const consulta = login('gestor', ['cadastro-placas']);
    const g = await onRequestGet({ request: pedido('GET'), env: envCom(consulta) });
    assert.equal(g.status, 200);
    assert.equal((await g.json()).podeEditar, false);
    assert.equal((await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'categoria', acao: 'adicionar', dados: { nome: 'X' } }), env: envCom(consulta) })).status, 403);
    assert.equal((await onRequestGet({ request: pedido('GET'), env: envCom(null) })).status, 401);
  });
});
