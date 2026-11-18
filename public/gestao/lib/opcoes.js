// Opções configuráveis dos cadastros (18/11/2026, pedido do usuário): a engrenagem dentro do formulário de cada cadastro abre
// a lista de opções dos campos (ex.: categoria da placa). Grava em /api/opcoes (D1 opcoes_cadastro; telas e campos permitidos em
// lib/opcoes-cadastro.js). Campos usados nas contas do site (situação, plataforma, combustível...) aparecem como fixos.
//   const opc = await carregarOpcoes('cadastro-placas')          -> {opcoes: {campo: [...]}, podeEditar}
//   listaEfetiva(opc, 'categoria', sugestoesDosDados)             -> a lista configurada, ou as sugestões de antes se não houver
//   BOTAO_OPCOES (HTML da engrenagem) + abrirOpcoes({...})       -> janela de configuração
import { esc } from './dados.js';

export async function carregarOpcoes(tela) {
  try {
    const r = await fetch('/api/opcoes?tela=' + encodeURIComponent(tela), { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return { opcoes: {}, podeEditar: false };
    const j = await r.json();
    return { opcoes: j.opcoes || {}, podeEditar: !!j.podeEditar };
  } catch {
    return { opcoes: {}, podeEditar: false };
  }
}

const ordenar = (ls) => [...ls].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
// lista configurada do campo (se houver) ou as opções de antes (padrão = valores que já existem nos dados)
export function listaEfetiva(opc, campo, padrao = []) {
  const v = opc && opc.opcoes && opc.opcoes[campo];
  return Array.isArray(v) && v.length ? v : padrao;
}
export const temConfig = (opc, campo) => !!(opc && opc.opcoes && Array.isArray(opc.opcoes[campo]) && opc.opcoes[campo].length);

export const BOTAO_OPCOES = '<button type="button" class="btn-opcoes" data-opcoes aria-label="Configurar as opções deste cadastro" ' +
  'title="Configurar as opções deste cadastro"><svg aria-hidden="true"><use href="#i-engrenagem"/></svg></button>';

async function gravar(tela, campo, valores) {
  const r = await fetch('/api/opcoes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tela, campo, valores }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível gravar as opções (' + r.status + ').');
  return j.valores;
}

/**
 * Janela de configuração das opções.
 * @param {object} o
 * @param {string} o.tela        id da tela em lib/opcoes-cadastro.js (ex.: 'cadastro-placas')
 * @param {string} o.titulo      título da janela
 * @param {Array<{id, rotulo, valores, fixo?, explica?, configurado?}>} o.campos
 * @param {boolean} o.podeEditar
 * @param {Function} [o.aoSalvar] ({campo: valores}) depois de gravar
 */
export function abrirOpcoes({ tela, titulo, campos, podeEditar, aoSalvar }) {
  const editaveis = campos.filter((c) => !c.fixo && podeEditar);
  const listas = Object.fromEntries(campos.map((c) => [c.id, [...(c.valores || [])]]));
  const dlg = document.createElement('dialog');
  dlg.className = 'dialogo opcoes-dlg';
  dlg.setAttribute('aria-labelledby', 'opc-titulo');
  const chip = (c, v, i) => '<li class="opc-chip"><span>' + esc(v) + '</span>' + (!c.fixo && podeEditar
    ? '<button type="button" data-remover="' + i + '" aria-label="Remover ' + esc(v) + '" title="Remover"><svg aria-hidden="true"><use href="#i-x"/></svg></button>' : '') + '</li>';
  const secao = (c) => '<section class="opc-campo" data-campo="' + esc(c.id) + '">' +
    '<h3>' + esc(c.rotulo) + (c.fixo ? ' <span class="opc-fixo">fixo</span>' : '') + '</h3>' +
    '<ul class="opc-lista">' + (listas[c.id].length ? listas[c.id].map((v, i) => chip(c, v, i)).join('') : '<li class="opc-vazia">Nenhuma opção.</li>') + '</ul>' +
    (!c.fixo && podeEditar ? '<div class="opc-novo"><input type="text" maxlength="80" autocomplete="off" spellcheck="false" placeholder="Nova opção…" aria-label="Nova opção de ' + esc(c.rotulo.toLowerCase()) + '">' +
      '<button type="button" class="btn" data-adicionar>Adicionar</button></div>' : '') +
    (c.explica ? '<p class="nota-campo">' + esc(c.explica) + '</p>' : c.fixo ? '<p class="nota-campo">Usada nas contas do site: não muda por aqui.</p>'
      : !c.configurado ? '<p class="nota-campo">Ainda sem lista própria: estas são as que já existem no cadastro. Ao salvar, a lista passa a ser esta.</p>' : '') +
    '</section>';
  const desenhar = () => {
    dlg.innerHTML = '<form method="dialog" novalidate><h2 id="opc-titulo">' + esc(titulo) + '</h2>' +
      '<p class="dialogo-explica">' + (podeEditar ? 'As opções aparecem nas listas do formulário. Tire todas de um campo para voltar a sugerir o que já existe no cadastro.'
        : 'Seu acesso é só de consulta: as opções aparecem como estão.') + '</p>' +
      '<p class="erro-form oculto" role="alert"></p>' + campos.map(secao).join('') +
      '<div class="dialogo-acoes"><button type="button" class="btn" data-fechar>' + (editaveis.length ? 'Cancelar' : 'Fechar') + '</button>' +
      (editaveis.length ? '<button type="submit" class="btn btn-principal">Salvar opções</button>' : '') + '</div></form>';
  };
  desenhar();
  const erro = (t) => { const e = dlg.querySelector('.erro-form'); e.textContent = t || ''; e.classList.toggle('oculto', !t); };
  const adicionar = (sec) => {
    const c = campos.find((x) => x.id === sec.dataset.campo), inp = sec.querySelector('input');
    const v = inp.value.replace(/\s+/g, ' ').trim();
    if (!v) { inp.focus(); return; }
    const k = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (listas[c.id].some((x) => k(x) === k(v))) { erro(v + ' já está na lista de ' + c.rotulo.toLowerCase() + '.'); inp.select(); return; }
    listas[c.id] = ordenar([...listas[c.id], v]);
    erro('');
    desenhar();
    dlg.querySelector('.opc-campo[data-campo="' + c.id + '"] input').focus();
  };
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) { dlg.close(); return; }
    const sec = e.target.closest('.opc-campo');
    if (!sec) return;
    const rem = e.target.closest('[data-remover]');
    if (rem) { listas[sec.dataset.campo].splice(Number(rem.dataset.remover), 1); desenhar(); return; }
    if (e.target.closest('[data-adicionar]')) adicionar(sec);
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.opc-novo input')) { e.preventDefault(); adicionar(e.target.closest('.opc-campo')); }
  });
  dlg.addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = dlg.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      const novos = {};
      for (const c of editaveis) {
        const agora = JSON.stringify(listas[c.id]);
        if (JSON.stringify(c.valores || []) === agora && (c.configurado || listas[c.id].length)) continue;   // nada mudou
        novos[c.id] = await gravar(tela, c.id, listas[c.id]);
      }
      if (aoSalvar && Object.keys(novos).length) aoSalvar(novos);
      dlg.close();
    } catch (err) {
      erro(err.message);
      botao.disabled = false;
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}
