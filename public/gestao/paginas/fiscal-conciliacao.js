// Fiscal/Financeiro > Conciliação de NFs: cada nota fiscal de serviço (NFS) emitida pelo cartão (Ticket: título da fatura de
// reembolso; TruckPag: título/lote de reembolso) e, numa tela própria, as notas fiscais dos postos daquela NFS (recolha de
// notas das APIs; montado pelo vigia em scripts/conciliacao_nfs.mjs). Baixar (CSV ou XLSX, um botão com as duas opções):
// data do lote (emissão da NFS), número da NFS, data de emissão e número da NF do posto, posto, valor da NF e cartão.
import { esc, fmt, isoParaDia } from '../lib/dados.js';
import { criarFiltros } from '../lib/filtros.js';
import { seloCartao, nomeCartao } from '../lib/cartoes.js';
import { planilhaSimples } from '../lib/xlsx-rateio.js';

const BOM = String.fromCharCode(0xfeff);
const brDia = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
const selo = (c) => seloCartao(c, 'ea-cartao');
const moeda = (v) => (v === null || v === undefined ? '—' : fmt.moeda(v));
const temNota = (x) => x.numero !== null && x.numero !== undefined;
const TOLERANCIA = 1;   // R$: diferença até R$ 1,00 conta como conciliada (decisão do usuário)
const ICONE_BAIXAR = '<svg aria-hidden="true"><use href="#i-baixar"/></svg>';

// situação da conciliação: notas recebidas x compras da NFS
function situacao(n) {
  const notas = n.notas.filter(temNota);
  const soma = notas.reduce((s, x) => s + (x.valor || 0), 0);
  const semNota = n.notas.filter((x) => !temNota(x) && x.tipo !== 'Estornada').length;   // compra estornada não precisa de nota
  const dif = (n.valorCompras ?? n.valor ?? 0) - soma;
  const ok = semNota === 0 && Math.abs(dif) <= TOLERANCIA;
  return { notas, soma, semNota, dif, ok, texto: ok ? 'Conciliada' : semNota ? 'Faltam notas' : 'Com diferença' };
}
// botão único de baixar: abre um menu (um só, preso ao <body>, para a área de rolagem da tabela não cortar) com CSV e XLSX
const botaoBaixar = (numero, rotulo) => '<button type="button" class="btn-linha fc-baixar-btn" data-baixar="' + esc(numero) + '" aria-haspopup="menu" aria-expanded="false" title="Baixar a lista detalhada" aria-label="Baixar as notas da NFS ' + esc(numero) + '">' +
  ICONE_BAIXAR + (rotulo ? '<span>' + rotulo + '</span>' : '') + '</button>';

