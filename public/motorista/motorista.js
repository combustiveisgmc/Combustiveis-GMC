// Área do motorista: espelho da Operação por motorista (gestão) só com os abastecimentos de quem entrou.
// Mesmas regras: só diesel (todos os tipos), só veículos com categoria na aba Metas, exceto PICAPE e VENDA;
// Litros se meta = km ÷ meta da placa; Economia = Litros se meta − Litros; Média = km ÷ litros; Meta = km ÷ Litros se meta.
const CATEGORIAS_FORA = new Set(['PICAPE', 'VENDA']);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const f = (c) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const n0 = f(0), n1 = f(1), n2 = f(2);
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ok = (v) => v !== null && v !== undefined && isFinite(v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mesDoDia = (d) => { const x = new Date(d * 864e5); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
const nomeMes = (m, curto) => (curto ? MES_CURTO[m % 12] + '/' + String(Math.floor(m / 12)).slice(2) : MESES[m % 12] + ' de ' + Math.floor(m / 12));
const fmtDia = (d, seg) => { const x = new Date(d * 864e5 + (seg || 0) * 1000), p = (v) => String(v).padStart(2, '0');
  return p(x.getUTCDate()) + '/' + p(x.getUTCMonth() + 1) + (seg !== null && seg !== undefined ? ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes()) : ''); };
const pagina = document.getElementById('pagina');

document.getElementById('sair').addEventListener('click', async () => {
  try { await fetch('/api/motorista/sair', { method: 'POST', credentials: 'same-origin' }); } catch {}
  location.href = '/';
});

function somar(ls) {
  let km = 0, litros = 0, litrosMeta = 0;
  for (const l of ls) { km += l.km; litros += l.litros; litrosMeta += l.litrosMeta; }
  const media = litros ? km / litros : null, meta = litrosMeta ? km / litrosMeta : null;
  return { qtd: ls.length, km, litros, litrosMeta, media, meta, pct: media && meta ? media / meta : null, economia: litrosMeta - litros };
}
// faixas do % da meta (as mesmas do portal): 100%+ verde · 95 a 100% verde-claro · 90 a 95% amarelo · menos de 90% vermelho
const classe = (p) => (!ok(p) ? '' : p >= 1 ? 'mt-bom' : p >= 0.95 ? 'mt-quase' : p >= 0.9 ? 'mt-atencao' : 'mt-ruim');
// medidor em meio círculo (o mesmo desenho do portal da gestão): o arco cheio é a meta
function medidor(t) {
  const p = ok(t.pct) ? Math.min(1, t.pct) : 0;
  const arco = 'M20 100 A80 80 0 0 1 180 100';
  return '<div class="mt-arco" role="img" aria-label="' + (ok(t.pct) ? pct.format(t.pct) + ' da meta' : 'sem meta') + '">' +
    '<svg viewBox="0 -6 200 112" aria-hidden="true"><path class="mt-arco-fundo" d="' + arco + '" pathLength="100"/>' +
    '<path class="mt-arco-valor ' + classe(t.pct) + '" d="' + arco + '" pathLength="100" stroke-dasharray="' + (p * 100).toFixed(2) + ' 100"/></svg>' +
    '<div class="mt-arco-centro"><span>' + (ok(t.media) ? n2.format(t.media) : '—') + '</span><small>km/L · meta ' + (ok(t.meta) ? n2.format(t.meta) : '—') + '</small></div></div>';
}

// cada abastecimento: ✓ quando o km/L chegou na meta da placa, ↓ quando ficou abaixo (com texto para leitor de tela)
function marcaMeta(l) {
  if (!l.meta || !l.litros || !l.km) return '';
  return l.km / l.litros >= l.meta ? '<b class="mt-marca mt-bom" title="Dentro da meta">✓<span class="mt-sr"> dentro da meta</span></b>'
    : '<b class="mt-marca mt-ruim" title="Abaixo da meta">↓<span class="mt-sr"> abaixo da meta</span></b>';
}

// senhas dos cartões do motorista: cartões grandes no topo, fáceis de ler na bomba (o "Ocultar" fica lembrado no celular)
const CARTOES = [['ticket', 'Ticket Log'], ['truckpag', 'TruckPag'], ['veloe', 'Veloe']];
// abrem ocultas (na bomba, alguém do lado pode ver); se o motorista tocar em "Mostrar", o aparelho lembra
const lerOculto = () => { try { return localStorage.getItem('mt-senhas-ocultas') !== '0'; } catch { return true; } };
function htmlSenhas(senhas) {
  const ls = CARTOES.filter(([k]) => senhas && senhas[k]);
  if (!ls.length) return '<section class="mt-cartao" aria-labelledby="mt-t0"><h2 id="mt-t0">Suas senhas dos cartões</h2>' +
    '<p class="mt-nota">Nenhuma senha cadastrada no seu nome. Fale com a gestão de combustível.</p></section>';
  const oculto = lerOculto();
  return '<section class="mt-cartao mt-senhas' + (oculto ? ' mt-senhas-ocultas' : '') + '" aria-labelledby="mt-t0">' +
    '<div class="mt-senhas-topo"><h2 id="mt-t0">Suas senhas dos cartões</h2>' +
    '<button type="button" class="mt-senhas-botao" id="mt-senhas-ver" aria-pressed="' + oculto + '">' + (oculto ? 'Mostrar' : 'Ocultar') + '</button></div>' +
    '<ul class="mt-senhas-lista">' + ls.map(([k, nome]) => '<li class="mt-senha mt-senha-' + k + '"><span class="mt-senha-cartao">' + nome + '</span>' +
      '<span class="mt-senha-num" aria-label="Senha ' + nome + ': ' + esc(String(senhas[k]).split('').join(' ')) + '">' +
      '<span class="mt-senha-valor">' + esc(senhas[k]) + '</span><span class="mt-senha-pontos" aria-hidden="true">' + '•'.repeat(String(senhas[k]).length) + '</span></span></li>').join('') +
    '</ul><p class="mt-nota">Não passe suas senhas para ninguém. Se precisar trocar, fale com a gestão de combustível.</p></section>';
}
// o botão Ocultar/Mostrar (a página é redesenhada ao trocar o mês: o ouvinte fica no documento)
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#mt-senhas-ver');
  if (!b) return;
  const sec = b.closest('.mt-senhas'), oculto = !sec.classList.contains('mt-senhas-ocultas');
  sec.classList.toggle('mt-senhas-ocultas', oculto);
  b.textContent = oculto ? 'Mostrar' : 'Ocultar';
  b.setAttribute('aria-pressed', String(oculto));
  try { localStorage.setItem('mt-senhas-ocultas', oculto ? '1' : '0'); } catch {}
});

