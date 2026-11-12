// Botão "Baixar" padrão do portal: ícone + "Baixar" que abre um menu com CSV e XLSX (Excel).
// O menu é um só, preso ao <body> (a rolagem das tabelas não corta) e posicionado embaixo do botão.
// gerar() devolve { nome, aba, colunas: [{ titulo, tipo, casas, largura }], linhas } com os valores crus:
//   tipo 'data' = 'aaaa-mm-dd' (vira dd/mm/aaaa), 'moeda' e 'numero' = número (vírgula decimal no CSV), 'pct' = fração (0,9257 → 92,57%), o resto é texto.
import { planilhaSimples } from './xlsx-rateio.js';

const BOM = String.fromCharCode(0xfeff);   // o Excel abre o CSV em UTF-8

export function botaoBaixar(id, rotulo = 'Baixar', classe = '') {
  return '<button type="button" class="btn ' + classe + '" id="' + id + '" aria-haspopup="menu" aria-expanded="false">' +
    '<svg aria-hidden="true"><use href="#i-baixar"/></svg><span class="txt">' + rotulo + '</span></button>';
}

export function salvar(nome, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const brData = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso ?? ''); };
function celulaCsv(v, c) {
  if (v === null || v === undefined || v === '') return '';
  if (c.tipo === 'data') return brData(v);
  if (c.tipo === 'pct' && typeof v === 'number') return isFinite(v) ? (v * 100).toFixed(2).replace('.', ',') + '%' : '';
  if ((c.tipo === 'moeda' || c.tipo === 'numero') && typeof v === 'number') {
    if (!isFinite(v)) return '';
    return (c.casas === undefined && c.tipo === 'numero' ? String(v) : v.toFixed(c.casas ?? 2)).replace('.', ',');
  }
  return '"' + String(v).replace(/"/g, '""') + '"';
}

export function baixarArquivo(formato, { nome, aba, colunas, linhas }) {
  if (formato === 'xlsx') {
    // número com casas fixas vai arredondado, para a planilha mostrar o mesmo que a tela
    const crus = linhas.map((l) => l.map((v, i) => (typeof v === 'number' && colunas[i].casas !== undefined && isFinite(v) ? Number(v.toFixed(colunas[i].casas)) : v)));
    return salvar(nome + '.xlsx', planilhaSimples({ aba: aba || nome, cabecalho: colunas.map((c) => c.titulo), linhas: crus,
      tipos: colunas.map((c) => c.tipo), larguras: colunas.map((c) => c.largura) }));
  }
  const csv = [colunas.map((c) => '"' + c.titulo.replace(/"/g, '""') + '"').join(';'), ...linhas.map((l) => l.map((v, i) => celulaCsv(v, colunas[i])).join(';'))];
  salvar(nome + '.csv', new Blob([BOM + csv.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

// menu suspenso genérico: opcoes = [{ rotulo, acao }]
let menu = null, doBotao = null;
function fechar() {
  if (menu && !menu.hidden) { menu.hidden = true; if (doBotao) doBotao.setAttribute('aria-expanded', 'false'); }
}
function garantirMenu() {
  if (menu && menu.isConnected) return menu;
  menu = document.createElement('div');
  menu.className = 'fc-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  document.body.appendChild(menu);
  menu.addEventListener('keydown', (e) => {
    const itens = [...menu.querySelectorAll('button')];
    const i = itens.indexOf(document.activeElement);
    if (e.key === 'Escape') { fechar(); if (doBotao) doBotao.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !(doBotao && doBotao.contains(e.target))) fechar(); });
  window.addEventListener('hashchange', fechar);
  return menu;
}

export function ligarMenu(botao, opcoes) {
  if (!botao) return;
  botao.setAttribute('aria-haspopup', 'menu');
  botao.setAttribute('aria-expanded', 'false');
  botao.addEventListener('click', () => {
    const m = garantirMenu();
    const abrir = m.hidden || doBotao !== botao;
    fechar();
    if (!abrir) return;
    m.innerHTML = '';
    for (const o of opcoes) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = o.rotulo;
      b.addEventListener('click', () => { fechar(); o.acao(); });
      m.appendChild(b);
    }
    doBotao = botao; m.hidden = false; botao.setAttribute('aria-expanded', 'true');
    const r = botao.getBoundingClientRect();
    m.style.top = Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 8) + 'px';
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
    m.querySelector('button').focus();
  });
}

// o botão Baixar com as duas opções de formato
export function ligarBaixar(botao, gerar) {
  ligarMenu(botao, [
    { rotulo: 'CSV', acao: () => baixarArquivo('csv', gerar()) },
    { rotulo: 'XLSX (Excel)', acao: () => baixarArquivo('xlsx', gerar()) },
  ]);
}