export async function montar(ctx) {
  const { pagina } = ctx;
  pagina.innerHTML = '<div class="carregando"><div class="giro"></div>Carregando as notas fiscais…</div>';
  let d;
  try {
    const r = await fetch('/api/fiscal/conciliacao', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { location.href = '/?entrar=1'; return {}; }
    d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Não foi possível carregar.');
  } catch (e) { pagina.innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return {}; }
  const g = new Date(d.geradoEm);
  const sub = 'Notas fiscais de serviço dos cartões e as notas dos postos de cada uma, pelas APIs. Atualizado em ' +
    g.toLocaleDateString('pt-BR') + ' às ' + g.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
  ctx.definirSub(sub);
  // cada NFS com o dia (filtro de período) e a situação calculados uma vez
  const lista = d.nfs.map((n) => ({ ...n, dia: isoParaDia(n.dataEmissao), sit: situacao(n) }));
  const dias = lista.map((n) => n.dia);
  const estado = { busca: '', aberta: null, rolagem: 0 };

  pagina.innerHTML = `
    <div id="fc-tela-lista">
      <section class="filtros" id="fc-filtros" aria-label="Filtros"></section>
      <div class="chips" id="fc-chips" aria-live="polite"></div>
      <dl class="apoio" id="fc-resumo"></dl>
      <section class="painel painel-tabela">
        <div class="painel-cab"><h2>Notas fiscais de serviço</h2><span class="conta" id="fc-conta"></span></div>
        <div class="tabela-ferramentas">
          <input type="search" id="fc-busca" placeholder="Número da NFS ou da nota do posto…" aria-label="Procurar" autocomplete="off">
        </div>
        ${d.truckpag === 'sem-acesso' ? '<p class="nota">A TruckPag entra aqui quando o acesso à API de títulos dela (usuário e senha próprios) estiver configurado.</p>' : ''}
        <div class="tabela-rolagem fc-notas-rolagem" id="fc-lista-rolagem"><table class="dados" id="fc-lista"></table></div>
      </section>
    </div>
    <div id="fc-tela-notas" hidden></div>`;
  const el = (id) => pagina.querySelector('#' + id);

  const filtros = criarFiltros({
    dimensoes: [
      { id: 'periodo', rotulo: 'Emissão da NFS', periodo: true },
      { id: 'cartao', rotulo: 'Cartão', valor: (n) => nomeCartao(n.cartao) },
      { id: 'situacao', rotulo: 'Conciliação', valor: (n) => n.sit.texto },
      { id: 'pagamento', rotulo: 'Pagamento', valor: (n) => (n.pagamento ? 'Paga' : 'Em aberto') },
      { id: 'vencimento', rotulo: 'Mês de vencimento', valor: (n) => (n.vencimento ? n.vencimento.slice(5, 7) + '/' + n.vencimento.slice(0, 4) : 'Sem vencimento') },
    ],
    filtrosEl: el('fc-filtros'), chipsEl: el('fc-chips'), rota: '#/fiscal-conciliacao',
    obterBase: () => lista, obterLimites: () => [Math.min(...dias), Math.max(...dias)], aoMudar: () => desenharLista(), prefixo: 'fc',
  });

  function visiveis() {
    const b = estado.busca.replace(/\D/g, '');
    return lista.filter((n) => filtros.passa(n) && (!b || n.numero.includes(b) || n.notas.some((x) => String(x.numero ?? '').includes(b))));
  }
  function desenharLista() {
    filtros.atualizarUI();
    const ls = visiveis();
    const total = ls.reduce((s, n) => s + (n.valor || 0), 0), notas = ls.reduce((s, n) => s + n.sit.notas.length, 0);
    el('fc-resumo').innerHTML = '<div><dt>NFS</dt><dd class="num">' + fmt.int(ls.length) + '</dd></div><div><dt>Valor das NFS</dt><dd class="num">' + moeda(total) + '</dd></div>' +
      '<div><dt>Notas dos postos</dt><dd class="num">' + fmt.int(notas) + '</dd></div><div><dt>Conciliadas</dt><dd class="num">' + fmt.int(ls.filter((n) => n.sit.ok).length) + '</dd></div>';
    el('fc-conta').textContent = fmt.int(ls.length) + ' NFS';
    // a conciliação vem logo depois do número: é o que se procura primeiro e não some em tela estreita (no celular a linha vira cartão)
    el('fc-lista').innerHTML = '<thead><tr><th><span>Nº da NFS</span></th><th><span>Conciliação</span></th><th><span>Cartão</span></th><th><span>Emissão</span></th><th><span>Vencimento</span></th>' +
      '<th class="n"><span>Valor da NFS</span></th><th class="n"><span>Notas dos postos</span></th><th class="acoes-linha"><span>Baixar</span></th></tr></thead><tbody>' +
      (ls.length ? ls.map((n) => '<tr class="fc-linha" data-nfs="' + esc(n.numero) + '" tabindex="0" title="Abrir as notas da NFS ' + esc(n.numero) + '"><td data-rotulo="NFS"><strong>' + esc(n.numero) + '</strong></td>' +
          '<td data-rotulo="Conciliação">' + (n.sit.ok ? '<span class="sit sit-ok">Conciliada</span>' : '<span class="sit sit-alerta">' + (n.sit.semNota ? n.sit.semNota + ' sem nota' : 'Diferença ' + moeda(n.sit.dif)) + '</span>') + '</td>' +
          '<td data-rotulo="Cartão">' + selo(n.cartao) + '</td><td data-rotulo="Emissão">' + brDia(n.dataEmissao) + '</td><td data-rotulo="Vencimento">' + brDia(n.vencimento) +
          (n.pagamento ? '<small class="cidade-linha">paga ' + brDia(n.pagamento) + '</small>' : '') + '</td>' +
          '<td class="n" data-rotulo="Valor da NFS">' + moeda(n.valor) + '</td><td class="n" data-rotulo="Notas dos postos">' + fmt.int(n.sit.notas.length) + '<small class="cidade-linha">' + moeda(n.sit.soma) + '</small></td>' +
          '<td class="acoes-linha">' + botaoBaixar(n.numero) + '</td></tr>').join('')
        : '<tr><td colspan="8"><div class="vazio">Nenhuma NFS com esse filtro.</div></td></tr>') + '</tbody>';
  }

  // ---------- tela das notas de uma NFS ----------
  function abrirNotas(numero) {
    estado.aberta = numero; estado.rolagem = window.scrollY; estado.rolagemLista = el('fc-lista-rolagem').scrollTop;
    el('fc-tela-lista').hidden = true;
    const t = el('fc-tela-notas'); t.hidden = false;
    const n = lista.find((x) => x.numero === numero), s = n.sit;
    ctx.definirSub('NFS ' + n.numero + ' · ' + (nomeCartao(n.cartao)) + ' · notas dos postos');
    // primeiro as pendências (sem nota), depois as notas; compras estornadas (se anulam com o estorno) ficam de fora
    const ordem = (x) => (x.tipo === 'Sem nota' ? 0 : 1);
    const linhas = n.notas.filter((x) => x.tipo !== 'Estornada').sort((a, b) => ordem(a) - ordem(b) || String(a.posto).localeCompare(String(b.posto), 'pt-BR') ||
      String(a.dataEmissao || a.dataTransacao || '').localeCompare(String(b.dataEmissao || b.dataTransacao || '')));
    const transacao = (x) => (x.transacao ? '<small class="cidade-linha">transação ' + esc(x.transacao) + (x.placa ? ' · ' + esc(x.placa) : '') +
      (x.dataTransacao ? ' · ' + brDia(x.dataTransacao) + ' ' + esc(x.dataTransacao.slice(11, 16)) : '') + '</small>' : '');
    t.innerHTML = '<div class="fc-topo"><button type="button" class="btn" id="fc-voltar"><svg aria-hidden="true"><use href="#i-recolher"/></svg><span class="txt">Voltar às NFS</span></button>' +
      botaoBaixar(n.numero, 'Baixar') + '</div>' +
      '<section class="painel painel-tabela"><div class="painel-cab"><h2>NFS ' + esc(n.numero) + ' ' + selo(n.cartao) + '</h2><span class="conta">' + fmt.int(s.notas.length) + ' notas</span></div>' +
      '<dl class="apoio"><div><dt>Emissão (data do lote)</dt><dd>' + brDia(n.dataEmissao) + '</dd></div><div><dt>Vencimento</dt><dd>' + brDia(n.vencimento) + '</dd></div>' +
      '<div><dt>Valor da NFS</dt><dd class="num">' + moeda(n.valor) + '</dd></div><div><dt>Compras na fatura</dt><dd class="num">' + moeda(n.valorCompras) + ' <small class="rt-quem">' + fmt.int(n.compras) + ' transações</small></dd></div>' +
      '<div><dt>Soma das notas</dt><dd class="num">' + moeda(s.soma) + (s.ok ? ' <small class="selo-ok">conciliada</small>' : ' <small class="aviso-linha">diferença ' + moeda(s.dif) + '</small>') + '</dd></div></dl>' +
      '<div class="tabela-rolagem fc-notas-rolagem"><table class="dados"><thead><tr><th><span>Posto</span></th><th><span>Nº da NF</span></th><th><span>Emissão da NF</span></th><th class="n"><span>Valor da NF</span></th><th><span>Tipo</span></th><th><span>Razão social</span></th></tr></thead><tbody>' +
      linhas.map((x) => (!temNota(x)
        ? '<tr class="fc-sem-nota"><td>' + esc(x.posto) + transacao(x) + '</td><td colspan="2"><span class="aviso-linha">Nota ainda não recolhida</span></td><td class="n">' + (x.valorPosto ? '<small class="rt-quem">' + (x.transacao ? 'transação ' : 'compras ') + moeda(x.valorPosto) + '</small>' : '—') + '</td><td>—</td><td>—</td></tr>'
        : '<tr><td>' + esc(x.posto) + '</td><td><strong>' + esc(x.numero) + '</strong>' + (x.serie ? '<small class="cidade-linha">série ' + esc(x.serie) + '</small>' : '') + '</td><td>' + brDia(x.dataEmissao) + '</td>' +
          '<td class="n">' + moeda(x.valor) + '</td><td>' + esc(x.tipo) + '</td><td class="trunc" title="' + esc(x.razaoSocial || '') + '">' + esc(x.razaoSocial || '') + '</td></tr>')).join('') +
      '</tbody></table></div></section>';
    el('fc-voltar').addEventListener('click', voltar);
    window.scrollTo(0, 0);
    el('fc-voltar').focus();
  }
  function voltar() {
    const numero = estado.aberta;
    estado.aberta = null;
    el('fc-tela-notas').hidden = true; el('fc-tela-notas').innerHTML = '';
    el('fc-tela-lista').hidden = false;
    ctx.definirSub(sub);
    window.scrollTo(0, estado.rolagem);
    el('fc-lista-rolagem').scrollTop = estado.rolagemLista || 0;
    const b = el('fc-lista').querySelector('tr[data-nfs="' + numero + '"]'); if (b) b.focus();
  }

  // ---------- arquivos ----------
  function linhasArquivo(n) {
    return n.notas.filter((x) => x.tipo !== 'Estornada').sort((a, b) => String(a.posto).localeCompare(String(b.posto), 'pt-BR')).map((x) => [n.dataEmissao, n.numero, x.dataEmissao || null,
      x.numero ?? null, x.posto || x.razaoSocial || '', x.valor ?? null, nomeCartao(n.cartao)]);
  }
  const CAB = ['Data do lote (emissão da NFS)', 'Número da NFS', 'Data de emissão da NF', 'Número da NF', 'Posto', 'Valor da NF', 'Cartão'];
  function salvar(nome, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function baixar(n, formato) {
    if (formato === 'xlsx') {
      return salvar('NFS ' + n.numero + '.xlsx', planilhaSimples({ aba: 'NFS ' + n.numero, cabecalho: CAB, linhas: linhasArquivo(n),
        tipos: ['data', 'texto', 'data', 'numero', 'texto', 'moeda', 'texto'], larguras: [16, 15, 15, 13, 42, 15, 11] }));
    }
    const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const linhas = linhasArquivo(n).map((l) => [brDia(l[0]), q(l[1]), l[2] ? brDia(l[2]) : '', l[3] ?? '', q(l[4]), l[5] === null ? '' : Number(l[5]).toFixed(2).replace('.', ','), q(l[6])].join(';'));
    salvar('NFS ' + n.numero + '.csv', new Blob([BOM + [CAB.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  }
  document.querySelectorAll('.fc-menu').forEach((m) => m.remove());   // de uma abertura anterior da página
  const menu = document.createElement('div');
  menu.className = 'fc-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  menu.innerHTML = '<button type="button" role="menuitem" data-formato="csv">CSV</button><button type="button" role="menuitem" data-formato="xlsx">XLSX (Excel)</button>';
  document.body.appendChild(menu);
  let doBotao = null;
  function fecharMenus() {
    if (!menu.hidden) { menu.hidden = true; if (doBotao) doBotao.setAttribute('aria-expanded', 'false'); }
    if (!pagina.isConnected) menu.remove();   // saiu da página
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-formato]'); if (!b) return;
    const n = lista.find((x) => x.numero === menu.dataset.nfs);
    fecharMenus();
    if (n) baixar(n, b.dataset.formato);
  });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharMenus(); if (doBotao) doBotao.focus(); } });
  pagina.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.baixar !== undefined) {
      const abrir = menu.hidden || doBotao !== b;
      fecharMenus();
      if (!abrir) return;
      doBotao = b; menu.dataset.nfs = b.dataset.baixar; menu.hidden = false; b.setAttribute('aria-expanded', 'true');
      const r = b.getBoundingClientRect();
      menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
      menu.style.left = Math.max(8, r.right - menu.offsetWidth) + 'px';
      menu.querySelector('button').focus();
      return;
    }
    fecharMenus();
    // clique em qualquer parte da linha abre as notas daquela NFS
    const tr = !b && e.target.closest('#fc-lista tr[data-nfs]');
    if (tr) abrirNotas(tr.dataset.nfs);
  });
  el('fc-lista').addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-nfs]');
    if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirNotas(tr.dataset.nfs); }
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !pagina.contains(e.target)) fecharMenus(); });
  window.addEventListener('scroll', (e) => { if (!menu.contains(e.target)) fecharMenus(); }, { passive: true, capture: true });
  window.addEventListener('hashchange', () => { if (!pagina.isConnected) menu.remove(); });
  el('fc-busca').addEventListener('input', (e) => { estado.busca = e.target.value; desenharLista(); });
  desenharLista();
  return {};
}