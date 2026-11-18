// Arrastar para o lado para fechar (celular, 18/11/2026): painel de notificações e avisos do canto. Regras em lib/gesto.js;
// o arrasto é simulado com um elemento falso (sem navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deveSair, comecaArrasto, arrastarParaFechar } from '../../public/gestao/lib/gesto.js';

test('comecaArrasto: só movimento horizontal, a partir de 12 px, para o lado permitido', () => {
  assert.equal(comecaArrasto(20, 2, [1]), true);
  assert.equal(comecaArrasto(-20, 2, [1]), false);      // painel só sai para a direita
  assert.equal(comecaArrasto(-20, 2, [1, -1]), true);   // aviso sai para qualquer lado
  assert.equal(comecaArrasto(8, 0, [1]), false);
  assert.equal(comecaArrasto(20, 18, [1]), false);      // rolagem vertical não vira arrasto
});

test('deveSair: 30% da largura ou arrasto rápido', () => {
  assert.equal(deveSair(120, 1000, 360, [1]), true);
  assert.equal(deveSair(80, 1000, 360, [1]), false);
  assert.equal(deveSair(80, 100, 360, [1]), true);      // rápido
  assert.equal(deveSair(-150, 1000, 360, [1]), false);  // para o lado errado volta
  assert.equal(deveSair(-150, 1000, 360, [1, -1]), true);
});

function elementoFalso() {
  const ouvintes = {};
  return {
    style: {}, ouvintes,
    addEventListener(tipo, f) { ouvintes[tipo] = f; },
    getBoundingClientRect: () => ({ width: 300 }),
  };
}
const toque = (x, y = 0) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });

test('arrastarParaFechar: arrastar o bastante chama aoSair; pouco volta ao lugar', async () => {
  const el = elementoFalso();
  let saiu = 0;
  arrastarParaFechar(el, { direcoes: [1], aoSair: () => { saiu++; } });
  el.ouvintes.touchstart(toque(10));
  el.ouvintes.touchmove(toque(60));
  assert.equal(el.style.transform, 'translateX(50px)');
  el.ouvintes.touchmove(toque(200));
  el.ouvintes.touchend(toque(200));
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(saiu, 1);
  assert.equal(el.style.transform, '');

  // devagar e curto: não sai
  el.ouvintes.touchstart(toque(10));
  await new Promise((r) => setTimeout(r, 300));
  el.ouvintes.touchmove(toque(40));
  el.ouvintes.touchend(toque(40));
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(saiu, 1);
  assert.equal(el.style.transform, '');
});

test('arrastarParaFechar: desligado (ex.: no computador) não faz nada', () => {
  const el = elementoFalso();
  arrastarParaFechar(el, { ativo: () => false, aoSair: () => assert.fail('não devia sair') });
  el.ouvintes.touchstart(toque(10));
  el.ouvintes.touchmove(toque(250));
  el.ouvintes.touchend(toque(250));
  assert.equal(el.style.transform, undefined);
});
