// Lista de seleção do portal (design v2): no lugar da lista do navegador, abre uma lista no estilo do site para
//  - todo <select> comum (sem multiple/size): a lista mostra todas as opções, com a escolhida marcada e uma busca
//    quando são muitas; escolher troca o valor do <select> e dispara "input" e "change" (as telas não mudam nada);
//  - todo <input list="..."> (campo com sugestões): ao clicar mostra TODAS as sugestões (a do navegador só mostrava as
//    que combinam com o texto já escrito, ou seja, só o valor atual) e filtra conforme a pessoa digita.
// Não troca o HTML das páginas: escuta na fase de captura e usa um painel só, posto sobre a página (ou dentro do
// <dialog> aberto, para ficar por cima dele). No toque (celular) o <select> continua com a lista do próprio aparelho.
// <select data-nativo> fica com a lista do navegador.
const LIMITE = 300;          // itens desenhados de uma vez (o resto aparece ao digitar)
const BUSCA_A_PARTIR = 9;    // select com mais opções que isso ganha a caixa de busca
const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let painel = null, alvo = null, tipo = null, opcoes = [], visiveis = [], ativo = -1, busca = null, aplicando = false, ponteiro = 'mouse', seq = 0;

const ehSelect = (el) => el instanceof HTMLSelectElement && !el.multiple && !(el.size > 1) && !el.disabled && !('nativo' in el.dataset);
const ehCombo = (el) => el instanceof HTMLInputElement && (el.hasAttribute('list') || 'lista' in el.dataset) && !el.readOnly && !el.disabled;

// campo com sugestões: tira o list (some a lista do navegador) e guarda o id da datalist
function prepararCombo(i) {
  if (i.hasAttribute('list')) { i.dataset.lista = i.getAttribute('list'); i.removeAttribute('list'); }
  i.setAttribute('autocomplete', 'off');
  i.setAttribute('role', 'combobox');
  i.setAttribute('aria-autocomplete', 'list');
  i.setAttribute('aria-expanded', 'false');
}

function lerOpcoes() {
  if (tipo === 'select') {
    const r = [];
    for (const el of alvo.children) {
      if (el.tagName === 'OPTGROUP') {
        r.push({ grupo: el.label });
        for (const o of el.children) if (!o.hidden) r.push({ v: o.value, t: o.label || o.text, off: o.disabled || el.disabled });
      } else if (el.tagName === 'OPTION' && !el.hidden) r.push({ v: el.value, t: el.label || el.text, off: el.disabled });
    }
    return r;
  }
  const dl = document.getElementById(alvo.dataset.lista);
  return dl ? [...dl.options].map((o) => ({ v: o.value, t: o.label && o.label !== o.value ? o.value + ' — ' + o.label : o.value })) : [];
}

function criarPainel(dentro) {
  const p = document.createElement('div');
  p.className = 'lista-selecao';
  p.id = 'lista-selecao';
  p.innerHTML = (tipo === 'select' && opcoes.filter((o) => !o.grupo).length > BUSCA_A_PARTIR
    ? '<div class="ls-busca"><input type="search" placeholder="Procurar…" aria-label="Procurar na lista" autocomplete="off" spellcheck="false"></div>' : '') +
    '<ul class="ls-itens" role="listbox" id="ls-itens"></ul><p class="ls-rodape" hidden></p>';
  (dentro || document.body).appendChild(p);
  // dentro do painel: o mousedown não tira o foco do campo (só a caixa de busca recebe foco)
  p.addEventListener('mousedown', (e) => { if (!e.target.closest('.ls-busca')) e.preventDefault(); });
  p.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li && !li.classList.contains('ls-off')) escolher(visiveis[Number(li.dataset.i)]);
  });
  busca = p.querySelector('.ls-busca input');
  if (busca) {
    busca.addEventListener('input', () => desenhar(busca.value));
    busca.addEventListener('keydown', teclas);
  }
  return p;
}

function desenhar(filtro) {
  const f = sem(filtro).trim();
  const atual = tipo === 'select' ? alvo.value : null;
  visiveis = [];
  let html = '', n = 0, total = 0, grupoPendente = null;
  for (const o of opcoes) {
    if (o.grupo !== undefined) { grupoPendente = o.grupo; continue; }
    if (f && !sem(o.t).includes(f) && !sem(o.v).includes(f)) continue;
    total++;
    if (n >= LIMITE) continue;
    if (grupoPendente !== null) { html += '<li class="ls-grupo" role="presentation">' + esc(grupoPendente) + '</li>'; grupoPendente = null; }
    const i = visiveis.length, marcado = atual !== null && o.v === atual;
    visiveis.push(o);
    html += '<li role="option" id="ls-op-' + i + '" data-i="' + i + '" aria-selected="' + marcado + '"' + (o.off ? ' aria-disabled="true" class="ls-off"' : '') + '>' +
      '<span>' + (o.t ? esc(o.t) : '<span class="ls-vazio-op">(vazio)</span>') + '</span>' + (marcado ? '<svg aria-hidden="true" viewBox="0 0 256 256"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>' : '') + '</li>';
    n++;
  }
  painel.querySelector('.ls-itens').innerHTML = html || '<li class="ls-nada" role="presentation">Nada encontrado' + (f ? ' com “' + esc(filtro.trim()) + '”' : '') + '.</li>';
  const rod = painel.querySelector('.ls-rodape');
  rod.hidden = total <= LIMITE;
  if (total > LIMITE) rod.textContent = 'Mostrando ' + LIMITE + ' de ' + total.toLocaleString('pt-BR') + '. Digite para encontrar as outras.';
  // destaque inicial: a opção escolhida (select) ou a igual ao texto (campo); senão a primeira
  const igual = tipo === 'select' ? visiveis.findIndex((o) => o.v === atual) : visiveis.findIndex((o) => sem(o.v) === sem(alvo.value));
  marcar(igual >= 0 ? igual : (f ? visiveis.findIndex((o) => !o.off) : -1), true);
}

