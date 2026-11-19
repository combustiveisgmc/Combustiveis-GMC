// Exportar do Editar abastecimentos (18/11/2026): linha do banco -> as 48 colunas da Base_copia, e a API (permissão e lote).
// Valores fictícios no formato dos reais (as colunas de fórmula conferidas com a Base_copia: COD UNID. = placa + hodômetro,
// AV = placa + forma de pagamento).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUNAS, linhaPlanilha, dataPlanilha } from '../../public/gestao/lib/exportar-base.js';
import { onRequestPost, LOTE } from '../../functions/api/abastecimentos/exportar.js';

// [A..AN, campanha, linha]
function linhaBanco({ forma = 'VIBRA', placa = 'ABC1D23', hodo = 812497.6, data = '2026-11-17T21:32:34', matricula = '5521' } = {}) {
  const r = new Array(42).fill(null);
  r[0] = 123; r[1] = forma; r[4] = data; r[5] = placa; r[10] = matricula; r[14] = 300.5; r[15] = 6.49; r[16] = hodo; r[19] = 1950.25;
  r[41] = 99;
  return r;
}

test('48 colunas A..AV com os títulos da Base_copia', () => {
  assert.equal(COLUNAS.length, 48);
  assert.equal(COLUNAS[0][0], 'CODIGO TRANSACAO');
  assert.equal(COLUNAS[4][2], 'dd/mm/yyyy\\ hh:mm:ss');
  assert.equal(COLUNAS[41][0], 'MÊS');
  assert.equal(COLUNAS[43][0], 'COD UNID.');
  assert.equal(COLUNAS[46][0], '');
});

test('data sem fuso: mesma hora no Excel', () => {
  const d = dataPlanilha('2026-11-17T21:32:34');
  assert.equal(d.toISOString(), '2026-11-17T21:32:34.000Z');
  assert.equal(dataPlanilha(null), null);
});

test('colunas de fórmula refeitas como na planilha', () => {
  const l = linhaPlanilha(linhaBanco());
  assert.equal(l.length, 48);
  assert.equal(l[40], 2026);                 // ANO
  assert.equal(l[41], 11);                   // MÊS
  assert.equal(l[43], 'ABC1D23812497');      // COD UNID. = placa + hodômetro inteiro
  assert.equal(l[44], 0);                    // DATA REF
  assert.equal(l[45], null);                 // DEF POSTO
  assert.equal(l[46], null);                 // AU vazia
  assert.equal(l[47], 'ABC1D23VIBRA');       // AV = placa + forma
  assert.equal(l[10], 5521);                 // matrícula volta a ser número
  const semForma = linhaPlanilha(linhaBanco({ forma: null, hodo: null }));
  assert.equal(semForma[47], 'ABC1D23');
  assert.equal(semForma[43], null);
});

// API
const pedido = (corpo) => new Request('https://exemplo.test/api/abastecimentos/exportar', { method: 'POST',
  headers: { cookie: 'sessao=abc', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
const envCom = (usuario) => ({ SUPABASE_URL: 'https://banco.exemplo', SUPABASE_KEY: 'chave-de-teste',
  DB: { prepare: () => { const st = { bind: () => st, first: async () => usuario }; return st; } } });
const login = (perms) => ({ id: 1, usuario: 't', nome: 'T', papel: 'gestor', trocar_senha: 0, permissoes: JSON.stringify(perms), funcao_id: null, funcao_permissoes: null });

test('API: só quem tem o Editar abastecimentos; lote limitado; devolve as linhas do banco', async () => {
  assert.equal((await onRequestPost({ request: pedido({ linhas: [2] }), env: envCom(login(['consulta-km'])) })).status, 403);
  assert.equal((await onRequestPost({ request: pedido({ linhas: [] }), env: envCom(login(['abastecimentos'])) })).status, 400);
  const muitas = Array.from({ length: LOTE + 1 }, (_, i) => i + 2);
  assert.equal((await onRequestPost({ request: pedido({ linhas: muitas }), env: envCom(login(['abastecimentos'])) })).status, 400);
  const original = globalThis.fetch;
  let pediu = null;
  globalThis.fetch = async (url, op) => { pediu = { url, corpo: JSON.parse(op.body) }; return new Response(JSON.stringify([linhaBanco()]), { status: 200 }); };
  try {
    const r = await onRequestPost({ request: pedido({ linhas: [99, 99, 'x'] }), env: envCom(login(['abastecimentos'])) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).linhas.length, 1);
    assert.match(pediu.url, /\/rest\/v1\/rpc\/gestao_exportar_base$/);
    assert.deepEqual(pediu.corpo, { p_linhas: [99] });
  } finally { globalThis.fetch = original; }
});

// trava: a linha do banco tem de ser o mesmo abastecimento da tela (lista e banco de versões diferentes = linhas trocadas)
test('confere: mesma placa, mesmo minuto e mesmos litros', async () => {
  const { confere } = await import('../../public/gestao/lib/exportar-base.js');
  const r = linhaBanco();   // ABC1D23, 17/11/2026 21:32:34, 300,5 L
  const serial = Date.UTC(2026, 10, 17, 21, 32, 34) / 86400000 + 25569;
  assert.equal(confere(r, { placa: 'abc1d23 ', serial, litros: 300.5 }), true);
  assert.equal(confere(r, { placa: 'XYZ9Z99', serial, litros: 300.5 }), false);
  assert.equal(confere(r, { placa: 'ABC1D23', serial: serial + 1 / 24, litros: 300.5 }), false);
  assert.equal(confere(r, { placa: 'ABC1D23', serial, litros: 120 }), false);
  assert.equal(confere(r, undefined), false);
});

// 19/11/2026 (pedido do usuário: "não veio com as formatações, como por exemplo as cores das linhas referente a cada cartão")
test('estiloCelula: cor da linha por cartão (A..AU), alinhamento e formato de cada coluna', async () => {
  const { estiloCelula, corDoCartao } = await import('../../public/gestao/lib/exportar-base.js');
  assert.equal(corDoCartao('TRUCKPAG'), 'FF99FF99');
  assert.equal(corDoCartao(' Vibra '), 'FF9DC3E6');
  assert.equal(corDoCartao('VELOE'), 'FFDBB7FF');
  assert.equal(corDoCartao('Cartao Fisico'), null);                 // Ticket: sem cor, como na Base_copia
  const a = estiloCelula(1, 'TRUCKPAG');
  assert.deepEqual(a.fill, { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99FF99' } });
  assert.equal(a.alignment.horizontal, 'right');
  assert.equal(a.numFmt, '0');
  assert.equal(estiloCelula(5, 'VELOE').alignment.horizontal, 'center');   // data
  assert.equal(estiloCelula(6, 'VELOE').alignment.horizontal, 'left');     // placa
  assert.ok(estiloCelula(47, 'VIBRA').fill);                                 // AU pintada
  assert.equal(estiloCelula(48, 'VIBRA').fill, undefined);                   // AV (chave auxiliar) sem cor
  assert.equal(estiloCelula(1, 'Cartao Fisico').fill, undefined);
  assert.equal(estiloCelula(1, 'Cartao Fisico').font.name, 'Arial');
});
