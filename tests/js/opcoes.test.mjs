// Opções configuráveis dos cadastros (engrenagem, 18/11/2026): catálogo e limpeza no servidor (lib/opcoes-cadastro.js), API
// (functions/api/opcoes.js) e escolha da lista no site (public/gestao/lib/opcoes.js). Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TELAS, limparValores, MAX_TEXTO } from '../../lib/opcoes-cadastro.js';
import { listaEfetiva, temConfig } from '../../public/gestao/lib/opcoes.js';
import { onRequestGet, onRequestPost } from '../../functions/api/opcoes.js';

test('catálogo: só campos que são rótulo; situação/plataforma/combustível ficam fora', () => {
  assert.deepEqual(TELAS['cadastro-placas'].campos, ['categoria', 'unidade', 'marca']);
  for (const t of Object.values(TELAS)) {
    for (const proibido of ['situacao', 'status', 'plataforma', 'combustivel', 'tipo']) assert.ok(!t.campos.includes(proibido), proibido);
    assert.ok(t.editar.endsWith('-editar'));
  }
});

test('limparValores: espaços, repetidas (sem diferença de acento/maiúscula) e vazias', () => {
  assert.deepEqual(limparValores(['  CAVALO ', 'Cavalo', 'TRUCK', '', null, 'Caminhão', 'CAMINHAO']).valores, ['CAVALO', 'TRUCK', 'Caminhão']);
  assert.ok(limparValores('x').erro);
  assert.ok(limparValores(['A'.repeat(MAX_TEXTO + 1)]).erro);
  assert.deepEqual(limparValores([]).valores, []);
});

test('listaEfetiva: a configurada manda; sem ela, as de antes', () => {
  const opc = { opcoes: { categoria: ['TRUCK', 'CAVALO'] } };
  assert.deepEqual(listaEfetiva(opc, 'categoria', ['TOCO']), ['TRUCK', 'CAVALO']);
  assert.deepEqual(listaEfetiva(opc, 'marca', ['MB']), ['MB']);
  assert.deepEqual(listaEfetiva({ opcoes: { marca: [] } }, 'marca', ['MB']), ['MB']);
  assert.equal(temConfig(opc, 'categoria'), true);
  assert.equal(temConfig(opc, 'marca'), false);
});

// D1 falso: a consulta da sessão (lib/auth.js) devolve o usuário; opcoes_cadastro fica num Map
function d1Falso(usuario) {
  const linhas = new Map();
  return {
    prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; } };
      st.first = async () => (sql.includes('FROM sessoes') ? usuario : null);
      st.all = async () => ({ results: [...linhas.entries()].filter(([k]) => k.startsWith(st.args[0] + '|')).map(([k, v]) => ({ campo: k.split('|')[1], valores: v })) });
      st.run = async () => {
        if (sql.startsWith('DELETE')) linhas.delete(st.args[0] + '|' + st.args[1]);
        else linhas.set(st.args[0] + '|' + st.args[1], st.args[2]);
        return {};
      };
      return st;
    },
  };
}
const pedido = (metodo, corpo) => new Request('https://exemplo.test/api/opcoes?tela=cadastro-placas', {
  method: metodo, headers: { cookie: 'sessao=abc', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
const admin = { id: 1, usuario: 'teste', nome: 'Teste', papel: 'admin', trocar_senha: 0, permissoes: '[]', funcao_id: null, funcao_permissoes: null };

test('API: grava (limpa) e lê; campo fora do catálogo é recusado', async () => {
  const env = { DB: d1Falso(admin) };
  const p = await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'categoria', valores: ['TRUCK', 'truck', 'CAVALO'] }), env });
  assert.equal(p.status, 200);
  assert.deepEqual((await p.json()).valores, ['TRUCK', 'CAVALO']);
  const g = await onRequestGet({ request: pedido('GET'), env });
  const j = await g.json();
  assert.deepEqual(j.opcoes.categoria, ['TRUCK', 'CAVALO']);
  assert.equal(j.podeEditar, true);
  assert.equal((await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'situacao', valores: ['X'] }), env })).status, 400);
  assert.equal((await onRequestPost({ request: pedido('POST', { tela: 'outra', campo: 'x', valores: [] }), env })).status, 404);
  // lista vazia volta às opções de antes
  await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'categoria', valores: [] }), env });
  assert.deepEqual((await (await onRequestGet({ request: pedido('GET'), env })).json()).opcoes, {});
});

test('API: quem só consulta lê mas não grava; sem sessão, 401', async () => {
  const consulta = { ...admin, papel: 'gestor', permissoes: '["cadastro-placas"]' };
  const env = { DB: d1Falso(consulta) };
  const g = await onRequestGet({ request: pedido('GET'), env });
  assert.equal(g.status, 200);
  assert.equal((await g.json()).podeEditar, false);
  assert.equal((await onRequestPost({ request: pedido('POST', { tela: 'cadastro-placas', campo: 'categoria', valores: ['X'] }), env })).status, 403);
  assert.equal((await onRequestGet({ request: pedido('GET'), env: { DB: d1Falso(null) } })).status, 401);
});