function marcar(i, centralizar) {
  if (!painel) return;
  const antes = painel.querySelector('li.ls-ativo');
  if (antes) antes.classList.remove('ls-ativo');
  ativo = i;
  const quem = busca || alvo;
  if (i < 0) { quem.removeAttribute('aria-activedescendant'); return; }
  const li = painel.querySelector('li[data-i="' + i + '"]');
  if (!li) return;
  li.classList.add('ls-ativo');
  quem.setAttribute('aria-activedescendant', li.id);
  li.scrollIntoView({ block: centralizar ? 'center' : 'nearest' });
}

function posicionar() {
  if (!painel || !alvo) return;
  const r = alvo.getBoundingClientRect();
  if (!r.width && !r.height) { fechar(); return; }
  const larg = Math.min(Math.max(r.width, 220), window.innerWidth - 16);
  painel.style.width = larg + 'px';
  painel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - larg - 8)) + 'px';
  const abaixo = window.innerHeight - r.bottom - 12, acima = r.top - 12;
  const embaixo = abaixo >= 220 || abaixo >= acima;
  const alto = Math.max(140, Math.min(360, embaixo ? abaixo : acima));
  painel.style.maxHeight = alto + 'px';
  painel.style.top = embaixo ? r.bottom + 4 + 'px' : '';
  painel.style.bottom = embaixo ? '' : window.innerHeight - r.top + 4 + 'px';
}

function abrir(el, qual, filtro) {
  if (painel && alvo !== el) fechar();
  alvo = el; tipo = qual;
  opcoes = lerOpcoes();
  if (tipo === 'combo' && !opcoes.length) { fechar(); return; }
  if (!painel) {
    painel = criarPainel(el.closest('dialog[open]'));
    el.setAttribute('aria-expanded', 'true');
    el.setAttribute('aria-controls', 'ls-itens');
  }
  posicionar();
  desenhar(filtro || '');
  if (busca) { const s = ++seq; setTimeout(() => { if (s === seq && busca) busca.focus(); }, 0); }
}

function fechar(devolverFoco) {
  seq++;
  if (painel) painel.remove();
  if (alvo) {
    alvo.setAttribute('aria-expanded', 'false');
    alvo.removeAttribute('aria-activedescendant');
    if (devolverFoco && alvo.isConnected) alvo.focus();
  }
  painel = null; busca = null; alvo = null; ativo = -1; visiveis = [];
}

function escolher(o) {
  if (!o || o.off || !alvo) return;
  const el = alvo;
  if (tipo === 'select') {
    fechar(true);
    if (el.value !== o.v) {
      el.value = o.v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
  fechar();
  aplicando = true;
  el.value = o.v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  aplicando = false;
  if (el.isConnected) el.focus();
}

function teclas(e) {
  if (!painel) return;
  const mover = (d) => {
    if (!visiveis.length) return;
    let i = ativo;
    for (let k = 0; k < visiveis.length; k++) {
      i = i < 0 ? (d > 0 ? 0 : visiveis.length - 1) : (i + d + visiveis.length) % visiveis.length;
      if (!visiveis[i].off) break;
    }
    marcar(i);
  };
  if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
  else if (e.key === 'Enter') { if (ativo >= 0) { e.preventDefault(); escolher(visiveis[ativo]); } else if (tipo === 'select') { e.preventDefault(); fechar(true); } }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(true); }
  else if (e.key === 'Tab') fechar();
}

export function iniciarSelecao(raiz = document) {
  raiz.addEventListener('pointerdown', (e) => { ponteiro = e.pointerType || 'mouse'; }, true);
  raiz.addEventListener('mousedown', (e) => {
    const t = e.target;
    if (painel && !painel.contains(t) && t !== alvo) fechar();
    const s = t.closest && t.closest('select');
    if (s && ehSelect(s) && ponteiro !== 'touch' && e.button === 0) {
      e.preventDefault();   // sem a lista do navegador
      if (alvo === s && painel) { fechar(); return; }
      s.focus();
      abrir(s, 'select');
    }
  }, true);
  raiz.addEventListener('focusin', (e) => {
    if (ehCombo(e.target)) prepararCombo(e.target);
    if (painel && e.target !== alvo && !painel.contains(e.target)) fechar();
  }, true);
  raiz.addEventListener('click', (e) => {
    const i = e.target;
    if (ehCombo(i) && !(painel && alvo === i)) { prepararCombo(i); abrir(i, 'combo', ''); }
  }, true);
  raiz.addEventListener('input', (e) => {
    const i = e.target;
    if (aplicando || !ehCombo(i) || i !== document.activeElement) return;
    prepararCombo(i);
    abrir(i, 'combo', i.value);
  }, true);
  raiz.addEventListener('keydown', (e) => {
    const t = e.target;
    if (painel && (t === alvo)) {
      if (tipo === 'combo' || ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) teclas(e);
      return;
    }
    if (ehSelect(t) && (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) {
      e.preventDefault();
      abrir(t, 'select');
    } else if (ehCombo(t) && (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown'))) {
      e.preventDefault();
      prepararCombo(t);
      abrir(t, 'combo', '');
    }
  }, true);
  // rolar a página ou mudar o tamanho: acompanha o campo (rolagem dentro da própria lista não conta)
  window.addEventListener('scroll', (e) => { if (painel && !(e.target instanceof Node && painel.contains(e.target))) posicionar(); }, true);
  window.addEventListener('resize', () => fechar());
  window.addEventListener('hashchange', () => fechar());
}