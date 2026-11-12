// Ações das linhas no mesmo padrão em todas as tabelas: clicar na linha abre a edição (quando ela tem "Editar") e as
// ações ficam num botão "⋯" no fim da linha. Os botões originais continuam no HTML, escondidos: os ouvintes de cada
// página seguem iguais, o menu só repassa o clique para eles.
import { ligarMenu } from './baixar.js';

const INTERATIVO = 'a, button, input, select, textarea, label, summary, [contenteditable]';

function arrumarCelula(td) {
  td.dataset.arrumado = '1';
  const botoes = [...td.children].filter((b) => b.matches('button.btn-linha'));
  if (botoes.length < 2 || botoes.length !== td.children.length) return;   // uma ação só, ou célula com outros controles: fica como está
  const editar = botoes.find((b) => /^editar$/i.test(b.textContent.trim()));
  botoes.forEach((b) => b.classList.add('acao-escondida'));
  const mais = document.createElement('button');
  mais.type = 'button';
  mais.className = 'btn-linha btn-mais';
  mais.setAttribute('aria-label', 'Ações da linha');
  mais.title = 'Ações';
  mais.innerHTML = '<svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z"/></svg>';
  td.appendChild(mais);
  ligarMenu(mais, botoes.filter((b) => !b.disabled).map((b) => ({ rotulo: b.textContent.trim(), acao: () => b.click() })));
  const tr = td.closest('tr');
  if (editar && tr && !tr.dataset.abreEdicao) {
    tr.dataset.abreEdicao = '1';
    tr.classList.add('linha-abre');
    tr.addEventListener('click', (e) => {
      if (e.target.closest(INTERATIVO) || String(getSelection() || '')) return;   // clicou num controle ou selecionou texto
      editar.click();
    });
  }
}

export function iniciarAcoesLinha(raiz) {
  let pendente = false;
  const varrer = () => { pendente = false; raiz.querySelectorAll('td.acoes-linha:not([data-arrumado])').forEach(arrumarCelula); };
  // setTimeout e não requestAnimationFrame: em aba escondida o rAF para e as linhas ficariam sem arrumar
  new MutationObserver(() => { if (!pendente) { pendente = true; setTimeout(varrer, 0); } }).observe(raiz, { childList: true, subtree: true });
  varrer();
}