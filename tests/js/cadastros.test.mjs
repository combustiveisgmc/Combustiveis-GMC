// Cadastros e cartões (lib/cadastros.js, lib/cartoes.js, lib/permissoes.js): validação usada pelas APIs. Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarChave, CHAVE, CAMPOS, validar } from '../../lib/cadastros.js';
import { normPlaca, placaValida, situacao, SITUACOES } from '../../lib/cartoes.js';
import { pode, TODAS } from '../../lib/permissoes.js';
import { placasDesabilitadas } from '../../functions/api/placas-desabilitadas.js';

test('chave do cadastro: placa sem traço e usuário só com números', () => {
  assert.equal(CHAVE.placas, 'placa');
  assert.equal(normalizarChave('placas', ' abc-1d23 '), 'ABC1D23');
  assert.equal(normalizarChave('motoristas', '000.284'), '000284');
});

test('placa: antiga e Mercosul valem; texto solto não', () => {
  assert.equal(placaValida(normPlaca('abc1234')), true);
  assert.equal(placaValida(normPlaca('ABC-1D23')), true);
  assert.equal(placaValida(normPlaca('VAZAMENTO')), false);
  assert.equal(placaValida(normPlaca('AB1234')), false);
});

test('situação do cartão', () => {
  assert.ok(SITUACOES.includes('ATIVO'));
  assert.deepEqual(situacao('ativo'), { v: 'ATIVO' });
  assert.deepEqual(situacao(''), { v: null });            // célula vazia = sem cartão
  assert.ok(situacao('XYZ').erro);
});

test('permissões: admin pode tudo; gestor só o que tem (lista em JSON, como no D1)', () => {
  const admin = { papel: 'admin', permissoes: '[]' };
  const gestor = { papel: 'gestor', permissoes: '["roteirizador"]' };
  assert.ok(TODAS.length > 10);
  assert.equal(pode(admin, TODAS[0]), true);
  assert.equal(pode(gestor, 'roteirizador'), true);
  assert.equal(pode(gestor, 'acessos'), false);
});

test('placa vendida: situação VENDIDO (17/11/2026) e sem unidade/categoria na edição', () => {
  assert.deepEqual(CAMPOS.placas.find((c) => c.id === 'situacao').opcoes, ['ATIVA', 'DESABILITADA', 'VENDIDO']);
  const v = validar('placas', 'editar', { situacao: 'vendido' });
  assert.deepEqual(v.erros, []);
  assert.equal(v.dados.situacao, 'VENDIDO');
  assert.ok(validar('placas', 'editar', { situacao: 'SUMIDA' }).erros.length);
});

test('só placa DESABILITADA some dos filtros; VENDIDO continua aparecendo (usuário, 17/11/2026)', async () => {
  const env = { DADOS: { get: async () => ({ placas: [{ placa: 'AAA-1A11', situacao: 'DESABILITADA' }, { placa: 'BBB2B22', situacao: 'VENDIDO' },
    { placa: 'CCC3C33', situacao: 'ATIVA' }] }) } };
  assert.deepEqual([...(await placasDesabilitadas(env))], ['AAA1A11']);
});
