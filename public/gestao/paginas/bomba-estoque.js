// Bomba interna > Estoque: o tanque de cada base (bomba interna) em barras, com volume, capacidade e preço médio à vista.
// O estoque sai dos abastecimentos da Base e da Base_copia (os do Consolidador entram nela primeiro) naquela bomba (posto da
// base) e entra pelas compras (Movimentações), a partir da medição cadastrada na base (lib/bomba.js). "Adicionar base" /
// "Editar" cadastram a bomba, o posto e os tanques.
import { carregarDados, esc } from '../lib/dados.js';
import { NOME_TANQUE, calcularEstoque, fmtMinutos, fmtQuando, agoraLocal, linhasDaCopia, juntarLinhas } from '../lib/bomba.js';

async function obter(url) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 401) { location.href = '/?entrar=1'; throw new Error('sessão'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar (' + r.status + ').');
  return j;
}
const num = (v, c = 0) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
const lerNum = (s) => { const t = String(s ?? '').trim().replace(/\./g, '').replace(',', '.'); return t === '' ? null : Number(t); };

export async function montar(ctx) {
  const { pagina } = ctx;
  pagina.innerHTML = '<div class="carregando"><div class="giro"></div>Carregando o estoque das bombas internas…</div>';
  let dados, bases, podeEditar, podeCriar, movs, manuais;   // podeCriar: só quem vê todas as bases (Gerenciar acessos)
  let saidas, copiaEm = null;   // abastecimentos da Base + Base_copia (lida em copiaEm; null = não deu para ler, só a Base)
  async function carregar() {
    const [d, b, m, a, c] = await Promise.all([carregarDados(), obter('/api/bomba/bases'), obter('/api/bomba/movimentacoes'), obter('/api/bomba/abastecimentos'),
      obter('/gestao/dados/base-copia.json').catch((e) => { if (e.message === 'sessão') throw e; return null; })]);
    dados = d; bases = b.bases; podeEditar = b.podeEditar; podeCriar = b.podeCriar; movs = m.movimentacoes; manuais = a.abastecimentos;
    saidas = c ? juntarLinhas(d.linhas, linhasDaCopia(c)) : d.linhas;
    copiaEm = c ? new Date(c.geradoEm) : null;
  }
  try { await carregar(); } catch (e) {
    if (e.message !== 'sessão') pagina.innerHTML = '<div class="vazio">' + esc(e.message) + ' Recarregue a página para tentar de novo.</div>';
    return {};
  }
  // postos internos que aparecem na Base (sugestões do campo "posto"): bombas internas e, desde 16/11/2026, os cais da Vibra
  // (CAANA, CALAN, CABET, CAAPE: tanques próprios que funcionam como bomba interna)
  const ehCais = (l) => /CAIS VIBRA/i.test(l.tipoEstab || '');
  const postosInternos = [...new Set(dados.linhas.filter((l) => /INTERNO/i.test(l.tipoEstab || '') || ehCais(l)).map((l) => String(l.fornecedor || '').trim().toUpperCase()).filter(Boolean))].sort();
  const postosCais = new Set(dados.linhas.filter(ehCais).map((l) => String(l.fornecedor || '').trim().toUpperCase()));

  pagina.innerHTML = `
    <div class="be-cab">
      
      ${podeCriar ? '<button type="button" class="btn btn-principal" id="be-adicionar"><svg aria-hidden="true"><use href="#i-mais"/></svg><span class="txt">Adicionar base</span></button>' : ''}
    </div>
    <div class="be-grade" id="be-grade"></div>
    <section class="painel oculto" id="be-inativas"><div class="painel-cab"><h2>Bases inativas</h2></div><div id="be-inativas-lista"></div></section>
    <datalist id="be-postos">${postosInternos.map((p) => '<option value="' + esc(p) + '">').join('')}</datalist>
    <dialog class="dialogo" id="be-dialogo" aria-labelledby="be-dlg-titulo">
      <form id="be-form" novalidate>
        <h2 id="be-dlg-titulo">Adicionar base</h2>
        <p class="dialogo-explica">A base é a bomba interna (ou o cais da Vibra). O posto é como ela aparece nos abastecimentos da Base (ex.: POSTO INT RAJA JEQUIE ou CALAN): é por ele que o estoque acha as saídas.</p>
        <p class="erro-form oculto" id="be-erro" role="alert"></p>
        <div class="grade-form">
          <label class="campo-form largo"><span>Nome da base</span><input name="nome" required autocomplete="off" placeholder="Ex.: RAJA LOG JEQUIE…"></label>
          <label class="campo-form largo"><span>Posto nos abastecimentos da Base</span><input name="posto" list="be-postos" required autocomplete="off" spellcheck="false" placeholder="Ex.: POSTO INT RAJA JEQUIE ou CALAN…"></label>
        </div>
        ${['diesel', 'arla'].map((t) => `
        <fieldset class="be-tanque" data-tanque="${t}">
          <legend><label class="ea-alternar"><input type="checkbox" name="tem-${t}"> Tanque de ${NOME_TANQUE[t]}</label></legend>
          <div class="grade-form">
            <label class="campo-form"><span>Capacidade (L)</span><input name="cap-${t}" inputmode="decimal" autocomplete="off"></label>
            <label class="campo-form"><span>Estoque na medição (L)</span><input name="ini-${t}" inputmode="decimal" autocomplete="off"></label>
            <label class="campo-form"><span>Data e hora da medição</span><input name="em-${t}" type="datetime-local"></label>
            <label class="campo-form"><span>Preço médio na medição (R$/L, opcional)</span><input name="preco-${t}" inputmode="numeric" data-moeda="4" autocomplete="off" placeholder="0,0000"></label>
          </div>
        </fieldset>`).join('')}
        <label class="ea-alternar be-ativa"><input type="checkbox" name="ativo" checked> Base ativa (aparece no estoque e na inclusão de abastecimento)</label>
        <p class="nota">Para acertar o estoque depois de uma medição da régua, edite a base e informe o novo estoque com a data e a hora: a conta recomeça dali.</p>
        <div class="dialogo-acoes">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-principal" id="be-salvar">Salvar base</button>
        </div>
      </form>
    </dialog>`;
  const el = (id) => pagina.querySelector('#' + id);
  ctx.definirSub('Estoque dos tanques das bombas internas. Abastecimentos da Base até ' + new Date(dados.diaMax * 864e5).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) +
    (copiaEm ? ' e da Base_copia (Consolidador) lida em ' + copiaEm.toLocaleDateString('pt-BR') + ' às ' + copiaEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.'
      : '. A lista da Base_copia não pôde ser lida agora: os abastecimentos consolidados que ainda não estão na Base ficaram de fora.'));

  function cartao(b) {
    const tanques = ['diesel', 'arla'].map((t) => calcularEstoque(b, t, { linhas: saidas, movimentacoes: movs, manuais })).filter(Boolean);
    const barras = tanques.map((e) => {
      const pct = e.pct === null ? 0 : e.pct;
      const alt = Math.max(0, Math.min(100, pct * 100));
      const nivel = e.volume < 0 ? 'be-negativo' : pct < 0.1 ? 'be-critico' : pct < 0.25 ? 'be-baixo' : '';
      return `<div class="be-tanque-col">
        <div class="be-barra ${nivel}" role="img" aria-label="${esc(NOME_TANQUE[e.tanque])}: ${num(pct * 100)}% (${num(e.volume, 3)} de ${num(e.capacidade, 0)} litros)">
          <div class="be-nivel" style="height:${alt}%"></div>
          <span class="be-pct" style="bottom:${Math.min(alt, 88)}%">${num(pct * 100)}%</span>
        </div>
        <strong class="be-nome-tanque">${esc(NOME_TANQUE[e.tanque])}</strong>
        <dl class="be-info">
          <div><dt>Volume</dt><dd class="num">${num(e.volume, 3)} L</dd></div>
          <div><dt>Capacidade</dt><dd class="num">${num(e.capacidade, 0)} L</dd></div>
          <div><dt>Preço médio</dt><dd class="num">${e.preco === null ? '—' : 'R$ ' + num(e.preco, 2)}</dd></div>
        </dl>
        <small class="be-conta" title="Medição + compras − abastecimentos">Medição ${esc(fmtQuando(e.inicialEm))}: ${num(e.inicial, 0)} L · +${num(e.litrosCompra, 0)} L em ${e.nCompras} compra(s) · −${num(e.litrosSaida, 0)} L em ${e.nSaidas} abastecimento(s)${e.nPendentes ? ' (' + e.nPendentes + ' lançado(s) pelo site, ainda não na Base)' : ''}${e.ultimaSaida ? ' · último ' + esc(fmtMinutos(e.ultimaSaida)) : ''}</small>
        ${e.volume < 0 ? '<small class="aviso-linha">Estoque negativo: confira a medição ou lance as compras que faltam.</small>' : ''}
      </div>`;
    }).join('');
    return `<section class="painel be-cartao" data-base="${b.id}">
      <div class="painel-cab"><h2 title="${esc(b.nome)}">${postosCais.has(String(b.posto || '').toUpperCase()) ? 'CAIS VIBRA' : 'BOMBA INTERNA'} - ${esc(b.nome)}</h2>${podeEditar ? '<button type="button" class="btn-linha" data-editar="' + b.id + '">Editar</button>' : ''}</div>
      <p class="nota be-posto">${esc(b.posto)}</p>
      <div class="be-tanques">${barras}</div>
    </section>`;
  }

  function desenhar() {
    const ativas = bases.filter((b) => b.ativo), inativas = bases.filter((b) => !b.ativo);
    el('be-grade').innerHTML = ativas.length ? ativas.map(cartao).join('')
      : '<div class="vazio">Nenhuma base cadastrada.' + (podeCriar ? ' Clique em "Adicionar base" para cadastrar a primeira bomba interna.' : '') + '</div>';
    el('be-inativas').classList.toggle('oculto', !inativas.length || !podeEditar);
    el('be-inativas-lista').innerHTML = inativas.map((b) => '<p>' + esc(b.nome) + ' <small class="cidade-linha">' + esc(b.posto) + '</small> <button type="button" class="btn-linha" data-editar="' + b.id + '">Editar</button></p>').join('');
  }

  // ---------- adicionar / editar base ----------
  let editando = null;
  const f = el('be-form');
  function abrir(b) {
    editando = b || null;
    f.reset();
    el('be-erro').classList.add('oculto');
    el('be-dlg-titulo').textContent = b ? 'Editar base: ' + b.nome : 'Adicionar base';
    f.nome.value = b ? b.nome : '';
    f.posto.value = b ? b.posto : '';
    f.ativo.checked = b ? !!b.ativo : true;
    for (const t of ['diesel', 'arla']) {
      const c = b && b.tanques[t];
      f['tem-' + t].checked = b ? !!c : t === 'diesel';
      f['cap-' + t].value = c ? num(c.capacidade, 0) : '';
      f['ini-' + t].value = c ? num(c.inicial, 0) : '';
      f['em-' + t].value = c ? c.inicialEm : agoraLocal();
      f['preco-' + t].value = c && c.precoInicial ? String(c.precoInicial).replace('.', ',') : '';
    }
    atualizarTanques();
    el('be-dialogo').showModal();
    f.nome.focus();
  }
  function atualizarTanques() {
    pagina.querySelectorAll('.be-tanque').forEach((fs) => {
      const t = fs.dataset.tanque, ligado = f['tem-' + t].checked;
      fs.classList.toggle('be-desligado', !ligado);
      fs.querySelectorAll('.grade-form input').forEach((i) => { i.disabled = !ligado; });
    });
  }
  pagina.querySelectorAll('.be-tanque input[type="checkbox"]').forEach((c) => c.addEventListener('change', atualizarTanques));
  el('be-dialogo').querySelector('[data-fechar]').addEventListener('click', () => el('be-dialogo').close());
  pagina.addEventListener('click', (e) => {
    if (e.target.closest('#be-adicionar')) { abrir(null); return; }
    const b = e.target.closest('[data-editar]');
    if (b) abrir(bases.find((x) => x.id === Number(b.dataset.editar)));
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tanques = {};
    for (const t of ['diesel', 'arla']) {
      tanques[t] = f['tem-' + t].checked ? {
        capacidade: lerNum(f['cap-' + t].value), inicial: lerNum(f['ini-' + t].value), inicialEm: f['em-' + t].value,
        precoInicial: lerNum(f['preco-' + t].value),
      } : null;
    }
    const corpo = { id: editando ? editando.id : undefined, nome: f.nome.value, posto: f.posto.value, ativo: f.ativo.checked, tanques };
    const btn = el('be-salvar'), erro = el('be-erro');
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const r = await fetch('/api/bomba/bases', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { location.href = '/?entrar=1'; return; }
      if (!r.ok) { erro.textContent = j.erro || 'Não foi possível salvar.'; erro.classList.remove('oculto'); return; }
      bases = j.bases;
      el('be-dialogo').close();
      desenhar();
    } catch {
      erro.textContent = 'Sem conexão com o servidor. Tente de novo.'; erro.classList.remove('oculto');
    } finally {
      btn.disabled = false; btn.textContent = 'Salvar base';
    }
  });

  desenhar();
  const aoAtualizarDados = () => carregar().then(desenhar).catch(() => {});
  window.addEventListener('dados-atualizados', aoAtualizarDados);
  return { desmontar() { window.removeEventListener('dados-atualizados', aoAtualizarDados); if (el('be-dialogo').open) el('be-dialogo').close(); } };
}
