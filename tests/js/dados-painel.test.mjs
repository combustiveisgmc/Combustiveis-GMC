// Dados dos painéis vindos do banco (19/11/2026): junta a parte dos abastecimentos (banco) com o que ainda vem das planilhas
// (KV abastecimentos-extras), guarda por versão e cai para a planilha quando o banco não tem os dados. Banco e KV simulados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juntarJson, abastecimentosDoBanco, fonteBanco } from '../../lib/dados-painel.js';

test('juntarJson: une dois objetos sem transformar o texto', () => {
  assert.deepEqual(JSON.parse(juntarJson('{"linhas":2,"col":{"data":[1,2]}}', '{"locais":{},"orcamento":null}')),
    { linhas: 2, col: { data: [1, 2] }, locais: {}, orcamento: null });
  assert.equal(juntarJson('{"a":1}', '{}'), '{"a":1}');
  assert.throws(() => juntarJson('[1]', '{}'));
});

function kvFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial).map(([k, v]) => [k, { value: v, metadata: null }]));
  return {
    m,
    async get(k, tipo) { const x = m.get(k); if (!x) return null; return tipo === 'json' ? JSON.parse(x.value) : x.value; },
    async getWithMetadata(k) { const x = m.get(k); return x ? { value: x.value, metadata: x.metadata } : { value: null, metadata: null }; },
    async put(k, v, op = {}) { m.set(k, { value: v, metadata: op.metadata || null }); },
  };
}
async function comBanco(respostas, fn) {
  const original = globalThis.fetch, chamadas = [];
  globalThis.fetch = async (url) => {
    const f = String(url).split('/rpc/')[1]; chamadas.push(f);
    const r = respostas[f];
    return r === undefined ? new Response('erro', { status: 500 }) : new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
  };
  try { await fn(chamadas); } finally { globalThis.fetch = original; }
}
const ENV = (kv) => ({ SUPABASE_URL: 'https://banco.exemplo', SUPABASE_KEY: 'chave', DADOS: kv });

test('abastecimentosDoBanco: monta, guarda por versão e reaproveita enquanto a versão não muda', async () => {
  const kv = kvFalso({ versao: '{"versao":"20261119080000"}', 'abastecimentos-extras': '{"locais":{"POSTO X":[1,2]}}', 'abastecimentos-fonte': 'banco' });
  const env = ENV(kv);
  await comBanco({ gestao_dados_painel_versao: { versao: '20261119084624' }, gestao_dados_painel: '{"linhas":1,"col":{"data":[20411]}}' }, async (chamadas) => {
    assert.equal(await fonteBanco(env), true);
    const a = await abastecimentosDoBanco(env);
    assert.equal(a.etag, '"b20261119084624-20261119080000"');
    assert.deepEqual(JSON.parse(a.corpo), { linhas: 1, col: { data: [20411] }, locais: { 'POSTO X': [1, 2] } });
    const b = await abastecimentosDoBanco(env);   // mesma versão: vem do KV, sem buscar o arquivo no banco de novo
    assert.equal(b.etag, a.etag);
    assert.equal(chamadas.filter((c) => c === 'gestao_dados_painel').length, 1);
  });
});

test('sem dados no banco (ou chave desligada): devolve null e o portal usa a planilha', async () => {
  const kv = kvFalso({ versao: '{"versao":"1"}', 'abastecimentos-extras': '{}' });
  await comBanco({}, async () => {
    assert.equal(await abastecimentosDoBanco(ENV(kv)), null);
    assert.equal(await fonteBanco(ENV(kv)), false);              // chave não está em "banco"
    assert.equal(await fonteBanco({ DADOS: kv }), false);        // sem banco configurado
  });
});
