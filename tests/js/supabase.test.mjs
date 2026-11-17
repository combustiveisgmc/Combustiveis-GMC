// Banco nas Functions (lib/supabase.js) e lista do cadastro de placas vinda do banco com a planilha de reserva
// (functions/api/cadastros/[tipo].js). Sem rede: o fetch é trocado por um falso.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rpc, temBanco } from '../../lib/supabase.js';
import { lista } from '../../functions/api/cadastros/[tipo].js';

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });
const env = (extra = {}) => ({ SUPABASE_URL: 'https://exemplo.supabase.co/', SUPABASE_KEY: 'chave-teste',
  DADOS: { get: async () => ({ atualizadoEm: '2026-11-16T10:00:00Z', placas: [{ placa: 'KVK0001' }], motoristas: [{ nome: 'X' }] }) }, ...extra });

test('sem segredos não chama o banco', async () => {
  let chamou = false;
  const r = await rpc({}, 'gestao_placas', {}, { fetchFn: async () => { chamou = true; } });
  assert.equal(r, null);
  assert.equal(chamou, false);
  assert.equal(temBanco({ SUPABASE_URL: 'x' }), false);
});

test('chama a função pela API REST com a chave no cabeçalho', async () => {
  let pedido;
  const r = await rpc(env(), 'gestao_placas', { a: 1 }, { fetchFn: async (url, op) => { pedido = { url, op }; return new Response('{"ok":true}', { status: 200 }); } });
  assert.deepEqual(r, { ok: true });
  assert.equal(pedido.url, 'https://exemplo.supabase.co/rest/v1/rpc/gestao_placas');
  assert.equal(pedido.op.headers.apikey, 'chave-teste');
  assert.equal(pedido.op.body, '{"a":1}');
});

test('erro HTTP, rede fora ou nome de função estranho', async () => {
  assert.equal(await rpc(env(), 'gestao_placas', {}, { fetchFn: async () => new Response('x', { status: 401 }) }), null);
  assert.equal(await rpc(env(), 'gestao_placas', {}, { fetchFn: async () => { throw new Error('sem rede'); } }), null);
  await assert.rejects(() => rpc(env(), 'drop_table', {}));
});

test('placas: lista do banco quando ele responde', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ atualizadoEm: '2026-11-17T11:00:00Z', placas: [{ placa: 'AAA1A11', situacao: 'VENDIDO' }] }));
  const r = await lista(env(), 'placas');
  assert.equal(r.fonte, 'banco');
  assert.equal(r.itens[0].placa, 'AAA1A11');
});

test('placas: banco fora do ar ou vazio -> lista da planilha', async () => {
  globalThis.fetch = async () => new Response('erro', { status: 500 });
  let r = await lista(env(), 'placas');
  assert.equal(r.fonte, 'planilha');
  assert.equal(r.itens[0].placa, 'KVK0001');
  globalThis.fetch = async () => new Response(JSON.stringify({ placas: [] }));
  r = await lista(env(), 'placas');
  assert.equal(r.fonte, 'planilha');
});

test('motoristas continuam na planilha (as senhas dos cartões ficam lá)', async () => {
  let chamou = false;
  globalThis.fetch = async () => { chamou = true; return new Response('{}'); };
  const r = await lista(env(), 'motoristas');
  assert.equal(r.fonte, 'planilha');
  assert.equal(chamou, false);
});
