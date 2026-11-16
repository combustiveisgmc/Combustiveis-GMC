// Notificações (public/gestao/lib/notificacao.js): estoque baixo com várias bases e mensagens. Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basesDaRegra, montarTexto, descreverLimite, avaliar, TIPOS } from '../../public/gestao/lib/notificacao.js';

const estoques = [901, 902, 903].map((id) => ({ base_id: id, base: 'B' + id, tanque: 'diesel', volume: 500, capacidade: 15000, pct: 500 / 15000 }));
const regra = (condicao) => ({ id: 1, tipo: 'estoque-baixo', nome: 'Estoque baixo', mensagem: '{base}',
  condicao: { tanque: 'diesel', unidade: 'litros', limite: 2000, ...condicao } });
const bases = (cond) => TIPOS['estoque-baixo'].avaliar(regra(cond), { estoques }).map((x) => x.texto);

test('basesDaRegra: lista nova, regra antiga com uma base e "todas"', () => {
  assert.deepEqual(basesDaRegra({ base_ids: [1, 3] }), [1, 3]);
  assert.deepEqual(basesDaRegra({ base_id: 2 }), [2]);
  assert.deepEqual(basesDaRegra({ base_id: null }), []);
  assert.deepEqual(basesDaRegra({}), []);
});

test('estoque baixo dispara só nas bases escolhidas', () => {
  assert.deepEqual(bases({ base_ids: [901, 903] }), ['B901', 'B903']);
  assert.deepEqual(bases({ base_ids: [] }), ['B901', 'B902', 'B903']);
  assert.deepEqual(bases({ base_id: 902 }), ['B902']);
});

test('estoque baixo respeita o limite em litros e em %', () => {
  assert.deepEqual(bases({ limite: 400 }), []);
  assert.deepEqual(bases({ unidade: 'pct', limite: 5, base_ids: [901] }), ['B901']);
  assert.deepEqual(bases({ unidade: 'pct', limite: 3, base_ids: [901] }), []);
});

test('sem dados de estoque o tipo não dispara (null)', () => {
  assert.equal(TIPOS['estoque-baixo'].avaliar(regra({}), {}), null);
  assert.deepEqual(avaliar([regra({})], {}), []);
});

test('mensagem e limite', () => {
  assert.equal(montarTexto('{tanque} em {base} ({x})', { tanque: 'Diesel', base: 'JEQUIE' }), 'Diesel em JEQUIE ({x})');
  assert.equal(descreverLimite({ unidade: 'pct', limite: 12.5 }), '12,5% da capacidade');
  assert.equal(descreverLimite({ unidade: 'litros', limite: 2000 }), '2.000 L');
});

test('comunicado só aparece entre as datas', () => {
  const hoje = new Date();
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ontem = new Date(hoje.getTime() - 864e5), amanha = new Date(hoje.getTime() + 864e5);
  const r = (de, ate) => TIPOS.comunicado.avaliar({ id: 2, mensagem: 'oi', condicao: { de, ate } }).length;
  assert.equal(r(iso(ontem), iso(amanha)), 1);
  assert.equal(r(iso(amanha), iso(amanha)), 0);
});
