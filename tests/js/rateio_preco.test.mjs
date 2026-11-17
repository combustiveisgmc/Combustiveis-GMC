// Preço das bombas pelo Rateio das NFs (scripts/bomba_rateio.mjs, regras de 17/11/2026): só com a nota fechada, travado
// depois de aplicado ou corrigido à mão, e o mesmo abastecimento da API e da Base contado uma vez. Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precoFechado, travas, mesmoAbastecimento } from '../../scripts/bomba_rateio.mjs';
import { ratear } from '../../public/gestao/lib/rateio.js';

const notas = [{ id: 1, nf: '1001', litros: 100, valor: 672, quando: '2026-11-01T08:00' },
  { id: 2, nf: '1002', litros: 100, valor: 687, quando: '2026-11-05T08:00' }];

test('preço só quando todas as notas do abastecimento estão fechadas', () => {
  const r = ratear([{ id: 'a', t: 1, placa: 'AAA1A11', litros: 80 }, { id: 'b', t: 2, placa: 'BBB2B22', litros: 50 },
    { id: 'c', t: 3, placa: 'CCC3C33', litros: 10 }], notas, null);
  const [a, b, c] = r.transacoes;
  assert.equal(precoFechado(a), 6.72);        // nota 1001 fechada
  assert.equal(precoFechado(b), null);        // dividido entre 1001 (fechada) e 1002 (em uso): espera fechar
  assert.equal(precoFechado(c), null);        // só na 1002 (em uso)
  const r2 = ratear([{ id: 'a', t: 1, placa: 'AAA1A11', litros: 80 }, { id: 'b', t: 2, placa: 'BBB2B22', litros: 50 },
    { id: 'c', t: 3, placa: 'CCC3C33', litros: 70 }], notas, null);
  assert.equal(precoFechado(r2.transacoes[1]), 6.87);   // as duas fecharam: vale a nota com mais litros dele (30 L na 1002)
  assert.equal(precoFechado(r2.transacoes[2]), 6.87);
});

test('sem nota ou só da planilha anterior: sem preço', () => {
  const r = ratear([{ id: 'a', t: 5, placa: 'AAA1A11', litros: 300 }], notas, null);
  assert.equal(precoFechado(r.transacoes[0]), 6.87);      // as duas fecharam com ele; o que sobrou ficou sem nota
  assert.equal(precoFechado({ preco: null, nota: null, partes: [] }), null);
});

test('travado: corrigido à mão vale para qualquer combustível; nota fechada só para o tanque dela', () => {
  const t = travas([{ placa: 'aaa-1a11', data: 46000.5, tanque: null }, { placa: 'BBB2B22', data: 46001.25, tanque: 'diesel' }]);
  assert.equal(t('AAA1A11', 46000.5, 'arla'), true);
  assert.equal(t('AAA1A11', 46000.5000001, 'diesel'), true);   // mesmo segundo
  assert.equal(t('BBB2B22', 46001.25, 'diesel'), true);
  assert.equal(t('BBB2B22', 46001.25, 'arla'), false);          // o Arla do mesmo caminhão ainda pode receber o preço
  assert.equal(t('CCC3C33', 46000.5, 'diesel'), false);
});

test('mesmo abastecimento da API e da Base com hora e litros um pouco diferentes', () => {
  const base = { placa: 'AAA1A11', t: Date.UTC(2026, 10, 10, 9, 59, 50), litros: 300.12 };
  assert.equal(mesmoAbastecimento({ placa: 'AAA-1A11', t: Date.UTC(2026, 10, 10, 10, 0, 20), litros: 300.1 }, base), true);   // outro minuto
  assert.equal(mesmoAbastecimento({ placa: 'AAA1A11', t: Date.UTC(2026, 10, 10, 10, 20, 0), litros: 300.12 }, base), false); // 20 min depois
  assert.equal(mesmoAbastecimento({ placa: 'AAA1A11', t: base.t, litros: 50 }, base), false);
  assert.equal(mesmoAbastecimento({ placa: 'BBB2B22', t: base.t, litros: 300.12 }, base), false);
});
