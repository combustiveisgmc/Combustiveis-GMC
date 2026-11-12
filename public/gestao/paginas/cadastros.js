// Cadastros > Placas e Cadastros > Motoristas: a lista da planilha CONTROLES\Controle_motoristas_e_placas.xlsx
// (abas "Carros" e "Motoristas") e a edição dela. Cada alteração fica pendente até o vigia do computador da
// sincronização gravá-la na planilha; depois a lista é publicada de novo. Os campos vêm do servidor (lib/cadastros.js).
import { esc, fmt } from '../lib/dados.js';
import { criarFiltros } from '../lib/filtros.js';

const NOME_ESTADO = { pendente: 'Aguardando gravação', aguardando: 'Planilha aberta no Excel', aplicada: 'Gravada na planilha', erro: 'Erro ao gravar' };
const emAberto = (a) => a.estado === 'pendente' || a.estado === 'aguardando';
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmp = (a, b) => semAcento(a).localeCompare(semAcento(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
const fNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const TEXTO = {
  placas: { um: 'placa', varios: 'placas', busca: 'Placa, modelo ou marca…', novo: 'Adicionar placa', aba: 'Carros' },
  motoristas: { um: 'motorista', varios: 'motoristas', busca: 'Nome ou CPF…', novo: 'Adicionar motorista', aba: 'Motoristas' },
};
// filtros de seleção múltipla (a mesma barra dos dashboards); campo vazio vira uma opção própria
const valorOu = (campo, vazio) => (r) => (r[campo] === null || r[campo] === undefined || r[campo] === '' ? vazio : String(r[campo]));
const DIMENSOES = {
  placas: [
    { id: 'unidade', rotulo: 'Unidade', valor: valorOu('unidade', '(sem unidade)') },
    { id: 'categoria', rotulo: 'Categoria', valor: valorOu('categoria', '(sem categoria)') },
    { id: 'marca', rotulo: 'Marca', valor: valorOu('marca', '(sem marca)') },
    { id: 'situacao', rotulo: 'Situação', valor: valorOu('situacao', 'ATIVA') },
  ],
  motoristas: [
    { id: 'unidade', rotulo: 'Unidade', valor: valorOu('unidade', '(sem unidade)') },
    { id: 'situacao', rotulo: 'Situação', valor: valorOu('situacao', '(sem situação)') },
  ],
};

export async function montar(ctx, tipo) {
  const { pagina } = ctx;
  const T = TEXTO[tipo];
  pagina.innerHTML = '<div class="carregando"><div class="giro"></div>Carregando o cadastro de ' + T.varios + '…</div>';
  let info = null;
  async function carregar() {
    const r = await fetch('/api/cadastros/' + tipo, { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { location.href = '/?entrar=1'; throw new Error('sessão'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível ler o cadastro. Recarregue a página.');
    info = j;
  }
  try { await carregar(); } catch (e) {
    pagina.innerHTML = '<div class="vazio">' + esc(e.message) + '</div>';
    return {};
  }
  if (!info.lista) {
    pagina.innerHTML = '<div class="vazio"><strong>A lista ainda não foi publicada.</strong> O computador da sincronização envia a planilha ' +
      'de placas e motoristas em instantes; abra esta página de novo daqui a pouco.</div>';
    return {};
  }
  // campos ocultos (matrícula, código Ticket, ID TruckPag) ficam fora da tabela e do formulário; o histórico ainda os mostra
  const todos = info.campos, campos = todos.filter((c) => !c.oculto), K = info.chave, editar = info.podeEditar;
  const campo = (id) => todos.find((c) => c.id === id);
  ctx.definirSub(editar
    ? 'Planilha de controle de ' + T.varios + '. As alterações feitas aqui são gravadas na planilha pelo computador da sincronização.'
    : 'Consulta da planilha de controle de ' + T.varios + '.');

  const estado = { busca: '', senhas: false, ordem: { col: tipo === 'placas' ? 'placa' : 'nome', dir: 1 } };
  const temSenhas = campos.some((c) => c.tipo === 'senha');

  pagina.innerHTML = `
    <section class="filtros" id="cd-filtros" aria-label="Filtros"></section>
    <div class="chips" id="cd-chips" aria-live="polite"></div>
    <dl class="apoio apoio-topo" id="cd-resumo"></dl>
    <div class="aviso-pendencias oculto" id="cd-pendencias" role="status"></div>
    <section class="painel painel-tabela">
      <div class="painel-cab">
        <h2>${tipo === 'placas' ? 'Placas cadastradas' : 'Motoristas cadastrados'}</h2>
        <div class="acoes-cab">
          ${temSenhas ? '<button type="button" class="btn" id="cd-senhas" aria-pressed="false"><svg aria-hidden="true"><use href="#i-olho"/></svg><span class="txt">Mostrar senhas</span></button>' : ''}
          ${editar ? '<button type="button" class="btn btn-principal" id="cd-adicionar"><svg aria-hidden="true"><use href="#i-mais"/></svg><span class="txt">' + T.novo + '</span></button>' : ''}
        </div>
      </div>
      <div class="tabela-ferramentas">
        <input type="search" id="cd-busca" placeholder="${T.busca}" aria-label="Procurar" autocomplete="off">
        <span class="conta" id="cd-conta"></span>
      </div>
      <div class="tabela-rolagem tabela-alta"><table class="dados" id="cd-tabela"></table></div>
    </section>
    ${editar ? `<section class="painel">
      <div class="painel-cab"><h2>Alterações feitas pelo portal</h2><span class="conta" id="cd-conta-hist"></span></div>
      <div class="tabela-rolagem tabela-historico"><table class="dados" id="cd-historico"></table></div>
    </section>` : ''}

    <dialog class="dialogo dialogo-largo" id="cd-dialogo" aria-labelledby="cd-dlg-titulo">
      <form id="cd-form" novalidate>
        <h2 id="cd-dlg-titulo"></h2>
        <p class="dialogo-explica" id="cd-dlg-explica"></p>
        <p class="erro-form oculto" id="cd-erro" role="alert"></p>
        <div class="grade-form" id="cd-campos"></div>
        <label class="cd-cartoes oculto" id="cd-cartoes"><input type="checkbox" name="cartoes" checked>
          <span><strong>Cadastrar também nos sites dos cartões frota</strong> (Ticket e TruckPag). Desmarque se o motorista já estiver lá.</span></label>
        <div class="dialogo-acoes">
          <button type="button" class="btn" id="cd-cancelar">Cancelar</button>
          <button type="submit" class="btn btn-principal" id="cd-salvar"></button>
        </div>
      </form>
    </dialog>`;
  const $ = (id) => pagina.querySelector('#' + id);
  const dlg = $('cd-dialogo'), form = $('cd-form');

  // ---------- valores ----------
  const numerico = (c) => c.tipo === 'inteiro' || c.tipo === 'decimal' || c.tipo === 'calculado';
  // ano e outros inteiros sem separador de milhar (2009, não 2.009); decimais com vírgula
  const paraCampo = (c, v) => (v === null || v === undefined ? '' : c.tipo === 'inteiro' ? String(v)
    : numerico(c) && typeof v === 'number' ? fNum.format(v) : String(v));
  function celula(c, v) {
    if (v === null || v === undefined || v === '') return '<span class="sem-dado">—</span>';
    if (c.tipo === 'senha') return estado.senhas ? '<span class="num">' + esc(v) + '</span>' : '<span class="senha-oculta" title="Use Mostrar senhas">••••</span>';
    if (numerico(c)) return '<span class="num">' + esc(paraCampo(c, v)) + '</span>';
    if (c.tipo === 'opcao') return '<span class="sit ' + (v === c.padrao ? 'sit-ok' : 'sit-ruim') + '">' + esc(v) + '</span>';
    return esc(v);
  }
  const chaveNorm = (v) => (tipo === 'placas' ? String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '') : String(v || '').replace(/\D/g, ''));

  // mesmas fórmulas da aba Carros (H e J), para a linha alterada que ainda não voltou da planilha
  function calcularPlaca(r) {
    r.pontoCritico = r.meta > 0 ? Math.round((r.meta - 0.5) * 1000) / 1000 : null;
    r.autonomia = r.meta && r.capTanque ? Math.round(r.capTanque * r.meta * 0.75 * 1000) / 1000 : null;
  }
  // Alteração gravada na planilha mas que a lista publicada ainda não traz: o vigia marca "aplicada" e só depois
  // gera e publica a lista de novo (e o KV leva até ~1 min para mostrar a nova). Sem isso o motorista recém-adicionado
  // sumia da tabela nesse intervalo e, como não havia mais pendência, a tela parava de conferir e ele não voltava.
  const semListaNova = (a) => a.estado === 'aplicada' && a.aplicada_em &&
    (!info.atualizadoEm || Date.parse(info.atualizadoEm) < Date.parse(a.aplicada_em));
  const naSobreposicao = (a) => emAberto(a) || semListaNova(a);
  // linhas da planilha com as alterações ainda não publicadas por cima (aparecem com o selo)
  function linhas() {
    const pend = info.alteracoes.filter(naSobreposicao).slice().reverse();   // da mais antiga para a mais nova
    const lista = info.lista.map((r) => ({ ...r }));
    const naLista = new Set(lista.map((r) => chaveNorm(r[K])));
    for (const a of pend) {
      // alterações gravadas até 10/11/2026 têm a senha mascarada ("••••"): essa não sobrescreve a da lista
      const dados = Object.fromEntries(Object.entries(a.dados).filter(([k, v]) => !(campo(k) && campo(k).tipo === 'senha' && v === '••••')));
      if (a.acao === 'editar') {
        const r = lista.find((x) => chaveNorm(x._chaveOriginal ?? x[K]) === chaveNorm(a.chave));
        if (!r) continue;
        if (r._chaveOriginal === undefined) r._chaveOriginal = r[K];
        Object.assign(r, dados);
        r._pendente = a;
        if (tipo === 'placas' && ('meta' in dados || 'capTanque' in dados)) calcularPlaca(r);
      } else {
        if (!emAberto(a) && naLista.has(chaveNorm(a.chave))) continue;   // a lista nova já chegou
        const r = { ...dados, _pendente: a, _novo: true };
        if (tipo === 'placas') calcularPlaca(r);
        lista.push(r);
      }
    }
    return lista;
  }

  // ---------- filtros (várias opções por filtro; ficam no endereço da página, como nos dashboards) ----------
  const filtros = criarFiltros({
    dimensoes: DIMENSOES[tipo], filtrosEl: $('cd-filtros'), chipsEl: $('cd-chips'), rota: '#/cadastro-' + tipo,
    obterBase: () => linhas(), obterLimites: () => [0, 0], aoMudar: () => desenhar(), prefixo: 'cd',
  });

  let visiveis = [];
  let ultimoSalvo = null;   // {id, chave} da última alteração salva nesta tela (para avisar se o filtro a esconder)
  function desenhar() {
    filtros.atualizarUI();
    const todas = linhas().filter((r) => filtros.passa(r, null));   // o resumo segue os filtros
    const pend = info.alteracoes.filter(emAberto);
    const at = info.atualizadoEm ? new Date(info.atualizadoEm) : null;
    const resumo = [
      [tipo === 'placas' ? 'Placas' : 'Motoristas', fmt.int(todas.length)],
      ['Unidades', fmt.int(new Set(todas.map((r) => r.unidade).filter(Boolean)).size)],
      tipo === 'placas' ? ['Sem meta', fmt.int(todas.filter((r) => !r.meta).length)] : ['Sem situação', fmt.int(todas.filter((r) => !r.situacao).length)],
      tipo === 'placas' ? ['Desabilitadas', fmt.int(todas.filter((r) => r.situacao === 'DESABILITADA').length)] : ['Sem senha Ticket', fmt.int(todas.filter((r) => !r.senhaTicket).length)],
      ['Lista lida da planilha em', at ? at.toLocaleDateString('pt-BR') + ' ' + at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'],
    ];
    $('cd-resumo').innerHTML = resumo.map(([d, v]) => '<div><dt>' + esc(d) + '</dt><dd><span class="num">' + esc(v) + '</span></dd></div>').join('');

    const noExcel = pend.filter((a) => a.estado === 'aguardando').length;
    const gravadas = info.alteracoes.filter(semListaNova).length;
    // item salvo por quem está na tela mas escondido pelos filtros ou pela busca: avisa em vez de sumir calado
    const t = semAcento(estado.busca.trim());
    const tPlaca = t.replace(/[^a-z0-9]/g, '');
    const tDig = estado.busca.replace(/\D/g, '');
    const busca = tipo === 'placas'
      ? (r) => [r.placa, r.modelo, r.marca].some((v) => semAcento(v).replace(/[^a-z0-9]/g, '').includes(tPlaca))
      : (r) => semAcento(r.nome).includes(t) || (tDig.length >= 3 && String(r.cpf || '').replace(/\D/g, '').includes(tDig));
    const salvo = ultimoSalvo && linhas().find((r) => (r._pendente && r._pendente.id === ultimoSalvo.id) || chaveNorm(r[K]) === ultimoSalvo.chave);
    const escondido = salvo && (!filtros.passa(salvo, null) || (t && !busca(salvo))) ? salvo : null;
    const avisos = [];
    if (noExcel) avisos.push(noExcel + (noExcel === 1 ? ' alteração espera' : ' alterações esperam') + ' a planilha de placas e motoristas ser fechada no Excel para ser gravada.');
    else if (pend.length) avisos.push(pend.length + (pend.length === 1 ? ' alteração sendo gravada' : ' alterações sendo gravadas') + ' na planilha. A lista é atualizada logo em seguida.');
    else if (gravadas) avisos.push((gravadas === 1 ? 'Alteração gravada' : 'Alterações gravadas') + ' na planilha. A lista é atualizada em instantes.');
    $('cd-pendencias').classList.toggle('oculto', !avisos.length && !escondido);
    $('cd-pendencias').innerHTML = (avisos.length ? '<svg aria-hidden="true" class="girando"><use href="#i-atualizar"/></svg><span>' + esc(avisos.join(' ')) + '</span>' : '') +
      (escondido ? '<span class="cd-escondido">' + esc((tipo === 'placas' ? 'A placa ' + (escondido.placa || '') : (escondido.nome || 'O motorista')) +
        ' foi salv' + (tipo === 'placas' ? 'a' : 'o') + ', mas não aparece na tabela por causa dos filtros ou da busca.') +
        ' <button type="button" class="link-acao" id="cd-mostrar-salvo">Limpar filtros e busca</button></span>' : '');

    const c = campo(estado.ordem.col);
    visiveis = todas.filter((r) => !t || busca(r))
      .sort((a, b) => {
        const va = a[c.id], vb = b[c.id];
        const vazioA = va === null || va === undefined || va === '', vazioB = vb === null || vb === undefined || vb === '';
        if (vazioA !== vazioB) return vazioA ? 1 : -1;
        const d = vazioA ? 0 : numerico(c) ? (va - vb) : cmp(va, vb);
        return estado.ordem.dir * d || cmp(a[K], b[K]);
      });
    $('cd-conta').textContent = visiveis.length + ' ' + (visiveis.length === 1 ? T.um : T.varios);
    $('cd-tabela').innerHTML = '<thead><tr>' + campos.map((col) => {
      const ativa = estado.ordem.col === col.id;
      return '<th aria-sort="' + (ativa ? (estado.ordem.dir > 0 ? 'ascending' : 'descending') : 'none') + '"' + (numerico(col) ? ' class="n"' : '') +
        '><button type="button" data-col="' + col.id + '"' + (col.explica ? ' title="' + (col.tipo === 'leitura' ? '' : 'Calculado na planilha: ') + esc(col.explica) + '"' : '') + '>' +
        esc(col.rotulo) + (ativa ? '<span class="seta">' + (estado.ordem.dir > 0 ? '▲' : '▼') + '</span>' : '') + '</button></th>';
    }).join('') + (editar ? '<th class="acoes-linha"><span>Ações</span></th>' : '') + '</tr></thead><tbody>' +
      (visiveis.length ? visiveis.map((r, i) => {
        const p = r._pendente;
        const selo = p ? '<span class="selo-pendente" title="' + esc(p.estado === 'aplicada' ? 'Gravada na planilha; a lista é atualizada em instantes' : NOME_ESTADO[p.estado]) + '">' +
          (p.estado === 'aguardando' ? 'planilha aberta' : p.estado === 'aplicada' ? 'gravada, atualizando lista' : 'aguardando gravação') + '</span>' : '';
        const apagada = tipo === 'placas' && r.situacao === 'DESABILITADA';
        return '<tr' + (apagada ? ' class="linha-apagada"' : '') + '>' + campos.map((col, j) => '<td' + (numerico(col) ? ' class="n"' :col.id === 'nome' ? ' class="trunc"' : '') + '>' +
          (j === 0 ? '<strong>' + celula(col, r[col.id]) + '</strong>' + selo : celula(col, r[col.id])) + '</td>').join('') +
          (editar ? '<td class="acoes-linha">' + (r._novo ? '<span class="sem-dado">aguardando</span>'
            : '<button type="button" class="btn-linha" data-editar="' + i + '">Editar</button>' + (tipo === 'placas'
              ? (apagada ? '<button type="button" class="btn-linha btn-linha-bom" data-situacao="ATIVA" data-i="' + i + '">Habilitar</button>'
                : '<button type="button" class="btn-linha btn-linha-ruim" data-situacao="DESABILITADA" data-i="' + i + '">Desabilitar</button>') : '')) + '</td>' : '') + '</tr>';
      }).join('') : '<tr><td colspan="' + (campos.length + 1) + '"><div class="vazio">Nenhum' + (tipo === 'placas' ? 'a placa' : ' motorista') + ' com esses filtros.</div></td></tr>') +
      '</tbody>';
    if (editar) desenharHistorico();
  }

  // ---------- histórico ----------
  function textoAlteracao(a) {
    if (a.acao === 'adicionar') return 'Cadastro novo';
    return Object.keys(a.dados).map((k) => {
      const c = campo(k);
      if (!c) return '';
      if (c.tipo === 'senha') return c.rotulo + ' alterada';
      const antes = a.antes && k in a.antes ? paraCampo(c, a.antes[k]) : '';
      return c.rotulo + ': ' + (antes || 'vazio') + ' → ' + (paraCampo(c, a.dados[k]) || 'vazio');
    }).filter(Boolean).join('; ');
  }
  function desenharHistorico() {
    const alt = info.alteracoes;
    $('cd-conta-hist').textContent = alt.length ? fmt.int(alt.length) + ' mais recentes' : '';
    $('cd-historico').innerHTML = alt.length
      ? '<thead><tr><th><span>Quando</span></th><th><span>Quem</span></th><th><span>O que</span></th><th><span>' + esc(campo(K).rotulo) + '</span></th>' +
        '<th><span>Alteração</span></th><th><span>Gravação na planilha</span></th></tr></thead><tbody>' +
        alt.map((a) => {
          const q = new Date(a.criado_em);
          const cls = a.estado === 'aplicada' ? 'selo-ok' : a.estado === 'erro' ? 'selo-bloq' : 'selo-espera';
          return '<tr><td>' + esc(q.toLocaleDateString('pt-BR') + ' ' + q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + '</td>' +
            '<td>' + esc(a.usuario_nome) + '</td><td>' + (a.acao === 'adicionar' ? 'Adicionou' : 'Editou') + '</td>' +
            '<td><strong>' + esc(a.chave) + '</strong>' + (a.dados.nome && a.acao === 'adicionar' ? '<small class="cidade-linha">' + esc(a.dados.nome) + '</small>' : '') + '</td>' +
            '<td class="trunc">' + esc(textoAlteracao(a) || '—') + '</td>' +
            '<td><span class="selo ' + cls + '">' + esc(NOME_ESTADO[a.estado]) + (a.linha ? ' (linha ' + a.linha + ')' : '') + '</span>' +
              (a.mensagem && a.estado !== 'aplicada' ? '<small class="cidade-linha">' + esc(a.mensagem) + '</small>' : '') + '</td></tr>';
        }).join('') + '</tbody>'
      : '<tbody><tr><td><div class="vazio">Nenhuma alteração feita pelo portal ainda.</div></td></tr></tbody>';
  }

  // ---------- formulário ----------
  let editando = null;   // linha em edição; null = cadastro novo
  $('cd-campos').innerHTML = campos.map((c) => {
    const sug = info.sugestoes[c.id];
    const lista = sug ? ' list="cd-lista-' + c.id + '"' : '';
    const dl = sug ? '<datalist id="cd-lista-' + c.id + '">' + sug.map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist>' : '';
    const modo = c.tipo === 'inteiro' ? ' inputmode="numeric"' : c.tipo === 'decimal' ? ' inputmode="decimal"'
      : c.tipo === 'cpf' ? ' inputmode="numeric" placeholder="000.000.000-00" maxlength="14" data-mascara="cpf"'
      : c.tipo === 'placa' ? ' placeholder="ABC1D23" maxlength="7" data-mascara="placa"'
      : c.tipo === 'data' ? ' inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" data-mascara="data"'
      : c.id === 'senhaTruckpag' ? ' inputmode="numeric" maxlength="4" data-mascara="numeros"' : '';
    const opcional = c.obrigatorio ? '' : c.obrigatorioNovo ? ' <small>(obrigatório para motorista novo)</small>' : ' <small>(opcional)</small>';
    const dica = c.dica ? '<small class="nota-campo">' + esc(c.dica) + '</small>' : '';
    // listas suspensas: as opções são montadas ao abrir (o valor atual entra mesmo se não estiver na lista)
    if (c.tipo === 'opcao') {
      return '<label class="campo-form"><span>' + esc(c.rotulo) + '</span><select name="' + c.id + '"></select></label>';
    }
    if (c.selecao) {
      return '<label class="campo-form"><span>' + esc(c.rotulo) + (c.obrigatorio ? '' : ' <small>(opcional)</small>') + '</span>' +
        '<select name="' + c.id + '" data-selecao="' + c.id + '"></select>' +
        '<input name="' + c.id + '_outra" class="cd-outra" hidden autocomplete="off" spellcheck="false" maxlength="' + (c.max || 80) + '"' +
        ' placeholder="Digite ' + esc(c.rotulo.toLowerCase()) + ' nova" aria-label="' + esc(c.rotulo) + ' nova"></label>';
    }
    if (c.tipo === 'calculado' || c.tipo === 'leitura') {   // leitura: vem das APIs dos cartões
      return '<label class="campo-form"><span>' + esc(c.rotulo) + '</span><input name="' + c.id + '" readonly tabindex="-1" class="campo-calculado">' +
        '<small class="nota-campo">' + (c.tipo === 'calculado' ? 'Calculado na planilha: ' : '') + esc(c.explica) + '</small></label>';
    }
    return '<label class="campo-form' + (c.id === 'nome' ? ' largo' : '') + '"><span>' + esc(c.rotulo) + opcional + '</span>' +
      '<input name="' + c.id + '" autocomplete="off" spellcheck="false"' + lista + modo + '>' + dl + dica + '</label>';
  }).join('');

  // ponto crítico e autonomia acompanham meta e tanque enquanto digita (a planilha recalcula ao abrir)
  const lerNum = (v) => { const t = String(v).trim(); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : null; };
  function recalcular() {
    if (tipo !== 'placas') return;
    const meta = lerNum(form.meta.value), cap = lerNum(form.capTanque.value);
    form.pontoCritico.value = meta > 0 ? fNum.format(meta - 0.5) : '';
    form.autonomia.value = meta && cap ? fNum.format(cap * meta * 0.75) : '';
  }
  form.addEventListener('input', (e) => { if (e.target.name === 'meta' || e.target.name === 'capTanque') recalcular(); });

  // ---------- listas suspensas (situação: opções fixas; unidade: as da planilha + "Outra…") ----------
  const OUTRA = '__outra__';
  const opcao = (v, txt, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(txt ?? v) + '</option>';
  function prepararSelecao(c, atual, novo) {
    const sel = form[c.id];
    if (c.tipo === 'opcao') {
      const valor = novo && !atual ? (c.padrao || '') : atual;
      sel.innerHTML = (valor === '' ? opcao('', '— sem ' + c.rotulo.toLowerCase() + ' —', true) : '') +
        (valor && !c.opcoes.includes(valor) ? opcao(valor, valor + ' (atual)', true) : '') +
        c.opcoes.map((o) => opcao(o, o, o === valor)).join('');
      return;
    }
    const sug = info.sugestoes[c.id] || [];
    sel.innerHTML = opcao('', 'Escolha…', !atual) +
      (atual && !sug.includes(atual) ? opcao(atual, atual, true) : '') +
      sug.map((s) => opcao(s, s, s === atual)).join('') + opcao(OUTRA, 'Outra…');
    const outra = form[c.id + '_outra'];
    outra.value = '';
    outra.hidden = true;
  }
  form.addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.selecao;
    if (!id) return;
    const outra = form[id + '_outra'];
    outra.hidden = e.target.value !== OUTRA;
    if (!outra.hidden) outra.focus();
  });
  // valor digitado/escolhido no formulário
  const lerCampo = (c) => (c.selecao && form[c.id].value === OUTRA ? form[c.id + '_outra'].value : form[c.id].value);
  const elementoDo = (c) => (c.selecao && form[c.id].value === OUTRA ? form[c.id + '_outra'] : form[c.id]);

  function abrir(r) {
    editando = r;
    form.reset();
    $('cd-erro').classList.add('oculto');
    $('cd-dlg-titulo').textContent = r ? (tipo === 'placas' ? 'Editar placa ' + r.placa : 'Editar ' + (r.nome || 'motorista')) : T.novo;
    $('cd-salvar').textContent = r ? 'Salvar alteração' : T.novo;
    $('cd-dlg-explica').textContent = r
      ? 'Só os campos que você mudar são gravados na planilha' + (r.linha ? ' (linha ' + r.linha + ' da aba ' + T.aba + ')' : '') + '.'
      : 'A linha nova entra no fim da aba ' + T.aba + ' da planilha.';
    for (const c of campos) {
      if (c.tipo === 'opcao' || c.selecao) prepararSelecao(c, r ? paraCampo(c, r[c.id]) : '', !r);
      else form[c.id].value = r ? paraCampo(c, r[c.id]) : (c.padrao || '');
    }
    // motorista novo: caixa "cadastrar nos sites dos cartões frota", marcada por padrão (desmarcada, o vigia pula os cartões)
    $('cd-cartoes').classList.toggle('oculto', !(tipo === 'motoristas' && !r));
    form.cartoes.checked = true;
    dlg.showModal();
    (r ? form[campos[1].id] : form[campos[0].id]).focus();
  }
  if (editar) $('cd-adicionar').addEventListener('click', () => abrir(null));
  $('cd-cancelar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = $('cd-erro');
    const valores = {};
    for (const c of campos) if (c.tipo !== 'calculado' && c.tipo !== 'leitura') valores[c.id] = lerCampo(c);
    const falta = campos.find((c) => (c.obrigatorio || (!editando && c.obrigatorioNovo)) && !String(valores[c.id] || '').trim());
    if (falta) {
      erro.textContent = (falta.selecao || falta.tipo === 'opcao' ? 'Escolha ' : 'Preencha ') + falta.rotulo.toLowerCase() + '.'; erro.classList.remove('oculto');
      elementoDo(falta).focus();
      return;
    }
    // ao editar, só vai o que mudou (um valor antigo fora da lista, se não for mexido, não é revalidado)
    const dados = {};
    for (const [k, v] of Object.entries(valores)) if (!editando || v !== paraCampo(campo(k), editando[k])) dados[k] = v;
    if (!Object.keys(dados).length) { erro.textContent = 'Nada foi alterado.'; erro.classList.remove('oculto'); return; }
    const btn = $('cd-salvar'), rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const r = await fetch('/api/cadastros/' + tipo, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: editando ? 'editar' : 'adicionar', chave: editando ? (editando._chaveOriginal ?? editando[K]) : undefined, dados,
          ...(!editando && tipo === 'motoristas' ? { cartoes: form.cartoes.checked } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { location.href = '/?entrar=1'; return; }
      if (!r.ok) { erro.textContent = j.erro || 'Não foi possível salvar. Tente de novo.'; erro.classList.remove('oculto'); return; }
      info.alteracoes.unshift({ ...j.alteracao, mensagem: null, linha: null });
      ultimoSalvo = { id: j.alteracao.id, chave: chaveNorm(j.alteracao.dados[K] ?? j.alteracao.chave) };
      dlg.close();
      desenhar();
      acompanhar();
    } catch (err) {
      erro.textContent = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
      erro.classList.remove('oculto');
    } finally {
      btn.disabled = false; btn.textContent = rotulo;
    }
  });

  // ---------- desabilitar / habilitar placa (só a coluna SITUACAO; o resto da linha fica como está) ----------
  async function mudarSituacao(r, situacao, botao) {
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
      const resp = await fetch('/api/cadastros/' + tipo, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'editar', chave: r._chaveOriginal ?? r[K], dados: { situacao } }),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.status === 401) { location.href = '/?entrar=1'; return; }
      if (!resp.ok) throw new Error(j.erro || 'Não foi possível salvar. Tente de novo.');
      info.alteracoes.unshift({ ...j.alteracao, mensagem: null, linha: null });
      desenhar();
      acompanhar();
    } catch (err) {
      desenhar();
      const a = $('cd-pendencias');
      a.classList.remove('oculto');
      a.innerHTML = '<span>' + esc((situacao === 'DESABILITADA' ? 'Não foi possível desabilitar ' : 'Não foi possível habilitar ') + r.placa + ': ' +
        (err.message === 'Failed to fetch' ? 'sem conexão com o servidor.' : err.message)) + '</span>';
    }
  }

  // ---------- acompanha a gravação: enquanto houver pendência, confere a cada 10 s ----------
  // e continua depois de gravada até a lista nova chegar (por no máximo 15 min, caso o vigia não consiga publicar)
  let tAcomp = null;
  const esperandoLista = (a) => semListaNova(a) && Date.now() - Date.parse(a.aplicada_em) < 15 * 60 * 1000;
  function acompanhar() {
    clearTimeout(tAcomp);
    if (!info.alteracoes.some((a) => emAberto(a) || esperandoLista(a))) return;
    tAcomp = setTimeout(async () => {
      try { await carregar(); desenhar(); } catch (e) {}
      acompanhar();
    }, 10 * 1000);
  }

  $('cd-tabela').addEventListener('click', (e) => {
    const col = e.target.closest('[data-col]');
    if (col) {
      const id = col.dataset.col;
      estado.ordem = estado.ordem.col === id ? { col: id, dir: -estado.ordem.dir } : { col: id, dir: 1 };
      desenhar();
      const novo = $('cd-tabela').querySelector('[data-col="' + id + '"]');
      if (novo) novo.focus();
      return;
    }
    const b = e.target.closest('[data-editar]');
    if (b) abrir(visiveis[Number(b.dataset.editar)]);
    const s = e.target.closest('[data-situacao]');
    if (s) mudarSituacao(visiveis[Number(s.dataset.i)], s.dataset.situacao, s);
  });
  if (temSenhas) {
    $('cd-senhas').addEventListener('click', () => {
      estado.senhas = !estado.senhas;
      $('cd-senhas').setAttribute('aria-pressed', String(estado.senhas));
      $('cd-senhas').querySelector('.txt').textContent = estado.senhas ? 'Ocultar senhas' : 'Mostrar senhas';
      desenhar();
    });
  }
  $('cd-busca').addEventListener('input', (e) => { estado.busca = e.target.value; desenhar(); });
  $('cd-pendencias').addEventListener('click', (e) => {
    if (!e.target.closest('#cd-mostrar-salvo')) return;
    estado.busca = $('cd-busca').value = '';
    filtros.limpar();   // chama desenhar()
  });
  desenhar();
  acompanhar();
  return { desmontar() { clearTimeout(tAcomp); filtros.destruir(); if (dlg.open) dlg.close(); } };
}
