// Densidade dos painéis (18/11/2026): cartões mais baixos para o principal caber acima da dobra (1440×900).
// Confere os tokens de densidade e que as regras de layout usam eles (nada de voltar aos 25 px / 73 px de antes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const css = ler('public/gestao/gestao.css');

test('tokens de densidade definidos', () => {
  assert.match(css, /--vao:16px;/);
  assert.match(css, /--recheio:18px 20px;/);
  assert.match(css, /--recheio-filtros:12px 20px;/);
  assert.match(css, /--reg-icone:52px;/);
});

test('cartões, grade da página e indicadores usam os tokens', () => {
  assert.match(css, /\.painel, \.filtros, \.meta-bloco, \.apoio, \.totem, \.cartao\{[^}]*padding:var\(--recheio\)/);
  assert.match(css, /\.pagina\{[^}]*gap:var\(--vao\)/);
  assert.match(css, /\.bomba-registros\{[^}]*gap:var\(--vao\)/);
  assert.match(css, /\.registro\{[^}]*grid-template-columns:var\(--reg-icone\)/);
  assert.match(css, /\.registro::before\{[^}]*width:var\(--reg-icone\);height:var\(--reg-icone\)/);
  assert.doesNotMatch(css, /width:73px;height:73px/);
  assert.match(css, /\.medidor-arco\{[^}]*max-width:210px/);
});

test('tela larga: grupos de filtro lado a lado', () => {
  assert.match(css, /@media \(min-width:1101px\)\{\s*\.grupo-filtros\{flex-direction:row;/);
});

test('gráficos mais baixos (padrão 220 px)', () => {
  assert.match(ler('public/gestao/lib/graficos.js'), /H = o\.altura \|\| 220;/);
  assert.match(ler('public/gestao/dashboards/operacao-motorista.js'), /H = 210;/);
  assert.match(ler('public/gestao/dashboards/preco-fornecedor.js'), /H = 250;/);
});