// ---------- postos autorizados (design-system/MOTORISTA.md): os mesmos da tela inicial, já na unidade do motorista ----------
const CORES_CARTAO = { TICKETLOG: ['#2F7D32', '#FFFFFF'], TICKET: ['#2F7D32', '#FFFFFF'], VELOE: ['#4B2E83', '#FFFFFF'], TRUCKPAG: ['#278187', '#FFFFFF'], IDENTIFICACAO: ['#1D4E9B', '#FFFFFF'] };
const NOME_CARTAO = { TICKETLOG: 'Ticket', TICKET: 'Ticket', TRUCKPAG: 'TruckPag', VELOE: 'Veloe', IDENTIFICACAO: 'Identificação', VIBRA: 'Vibra' };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const chaveCartao = (c) => semAcento(c).toUpperCase().replace(/\s+/g, '');
const nomeCartao = (c) => NOME_CARTAO[chaveCartao(c)] || c || 'Não informado';
// unidade do cadastro (centro de custo) -> unidade da lista de postos
const UNIDADE_POSTOS = [['GOVERNADOR VALADARES', 'Governador Valadares'], ['GOVAL', 'Governador Valadares'], ['TEIXEIRA', 'Teixeira'], ['CONQUISTA', 'Conquista'],
  ['GOIANIA', 'Goiânia'], ['ILHEUS', 'Ilhéus'], ['JEQUIE', 'Jequié'], ['MARANHAO', 'Maranhão'], ['RECIFE', 'Recife'], ['SALVADOR', 'Salvador'], ['SERRA', 'Serra'],
  ['BELEM', 'Belém'], ['GRANEL', 'São Paulo'], ['SAO PAULO', 'São Paulo']];
