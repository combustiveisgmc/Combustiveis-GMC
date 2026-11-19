// Tempo real das APIs dos cartões sem contar duas vezes (19/11/2026): com os painéis lendo do banco (que recebe o D-1), 17 e 18/11
// apareceram em dobro. A chave do portal (placa | minuto | litros×100) tem de ser a mesma do vigia (chaveTransacao) e do banco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveLinha } from '../../public/gestao/lib/tempo-real.js';
import { juntarTempoReal } from '../../public/gestao/lib/dados.js';
import { chaveTransacao } from '../../scripts/cartoes_api.mjs';

test('chaveLinha igual ao chaveTransacao do vigia (hora local guardada nos campos UTC)', () => {
  const quando = new Date(Date.UTC(2026, 10, 18, 14, 37, 59));   // 18/11/2026 14:37:59
  const dia = Math.floor(quando.getTime() / 864e5), seg = 14 * 3600 + 37 * 60 + 59;
  assert.equal(chaveLinha('pjg-7028', dia, seg, 545.06), chaveTransacao('PJG7028', quando, 545.06));
  assert.equal(chaveLinha('PJG7028', dia, seg, 545.06), 'PJG7028|' + Math.floor(quando.getTime() / 60000) + '|54506');
  assert.equal(chaveLinha('ABC1D23', 20000, null, null), 'ABC1D23|' + 20000 * 1440 + '|0');   // sem hora e sem litros
});

test('juntarTempoReal: a transação que a base já tem não entra; as novas entram no fim', () => {
  const base = [{ placa: 'ABC1D23', dia: 20410, seg: 3600, litros: 50 }, { placa: 'XYZ9A88', dia: 20410, seg: 7200, litros: 30 }];
  const tr = [
    { placa: 'abc-1d23', dia: 20410, seg: 3630, litros: 50.001, tempoReal: true },   // mesmo minuto e litros: repetida
    { placa: 'ABC1D23', dia: 20411, seg: 3600, litros: 50, tempoReal: true },        // outro dia: nova
  ];
  const linhas = [...base];
  assert.equal(juntarTempoReal(linhas, tr), 1);
  assert.equal(linhas.length, 3);
  assert.equal(linhas[2].dia, 20411);
});

// Área do motorista (15.2 passo 1b, 19/11/2026): abastecimentos do banco quando a chave "motorista-fonte" = "banco"; banco fora do
// ar = os grupos do KV do vigia; tempo real que o banco já tem não entra de novo.
import { onRequestGet as dadosMotorista } from '../../functions/api/motorista/dados.js';
import { COOKIE_MOTORISTA } from '../../lib/motoristas.js';

function ambiente({ fonte, banco, grupo }) {
  const kv = {
    'motorista-fonte': fonte,
    cadastros: { motoristas: [{ usuario: '123456', nome: 'João da Silva', unidade: 'RAJA SALVADOR' }] },
    'tempo-real': { linhas: 2, dic: { motorista: ['JOAO DA SILVA'], placa: ['ABC1D23'], combustivel: ['DIESEL'], fornecedor: ['POSTO'], cidade: ['X'] },
      col: { motorista: [0, 0], placa: [0, 0], combustivel: [0, 0], fornecedor: [0, 0], cidade: [0, 0], data: [20410, 20411], seg: [3600, 3600],
        litros: [50, 40], km: [300, 200], hodometro: [1000, 1200] }, geradoEm: 'agora' },
  };
  return {
    SUPABASE_URL: 'https://banco.exemplo', SUPABASE_KEY: 'chave',
    DADOS: { async get(k, tipo) { if (k.startsWith('painel-motoristas:')) return grupo; if (k === 'painel-veiculos') return { veiculos: {} };
      const v = kv[k]; return v === undefined ? null : tipo === 'json' || typeof v !== 'string' ? v : v; } },
    DB: { prepare(sql) { return { bind() { return this; },
      async first() { return /sessoes_motoristas/.test(sql) ? { usuario: '123456', nome: 'João da Silva' } : { propria: 1 }; },
      async all() { return { results: [] }; } }; } },
    _banco: banco,
  };
}
async function chamar(env) {
  const original = globalThis.fetch, chamadas = [];
  globalThis.fetch = async (url, op) => { chamadas.push([String(url).split('/rpc/')[1], JSON.parse(op.body)]);
    return env._banco === undefined ? new Response('x', { status: 500 }) : new Response(JSON.stringify(env._banco), { status: 200 }); };
  try {
    const r = await dadosMotorista({ request: new Request('https://portal/api/motorista/dados', { headers: { Cookie: COOKIE_MOTORISTA + '=abc' } }), env });
    return { corpo: await r.json(), chamadas };
  } finally { globalThis.fetch = original; }
}

test('área do motorista: do banco, com veículos do cadastro, sem repetir o tempo real', async () => {
  const banco = { geradoEm: '2026-11-19T14:02:51', veiculos: { ABC1D23: { categoria: 'TRUCK', modelo: 'X', meta: 2.5 } },
    linhas: [[20410, 3600, 'ABC1D23', 'DIESEL', 'POSTO', 'X', 50, 300, 1000, 1]] };
  const { corpo, chamadas } = await chamar({ ...ambiente({ fonte: 'banco' }), _banco: banco });
  assert.deepEqual(chamadas, [['gestao_painel_motorista', { p_nome: 'João da Silva' }]]);
  assert.equal(corpo.geradoEm, '2026-11-19T14:02:51');
  assert.deepEqual(corpo.linhas.map((l) => [l.dia, l.tempoReal]), [[20410, false], [20411, true]]);   // 20410 do tempo real = repetido
  assert.equal(corpo.veiculos.ABC1D23.meta, 2.5);
});

test('área do motorista: banco fora do ar ou chave desligada -> grupos do vigia (KV)', async () => {
  const grupo = { geradoEm: 'kv', motoristas: { 'JOAO DA SILVA': [[20409, 0, 'ABC1D23', 'DIESEL', 'POSTO', 'X', 10, 100, 900, 1]] } };
  const fora = await chamar({ ...ambiente({ fonte: 'banco', grupo }), _banco: undefined });
  assert.equal(fora.corpo.geradoEm, 'kv');
  assert.equal(fora.corpo.linhas[0].dia, 20409);
  const desligada = await chamar(ambiente({ fonte: null, grupo }));
  assert.equal(desligada.chamadas.length, 0);
  assert.equal(desligada.corpo.linhas.length, 3);
});
