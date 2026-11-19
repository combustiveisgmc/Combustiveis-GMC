// Passo 4 da migração (19/11/2026): rotinas do vigia nas Edge Functions do Supabase. As funções usam cópias dos módulos do
// portal/vigia (supabase/functions/_shared); se a original mudar e a cópia não, a nuvem rodaria uma regra velha.
// Corrigir com: node scripts/nuvem_publicar.mjs --copiar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPIAS } from '../../scripts/nuvem_publicar.mjs';
import { acharNaBase, itensExclusao, serial } from '../../lib/nuvem/estornos.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('cópias em supabase/functions/_shared iguais às originais', () => {
  for (const [destino, origem] of Object.entries(COPIAS)) {
    assert.equal(fs.readFileSync(path.join(RAIZ, 'supabase/functions/_shared', destino), 'utf8'),
      fs.readFileSync(path.join(RAIZ, origem), 'utf8'), `${destino} desatualizada: rode node scripts/nuvem_publicar.mjs --copiar`);
  }
});

// lista colunar mínima: 3 abastecimentos TruckPag da mesma placa e cadeia (diesel)
const s = (q) => serial(q);
const lista = {
  dic: { placa: ['ABC1D23'], forma: ['TRUCKPAG'], fuel: ['DIESEL S-10 COMUM'] },
  col: { linha: [10, 11, 12], placa: [0, 0, 0], forma: [0, 0, 0], fuel: [0, 0, 0],
    dt: [s('2026-11-10 08:00:00'), s('2026-11-11 08:00:00'), s('2026-11-12 08:00:00')],
    litros: [100, 50, 80], hodo: [1000, 1300, 1700], km: [null, 300, 400], kml: [null, 6, 5] },
};

test('estorno: acha a linha (segundo exato), exclui e refaz o km do seguinte', () => {
  const est = [{ transacao_id: 1, transacao_data: '2026-11-11 08:00:02', litragem: 50, quilometragem: 1300, veiculo_placa: 'ABC1D23' }];
  const r = acharNaBase(lista, est, []);
  assert.deepEqual(r.indices, [1]);
  const itens = itensExclusao(lista, r.indices);
  assert.deepEqual(itens[0], { acao: 'excluir', linha: 11, placa: 'ABC1D23', data: lista.col.dt[1], celulas: {}, antes: {} });
  assert.deepEqual(itens[1].celulas, { R: 700, S: 8.75 });     // seguinte passa a contar do anterior: 1700 - 1000
});

test('estorno refeito na hora (transação aprovada igual): não exclui a linha que ficou', () => {
  const est = [{ transacao_id: 1, transacao_data: '2026-11-11 08:00:00', litragem: 50, quilometragem: 1300, veiculo_placa: 'ABC1D23' }];
  const apr = [{ transacao_id: 2, transacao_data: '2026-11-11 08:00:03', litragem: 50, quilometragem: 1300, veiculo_placa: 'ABC1D23' }];
  const r = acharNaBase(lista, est, apr);
  assert.deepEqual([r.indices, r.semLinha.length], [[], 1]);
});