const TODAS = '__todas__', PRIMEIROS = 5;
const ICONE_MAPA = '<svg viewBox="0 0 256 256" aria-hidden="true" fill="currentColor"><path d="M234.35,129,152,152,129,234.35a8,8,0,0,1-15.21.27l-65.28-176A8,8,0,0,1,58.63,48.46l176,65.28A8,8,0,0,1,234.35,129Z" opacity="0.45"/><path d="M237.33,106.21,61.41,41l-.16-.05A16,16,0,0,0,40.9,61.25a1,1,0,0,0,.05.16l65.26,175.92A15.77,15.77,0,0,0,121.28,248h.3a15.77,15.77,0,0,0,15-11.29l.06-.2,21.84-78,78-21.84.2-.06a16,16,0,0,0,.62-30.38ZM149.84,144.3a8,8,0,0,0-5.54,5.54L121.3,232l-.06-.17L56,56l175.82,65.22.16.06Z"/></svg>';
const postos = { lista: null, erro: false, unidade: null, busca: '', todos: false };
const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function carregarPostos() {
  return fetch('/postos.csv', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
    .then((t) => {
      const linhas = t.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
      const cab = linhas[0].split(';').map((h) => h.trim());
      postos.lista = linhas.slice(1).map((l) => { const c = l.split(';'), o = {}; cab.forEach((h, i) => { o[h] = (c[i] || '').trim(); }); return o; })
        .filter((r) => (r.Status || '').toUpperCase().includes('AUTORIZ'));
    })
    .catch(() => { postos.erro = true; });
}
function unidadeInicial(cc) {
  const unidades = new Set((postos.lista || []).map((r) => r.Unidade));
  const salva = lerLocal('mt-postos-unidade');
  if (salva && (salva === TODAS || unidades.has(salva))) return salva;
  const k = semAcento(cc).toUpperCase();
  const achada = UNIDADE_POSTOS.find(([p, u]) => k.includes(p) && unidades.has(u));
  return achada ? achada[1] : TODAS;
}
function htmlPosto(r, mostrarUnidade) {
  const cor = CORES_CARTAO[chaveCartao(r.Cartao)] || ['#5F6663', '#FFFFFF'];
  const url = r.Latitude && r.Longitude ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.Latitude + ',' + r.Longitude) : '';
  return '<li class="posto' + (url ? ' com-mapa' : '') + '"><div class="posto-linha"><div class="posto-texto"><h3>' + esc(r.Posto) + '</h3>' +
    '<p class="cidade">' + esc(r.Cidade) + (mostrarUnidade ? ' <span class="unid">· ' + esc(r.Unidade) + '</span>' : '') + '</p>' +
    '<span class="cartao" style="background:' + cor[0] + ';color:' + cor[1] + '">' + esc(nomeCartao(r.Cartao)) + '</span></div>' +
    (url ? '<a class="btn-mapa" target="_blank" rel="noopener" href="' + url + '" aria-label="Abrir ' + esc(r.Posto) + ' no mapa" title="Abrir no mapa">' + ICONE_MAPA + '</a>'
      : '<span class="sem-mapa">Sem mapa</span>') + '</div>' + (r.Aviso ? '<p class="aviso">' + esc(r.Aviso) + '</p>' : '') + '</li>';
}
// o cartão inteiro (seletor, busca, lista); a lista sozinha é redesenhada ao digitar, para o foco ficar na busca
function desenharPostos() {
  const area = document.getElementById('mt-postos');
  if (!area) return;
  const cab = '<div class="mt-postos-cab"><h2 id="mt-tp">Postos autorizados</h2>';
  if (postos.erro) { area.innerHTML = '<section class="mt-cartao" aria-labelledby="mt-tp">' + cab + '</div><p class="mensagem">Não foi possível carregar os postos. Verifique a internet e abra de novo.</p></section>'; return; }
  if (!postos.lista) { area.innerHTML = '<section class="mt-cartao" aria-labelledby="mt-tp">' + cab + '</div><p class="mensagem">Carregando postos…</p></section>'; return; }
  const unidades = [...new Set(postos.lista.map((r) => r.Unidade))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  area.innerHTML = '<section class="mt-cartao mt-postos" aria-labelledby="mt-tp">' + cab +
    '<div class="mt-mes"><label for="mt-postos-unid">Unidade</label><select id="mt-postos-unid">' +
    [[TODAS, 'Todas as unidades'], ...unidades.map((u) => [u, u])].map(([v, t]) => '<option value="' + esc(v) + '"' + (v === postos.unidade ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
    '</select></div></div><p class="mt-postos-cartoes" id="mt-postos-cartoes"></p>' +
    '<div class="busca"><label for="mt-postos-busca">Procurar posto ou cidade</label><input type="search" id="mt-postos-busca" autocomplete="off" placeholder="Ex.: Marabá, Magnolia…" value="' + esc(postos.busca) + '"></div>' +
    '<p class="mt-nota" id="mt-postos-qtd" aria-live="polite"></p><ul class="postos" id="mt-postos-lista"></ul><div id="mt-postos-mais"></div></section>';
  desenharListaPostos();
}
function desenharListaPostos() {
  const todas = postos.unidade === TODAS;
  const daUnidade = postos.lista.filter((r) => todas || r.Unidade === postos.unidade);
  const t = semAcento(postos.busca.trim());
  const achados = daUnidade.filter((r) => !t || semAcento(r.Posto).includes(t) || semAcento(r.Cidade).includes(t))
    .sort((a, b) => a.Cidade.localeCompare(b.Cidade, 'pt-BR') || a.Posto.localeCompare(b.Posto, 'pt-BR'));
  const mostrar = t || postos.todos ? achados : achados.slice(0, PRIMEIROS);
  const cartoes = [...new Set(daUnidade.map((r) => nomeCartao(r.Cartao)).filter((c) => c !== 'Identificação'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  document.getElementById('mt-postos-cartoes').innerHTML = cartoes.length ? '<span>Cartões aceitos:</span> ' + esc(cartoes.join(', ')) : '';
  document.getElementById('mt-postos-qtd').textContent = achados.length === 1 ? '1 posto' : achados.length + ' postos';
  document.getElementById('mt-postos-lista').innerHTML = mostrar.length ? mostrar.map((r) => htmlPosto(r, todas)).join('')
    : '<li class="mensagem">' + (t ? 'Nenhum posto autorizado com esse nome ou cidade.' : 'Nenhum posto autorizado nesta unidade.') + '</li>';
  document.getElementById('mt-postos-mais').innerHTML = !t && achados.length > PRIMEIROS
    ? '<button type="button" class="btn-trocar mt-postos-ver" id="mt-postos-ver" aria-expanded="' + postos.todos + '">' + (postos.todos ? 'Mostrar menos' : 'Ver todos os ' + achados.length + ' postos') + '</button>' : '';
}
// eventos no documento (o cartão é recriado quando a página é redesenhada ao trocar o mês)
document.addEventListener('change', (e) => {
  if (e.target.id !== 'mt-postos-unid') return;
  postos.unidade = e.target.value; postos.todos = false;
  gravarLocal('mt-postos-unidade', postos.unidade);
  desenharListaPostos();
});
document.addEventListener('input', (e) => { if (e.target.id === 'mt-postos-busca') { postos.busca = e.target.value; desenharListaPostos(); } });
document.addEventListener('click', (e) => {
  if (e.target.closest('#mt-postos-ver')) { postos.todos = !postos.todos; desenharListaPostos(); return; }
  if (e.target.closest('a, button') || !e.target.closest('#mt-postos-lista')) return;
  const li = e.target.closest('li.posto.com-mapa');   // tocar em qualquer parte do posto abre o mapa (como na tela inicial)
  if (li) li.querySelector('.btn-mapa').click();
});

// ---------- acesso a este portal (aba Senhas): usuário e troca da senha. A senha inicial é o próprio usuário (6 primeiros
// números do CPF); a gestão pode voltar para ela em Cadastro > Motoristas ----------
function htmlConta(d) {
  return '<section class="mt-cartao" aria-labelledby="mt-tc"><h2 id="mt-tc">Seu acesso a este portal</h2>' +
    '<p class="mt-conta-usuario">Usuário <b>' + esc(d.usuario || '') + '</b></p>' +
    '<p class="mt-nota" id="mt-conta-situacao">' + (d.senhaPropria ? 'Você já trocou a sua senha.'
      : 'Você ainda usa a senha inicial (o mesmo número do usuário). Troque por uma que só você saiba.') + '</p>' +
    '<button type="button" class="mt-senhas-botao" id="mt-conta-abrir" aria-expanded="false" aria-controls="mt-conta-form">Trocar minha senha</button>' +
    '<form class="mt-conta-form" id="mt-conta-form" hidden novalidate>' +
      '<label class="mt-campo"><span>Senha atual</span><input type="password" name="atual" autocomplete="current-password" required></label>' +
      '<label class="mt-campo"><span>Nova senha <small>(pelo menos 6 letras ou números)</small></span><input type="password" name="nova" autocomplete="new-password" minlength="6" maxlength="60" required></label>' +
      '<label class="mt-campo"><span>Repita a nova senha</span><input type="password" name="repetir" autocomplete="new-password" maxlength="60" required></label>' +
      '<p class="mt-conta-msg" id="mt-conta-msg" role="alert" hidden></p>' +
      '<div class="mt-conta-acoes"><button type="button" class="mt-senhas-botao" id="mt-conta-cancelar">Cancelar</button>' +
      '<button type="submit" class="mt-botao-principal" id="mt-conta-salvar">Salvar nova senha</button></div>' +
    '</form></section>';
}
pagina.addEventListener('click', (e) => {
  const abrir = e.target.closest && e.target.closest('#mt-conta-abrir, #mt-conta-cancelar');
  if (!abrir) return;
  const form = document.getElementById('mt-conta-form'), botao = document.getElementById('mt-conta-abrir');
  const mostrar = abrir.id === 'mt-conta-abrir';
  form.hidden = !mostrar; botao.hidden = mostrar; botao.setAttribute('aria-expanded', String(mostrar));
  form.reset(); document.getElementById('mt-conta-msg').hidden = true;
  if (mostrar) form.atual.focus(); else botao.focus();
});
pagina.addEventListener('submit', async (e) => {
  if (e.target.id !== 'mt-conta-form') return;
  e.preventDefault();
  const form = e.target, msg = document.getElementById('mt-conta-msg'), btn = document.getElementById('mt-conta-salvar');
  const aviso = (t, bom) => { msg.textContent = t; msg.hidden = false; msg.classList.toggle('mt-bom', !!bom); msg.classList.toggle('mt-ruim', !bom); };
  if (!form.atual.value || !form.nova.value) { aviso('Preencha a senha atual e a nova.'); return; }
  if (form.nova.value.length < 6) { aviso('A nova senha precisa ter pelo menos 6 letras ou números.'); form.nova.focus(); return; }
  if (form.nova.value !== form.repetir.value) { aviso('A nova senha e a repetição estão diferentes.'); form.repetir.focus(); return; }
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    const r = await fetch('/api/motorista/senha', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atual: form.atual.value, nova: form.nova.value }) });
    if (r.status === 401) { location.href = '/?entrar=1'; return; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { aviso(j.erro || 'Não foi possível trocar a senha. Tente de novo.'); return; }
    form.reset();
    document.getElementById('mt-conta-situacao').textContent = 'Você já trocou a sua senha.';
    aviso('Senha trocada. Use a nova senha na próxima vez que entrar.', true);
  } catch { aviso('Sem conexão. Verifique a internet e tente de novo.'); }
  finally { btn.disabled = false; btn.textContent = 'Salvar nova senha'; }
});

// ---------- menu: 4 abas (design-system/MOTORISTA.md); a aba fica no endereço (#media...) e a página abre sempre na Média ----------
const ICO = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ABAS = [
  ['media', 'Média', ICO('<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/><path d="M3 17h18"/>')],
  ['historico', 'Histórico', ICO('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>')],
  ['postos', 'Postos', ICO('<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M7 8h5"/><path d="M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>')],
  ['senhas', 'Senhas', ICO('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m17 6 3 3"/><path d="m15 8 2 2"/>')],
];
const abaDoEndereco = () => { const a = location.hash.replace('#', ''); return ABAS.some(([k]) => k === a) ? a : 'media'; };
function htmlMenu() {
  return '<nav class="mt-nav" aria-label="Menu do motorista">' + ABAS.map(([k, r, ic]) => '<a href="#' + k + '" data-aba="' + k + '">' + ic + '<span>' + r + '</span></a>').join('') + '</nav>';
}
function mostrarAba(aba, focar) {
  pagina.dataset.aba = aba;
  pagina.querySelectorAll('[data-painel]').forEach((el) => { el.hidden = el.dataset.painel !== aba; });
  pagina.querySelectorAll('.mt-nav a').forEach((a) => { if (a.dataset.aba === aba) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (focar) { window.scrollTo(0, 0); const t = pagina.querySelector('#mt-painel-' + aba); if (t) t.focus({ preventScroll: true }); }
}
window.addEventListener('hashchange', () => { if (pagina.querySelector('.mt-nav')) mostrarAba(abaDoEndereco(), true); });

async function iniciar() {
  const postosPronto = carregarPostos();
  let d;
  try {
    const r = await fetch('/api/motorista/dados', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { location.href = '/?entrar=1'; return; }
    d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Não foi possível carregar.');
  } catch (e) {
    pagina.innerHTML = '<p class="mt-vazio">' + esc(e.message || 'Sem conexão. Tente de novo.') + '</p>';
    return;
  }
  const linhas = d.linhas.map((l) => {
    const v = d.veiculos[l.placa] || null, meta = v && v.meta ? v.meta : null;
    return { ...l, categoria: v ? v.categoria : null, meta, litrosMeta: meta ? l.km / meta : 0 };
  }).filter((l) => String(l.combustivel || '').toUpperCase().includes('DIESEL') && l.categoria && !CATEGORIAS_FORA.has(l.categoria));
  const prepararPostos = () => { if (postos.unidade === null && postos.lista) postos.unidade = unidadeInicial(d.unidade); desenharPostos(); };
  postosPronto.then(prepararPostos);
  const primeiro = String(d.nome || '').split(' ')[0];
  const nomeBonito = primeiro.charAt(0) + primeiro.slice(1).toLowerCase();
  // página em 4 abas: topo + painéis + menu (postos e senhas não mudam com o mês)
  const teste = d.espelhoDe ? '<p class="mt-teste" role="note">Acesso de teste: mostrando os abastecimentos de ' + esc(d.espelhoDe) + ' (só nesta tela).</p>' : '';
  const painel = (id, html) => '<section class="mt-aba" data-painel="' + id + '" id="mt-painel-' + id + '" tabindex="-1" hidden>' + html + '</section>';
  const fixos = painel('postos', '<div id="mt-postos"></div>') + painel('senhas', htmlSenhas(d.senhas) + htmlConta(d));
  if (!linhas.length) {
    const vazio = '<p class="mt-vazio">Ainda não encontramos abastecimentos de diesel no seu nome nos últimos meses. ' +
      'Se você abasteceu, fale com a gestão de combustível para conferir o seu cadastro.</p>';
    pagina.innerHTML = teste + '<div class="mt-topo"><div><h2 class="mt-ola">Olá, ' + esc(nomeBonito) + '</h2></div></div>' +
      painel('media', vazio) + painel('historico', vazio) + fixos + htmlMenu();
    prepararPostos();
    mostrarAba(abaDoEndereco(), false);
    return;
  }
  const meses = [...new Set(linhas.map((l) => mesDoDia(l.dia)))].sort((a, b) => b - a);
  let mes = meses[0];
  const ultimo = Math.max(...linhas.map((l) => l.dia));

  // Programa PRIME: nota e estrelas dos meses fechados e o aviso dos abastecimentos que ficaram fora
  const prime = { avisos: {}, parciais: [], notas: [], ...(d.prime || {}) };
  // média do PRIME no acesso do motorista: abastecimento fora do PRIME não entra na média (o km rodado continua contando).
  // O 1º do mês seguinte a um parcial no fim do mês também sai da média.
  const chaveL = (l) => l.placa + '|' + l.dia + '|' + Math.round(l.hodometro || 0);
  const parciais = prime.parciais.map((c) => { const [placa, dia, hodo] = c.split('|'); return { placa, dia: Number(dia), hodo: Number(hodo) }; });
  const inicio = (l) => (l.hodometro || 0) - (l.km || 0);   // hodômetro do abastecimento anterior da placa
  for (const l of linhas) {
    l.prime = prime.avisos[chaveL(l)] || null;
    if (!l.prime && l.km && parciais.some((p) => p.placa === l.placa && Math.abs(p.hodo - inicio(l)) <= 2 && mesDoDia(p.dia) < mesDoDia(l.dia))) {
      l.prime = { motivo: 'Completou o abastecimento parcial', aviso: 'Completou o tanque do abastecimento parcial do fim do mês anterior: fica fora do PRIME.' };
      l.completou = true;
    }
  }
  // o que entra na média (medidor, % da meta, economia, mês a mês)
  const conta = (ls) => ls.filter((l) => !l.prime);
  const estrelas = (n) => (n ? '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)) : '☆☆☆☆☆');
  const nomeYm = (s) => { const [a, b] = s.split('-').map(Number); return nomeMes(a * 12 + b - 1); };
  function htmlPrime() {
    if (!prime.notas.length) return '';
    const u = prime.notas[0];
    return '<section class="mt-cartao" aria-labelledby="mt-t3"><h2 id="mt-t3">Programa PRIME</h2>' +
      '<div class="mt-prime"><span class="mt-estrelas" aria-label="' + (u.estrelas || 0) + ' de 5 estrelas">' + estrelas(u.estrelas) + '</span>' +
      '<span class="mt-prime-nota">Nota <b>' + (ok(u.nota) ? n2.format(u.nota) : '—') + '</b> em ' + esc(nomeYm(u.mes)) + '</span></div>' +
      (prime.notas.length > 1 ? '<p class="mt-nota">' + prime.notas.slice(1).map((x) => esc(nomeYm(x.mes)) + ': ' + (ok(x.nota) ? n2.format(x.nota) : '—') + ' (' + (x.estrelas || 0) + '★)').join(' · ') + '</p>' : '') +
      '</section>';
  }
  const avisoPrime = (l) => {
    const a = l.prime;
    return a ? '<div class="mt-fora-prime"><span class="mt-selo mt-selo-fora">Fora da média do PRIME</span>' + esc(a.aviso || a.motivo || '') + '</div>' : '';
  };

  function desenhar() {
    const doMes = linhas.filter((l) => mesDoDia(l.dia) === mes).sort((a, b) => b.dia - a.dia || (b.seg || 0) - (a.seg || 0));
    const t = somar(conta(doMes)), tudo = somar(doMes);   // km rodados e litros: todos os abastecimentos do mês
    const foraNoMes = doMes.filter((l) => l.prime).length;
    const evol = meses.slice(0, 12).map((m) => [m, somar(conta(linhas.filter((l) => mesDoDia(l.dia) === m)))]);
    // mês a mês: a barra vai de 70% (vazia) a 110% da meta (cheia), para as diferenças de poucos pontos aparecerem
    const larg = (p) => Math.max(2, Math.min(100, ((p || 0) - 0.7) / 0.4 * 100));
    const economizou = t.economia >= 0;
    // painel do motorista: saudação + mês, medidor (a média em destaque), litros e km, mês a mês, abastecimentos
    pagina.innerHTML = teste +
      '<div class="mt-topo"><div><h2 class="mt-ola">Olá, ' + esc(nomeBonito) + '</h2>' +
      '<p class="mt-sub">' + esc(d.unidade ? 'Unidade ' + d.unidade + ' · ' : '') + 'último abastecimento em ' + fmtDia(ultimo) + '</p></div>' +
      '<div class="mt-mes mt-mes-geral"><label for="mt-mes">Mês</label><select id="mt-mes">' + meses.map((m) => '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + nomeMes(m) + '</option>').join('') + '</select></div></div>' +
      '<section class="mt-aba" data-painel="media" id="mt-painel-media" tabindex="-1" hidden>' +
      '<section class="mt-cartao mt-destaque" aria-labelledby="mt-t1"><h2 id="mt-t1">Sua média contra a meta</h2>' + medidor(t) +
        '<span class="mt-status mt-centro-pilula ' + classe(t.pct) + '">' + (ok(t.pct) ? pct.format(t.pct) + ' da meta' : 'sem meta') + '</span>' +
        '<p class="mt-nota mt-centro">' + (ok(t.pct) ? (t.pct >= 1 ? 'Dentro da meta. Continue assim!' : 'Abaixo da meta: ' + pct.format(1 - t.pct) + ' para chegar lá.') : 'Veículo sem meta cadastrada.') + '</p>' +
        (foraNoMes ? '<p class="mt-nota mt-centro">' + (foraNoMes === 1 ? '1 abastecimento ficou fora do PRIME e não entra' : foraNoMes + ' abastecimentos ficaram fora do PRIME e não entram') + ' na média (o km rodado continua contando).</p>' : '') + '</section>' +
      '<div class="mt-kpis">' +
        '<div class="mt-kpi"><span class="mt-ic mt-ic-roxo" aria-hidden="true"></span><div><span class="mt-kpi-rot">' + (economizou ? 'Litros economizados' : 'Litros acima da meta') + '</span>' +
          '<span class="mt-kpi-num ' + (economizou ? 'mt-bom' : 'mt-ruim') + '">' + n0.format(Math.abs(t.economia)) + '<small> L</small></span>' +
          '<span class="mt-kpi-det">' + (economizou ? 'menos diesel do que a meta permite' : 'mais diesel do que a meta permite') + '</span></div></div>' +
        '<div class="mt-kpi"><span class="mt-ic mt-ic-areia" aria-hidden="true"></span><div><span class="mt-kpi-rot">Km rodados</span><span class="mt-kpi-num">' + n0.format(tudo.km) + '</span>' +
          '<span class="mt-kpi-det">' + n0.format(tudo.litros) + ' L em ' + n0.format(tudo.qtd) + (tudo.qtd === 1 ? ' abastecimento' : ' abastecimentos') + '</span></div></div>' +
      '</div>' +
      htmlPrime() +
      '<section class="mt-cartao" aria-labelledby="mt-t4"><h2 id="mt-t4">Mês a mês (% da meta)</h2><ul class="mt-evol">' +
        evol.map(([m, s]) => '<li><span>' + nomeMes(m, true) + '</span><div class="mt-barra"><i class="' + classe(s.pct) + '" style="width:' + larg(s.pct) + '%"></i></div>' +
          '<b class="' + classe(s.pct) + '">' + (ok(s.pct) ? pct.format(s.pct) : '—') + '</b></li>').join('') + '</ul>' +
        '<p class="mt-nota">A barra cheia é 110% da meta e a vazia, 70%. Média do mês: ' + evol.slice(0, 3).map(([m, s]) => nomeMes(m, true) + ' ' + (ok(s.media) ? n2.format(s.media) : '—') + ' km/L').join(' · ') + '</p></section>' +
      '</section><section class="mt-aba" data-painel="historico" id="mt-painel-historico" tabindex="-1" hidden>' +
      '<section class="mt-cartao" aria-labelledby="mt-t5"><h2 id="mt-t5">Seus abastecimentos em ' + esc(nomeMes(mes)) + '</h2><ul class="mt-abast">' +
        doMes.map((l) => '<li><div class="mt-a1"><span>' + fmtDia(l.dia, l.seg) + (l.tempoReal ? '<span class="mt-selo">novo</span>' : '') + '</span><span>' + esc(l.placa) + '</span></div>' +
          '<div class="mt-a2">' + esc(l.posto || '') + (l.cidade ? ' · ' + esc(l.cidade) : '') + '</div>' +
          '<div class="mt-a3"><span>' + n1.format(l.litros) + ' L</span><span>' + n0.format(l.km) + ' km</span>' +
          '<span>' + (l.litros && l.km ? n2.format(l.km / l.litros) + ' km/L' : '—') + ' ' + marcaMeta(l) + '</span><span>meta ' + (l.meta ? n2.format(l.meta) : '—') + '</span></div>' +
          avisoPrime(l) + '</li>').join('') + '</ul>' +
        '<p class="mt-nota">Conta só diesel dos veículos com meta, como no painel da gestão. "novo" = abastecimento que acabou de chegar do cartão.</p></section></section>' + fixos + htmlMenu();
    document.getElementById('mt-mes').addEventListener('change', (e) => { mes = Number(e.target.value); desenhar(); });
    prepararPostos();   // o cartão dos postos volta com a mesma unidade, busca e 'ver todos'
    mostrarAba(pagina.dataset.aba || abaDoEndereco(), false);   // trocar o mês continua na mesma aba
  }
  desenhar();
}
iniciar();