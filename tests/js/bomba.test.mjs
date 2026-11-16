// Bomba interna: estoque (public/gestao/lib/bomba.js) e rateio das NFs (public/gestao/lib/rateio.js). Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstoque, minutosDe, normPlaca, tanqueDe } from '../../public/gestao/lib/bomba.js';
import { ratear } from '../../public/gestao/lib/rateio.js';

const base = { id: 5, posto: 'CAANA', tanques: { diesel: { capacidade: 15000, inicial: 3000, inicialEm: '2026-11-13T17:41', precoInicial: 6 } } };
const linha = (iso, litros, placa = 'AAA1A11') => {   // linha da Base no formato dos dashboards (dia + segundos)
  const [a, m, d, h, mi, s] = iso.match(/\d+/g).map(Number);
  const t = Date.UTC(a, m - 1, d, h, mi, s) / 1000;
  return { dia: Math.floor(t / 86400), seg: t % 86400, placa, litros, fornecedor: 'CAANA', combustivel: 'DIESEL S-10 COMUM', vlLitro: 6.5 };
};

test('compra antes da medição não muda o volume; depois soma', () => {
  const movimentacoes = [
    { base_id: 5, tanque: 'diesel', quando: '2026-10-22T08:00', litros: 5000, valor: 32809.5 },   // antes da medição
    { base_id: 5, tanque: 'diesel', quando: '2026-11-14T08:00', litros: 1000, valor: 6500 },      // depois
  ];
  const e = calcularEstoque(base, 'diesel', { linhas: [], movimentacoes, manuais: [] });
  assert.equal(e.volume, 4000);
  assert.equal(e.nCompras, 1);
  assert.equal(e.litrosCompra, 1000);
});

test('abastecimentos depois da medição saem do estoque; os de antes não', () => {
  const linhas = [linha('2026-11-13 10:00:00', 200), linha('2026-11-14 09:00:00', 500)];
  const e = calcularEstoque(base, 'diesel', { linhas, movimentacoes: [], manuais: [] });
  assert.equal(e.volume, 2500);
  assert.equal(e.nSaidas, 1);
});

test('tanque que a base não tem devolve null', () => {
  assert.equal(calcularEstoque(base, 'arla', { linhas: [], movimentacoes: [], manuais: [] }), null);
});

test('utilitários de placa, tanque e data', () => {
  assert.equal(normPlaca('abc-1d23'), 'ABC1D23');
  assert.equal(tanqueDe('Arla 32'), 'arla');
  assert.equal(tanqueDe('DIESEL S-10 COMUM'), 'diesel');
  assert.equal(tanqueDe('GASOLINA COMUM'), null);
  assert.equal(minutosDe('1970-01-01T01:30'), 90);
});

test('rateio: abastecimento que passa da nota é dividido e o resto abre a próxima', () => {
  const notas = [{ id: 1, nf: '1001', litros: 100, valor: 600, quando: '2026-11-01T08:00' },
    { id: 2, nf: '1002', litros: 100, valor: 700, quando: '2026-11-02T08:00' }];
  const trs = [{ id: 'a', t: 1, placa: 'AAA1A11', litros: 80 }, { id: 'b', t: 2, placa: 'BBB2B22', litros: 50 }];
  const r = ratear(trs, notas, null);
  assert.equal(r.notas[0].situacao, 'fechada');
  assert.equal(r.notas[1].situacao, 'em uso');
  const b = r.transacoes[1];
  assert.equal(b.dividido, true);
  assert.deepEqual(b.partes.map((p) => p.litros), [20, 30]);
  assert.equal(b.preco, 7);   // a nota com mais litros dele (30 L na 1002)
  assert.equal(r.semNota.length, 0);
});

test('rateio: início pula os anteriores e desconta o que ficou na planilha', () => {
  const notas = [{ id: 1, nf: '1722159', litros: 5000, valor: 32809.5, quando: '2026-10-22T08:00' }];
  const trs = [{ id: 'x', t: 10, placa: 'ZZZ9Z99', litros: 100 }, { id: 'q', t: 20, placa: 'QRM0H08', litros: 519.29 },
    { id: 'y', t: 30, placa: 'AAA1A11', litros: 100 }];
  const r = ratear(trs, notas, { t: 20, placa: 'QRM0H08', jaRateado: 353.82 });
  assert.equal(r.transacoes.length, 2);                       // o de antes do início ficou de fora
  const q = r.transacoes[0];
  assert.equal(q.partes[0].anterior, true);
  assert.equal(q.partes[0].litros, 353.82);
  assert.equal(q.partes[1].litros, 165.47);
  assert.equal(q.preco, null);                                 // a maior parte ficou na nota da planilha: preço não muda
  assert.ok(Math.abs(r.notas[0].rateado - 265.47) < 1e-6);
});

test('rateio: sem nota suficiente vai para "sem nota"', () => {
  const r = ratear([{ id: 'a', t: 1, placa: 'AAA1A11', litros: 150 }], [{ id: 1, nf: '1', litros: 100, valor: 600, quando: '2026-11-01' }], null);
  assert.equal(r.semNota.length, 1);
  assert.equal(r.semNota[0].litros, 50);
});
