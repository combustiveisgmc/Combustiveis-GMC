// Tabela ordenável — PADRÃO DO PORTAL para tabelas novas (pedido do usuário em 11/11/2026: "classificar por coluna, igual
// em outras tabelas" e "deixe gravado para as próximas tabelas"). Clicar no cabeçalho ordena pela coluna; clicar de novo
// inverte. Mesmo visual dos outros cabeçalhos (table.dados th button + .seta ▲▼) e aria-sort para leitor de tela.
//
//   const t = tabelaOrdenavel(el('minha-tabela'), {
//     colunas: [
//       { id: 'nome', rot: 'Unidade', v: (l) => l.nome, html: (l) => esc(l.nome) },
//       { id: 'litros', rot: 'Litros', n: true, v: (l) => l.litros, html: (l) => fmt.int(l.litros) },
//     ],
//     padrao: { campo: 'litros', dir: -1 },        // ordem inicial (opcional)
//     vazio: 'Nenhuma linha.',                     // texto quando não há linhas (opcional)
//     classeLinha: (l) => '',                      // classe de cada <tr> (opcional)
//   });
//   t.atualizar(linhas, rodapeHtml);              // desenha (de novo) com as linhas e o <tfoot> (opcional)
//
// n: true = coluna numérica (à direita; o 1º clique ordena do maior para o menor). v: null = coluna sem ordenação.
// Valores vazios (null/undefined/NaN) ficam sempre no fim. Texto ordena em português ("Linha 2" antes de "Linha 10").
import { esc } from './dados.js';

const vazioV = (v) => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));

export function tabelaOrdenavel(tabela, o) {
  let ordem = o.padrao ? { ...o.padrao } : null, linhas = [], rodape = '';
  const col = (id) => o.colunas.find((c) => c.id === id);

  function ordenadas() {
    const c = ordem && col(ordem.campo);
    if (!c || !c.v) return linhas;
    return [...linhas].sort((a, b) => {
      const va = c.v(a), vb = c.v(b);
      if (vazioV(va) || vazioV(vb)) return vazioV(va) === vazioV(vb) ? 0 : vazioV(va) ? 1 : -1;
      const r = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) : va - vb;
      return r * ordem.dir;
    });
  }

  function desenhar() {
    const cab = '<thead><tr>' + o.colunas.map((c) => {
      const ativa = ordem && ordem.campo === c.id;
      if (!c.v) return '<th' + (c.n ? ' class="n"' : '') + '><span>' + esc(c.rot) + '</span></th>';   // coluna sem ordenação
      return '<th' + (c.n ? ' class="n"' : '') + ' aria-sort="' + (ativa ? (ordem.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
        '<button type="button" data-ord="' + esc(c.id) + '"' + (c.dica ? ' title="' + esc(c.dica) + '"' : '') + '>' + esc(c.rot) +
        (ativa ? '<span class="seta" aria-hidden="true">' + (ordem.dir > 0 ? '▲' : '▼') + '</span>' : '') + '</button></th>';
    }).join('') + '</tr></thead>';
    const ls = ordenadas();
    const corpo = '<tbody>' + (ls.length ? ls.map((l) => '<tr' + (o.classeLinha ? ' class="' + esc(o.classeLinha(l) || '') + '"' : '') + '>' +
      o.colunas.map((c) => '<td class="' + (c.n ? 'n' : '') + (c.cls ? ' ' + (typeof c.cls === 'function' ? c.cls(l) : c.cls) : '') + '" data-rot="' + esc(c.rot) + '">' +
        c.html(l) + '</td>').join('') + '</tr>').join('')
      : '<tr><td colspan="' + o.colunas.length + '"><div class="vazio">' + esc(o.vazio || 'Nenhuma linha.') + '</div></td></tr>') + '</tbody>';
    tabela.innerHTML = cab + corpo + (rodape ? '<tfoot>' + rodape + '</tfoot>' : '');
  }

  tabela.addEventListener('click', (e) => {
    const b = e.target.closest('thead [data-ord]');
    if (!b) return;
    const c = col(b.dataset.ord);
    ordem = ordem && ordem.campo === c.id ? { campo: c.id, dir: -ordem.dir } : { campo: c.id, dir: c.n ? -1 : 1 };
    desenhar();
    const f = tabela.querySelector('thead [data-ord="' + c.id + '"]');
    if (f) f.focus();   // o foco continua no cabeçalho (teclado: Enter de novo inverte)
    if (o.aoOrdenar) o.aoOrdenar({ ...ordem });
  });

  return {
    atualizar(novas, novoRodape) { linhas = novas || []; rodape = novoRodape || ''; desenhar(); },
    get ordem() { return ordem ? { ...ordem } : null; },
  };
}
