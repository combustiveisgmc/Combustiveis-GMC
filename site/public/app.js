(function () {
  'use strict';

  var POSTOS = [];          // só os autorizados
  var unidadeAtual = null;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- dados ----------
  function parseCSV(texto) {
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    var linhas = texto.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    var cab = linhas[0].split(';').map(function (h) { return h.trim(); });
    return linhas.slice(1).map(function (l) {
      var cols = l.split(';'), o = {};
      cab.forEach(function (h, i) { o[h] = (cols[i] || '').trim(); });
      return o;
    });
  }

  function autorizado(r) { return (r.Status || '').toUpperCase().indexOf('AUTORIZ') !== -1; }

  function semAcento(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var CORES_CARTAO = {
    TICKETLOG: ['#5CAE49', '#FFFFFF'],
    VELOE: ['#4B2E83', '#FFFFFF'],
    TRUCKPAG: ['#278187', '#FFFFFF'],
    IDENTIFICACAO: ['#1D4E9B', '#FFFFFF']
  };
  function corCartao(nome) {
    return CORES_CARTAO[semAcento(nome).toUpperCase()] || ['#5F6663', '#FFFFFF'];
  }

  function ordenar(lista) {
    return lista.slice().sort(function (a, b) {
      return a.Cidade.localeCompare(b.Cidade, 'pt-BR') || a.Posto.localeCompare(b.Posto, 'pt-BR');
    });
  }

  function filtrar(lista, termo) {
    var t = semAcento(termo.trim());
    if (!t) return lista;
    return lista.filter(function (r) {
      return semAcento(r.Posto).indexOf(t) !== -1 || semAcento(r.Cidade).indexOf(t) !== -1;
    });
  }

  function qtdTexto(n) { return n === 1 ? '1 posto' : n + ' postos'; }

  // ---------- desenho ----------
  var ICONE_MAPA = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';

  function htmlPosto(r, mostrarUnidade) {
    var cor = corCartao(r.Cartao);
    var mapa = (r.Latitude && r.Longitude)
      ? '<a class="btn-mapa" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(r.Latitude + ',' + r.Longitude) + '">' + ICONE_MAPA + 'Abrir no mapa</a>'
      : '<p class="sem-mapa">Localização não cadastrada.</p>';
    return '<li class="posto">' +
      '<h3>' + esc(r.Posto) + '</h3>' +
      '<p class="cidade">' + esc(r.Cidade) +
        (mostrarUnidade ? ' <span class="unid">· ' + esc(r.Unidade) + '</span>' : '') + '</p>' +
      '<p class="cartao-linha">Cartão: <span class="cartao" style="background:' + cor[0] + ';color:' + cor[1] + '">' +
        esc(r.Cartao || 'Não informado') + '</span></p>' +
      (r.Aviso ? '<p class="aviso">' + esc(r.Aviso) + '</p>' : '') +
      mapa +
    '</li>';
  }

  function desenharUnidades() {
    var contagem = {};
    POSTOS.forEach(function (r) { contagem[r.Unidade] = (contagem[r.Unidade] || 0) + 1; });
    var nomes = Object.keys(contagem).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    $('lista-unidades').innerHTML = nomes.map(function (u) {
      return '<li><button type="button" class="unidade" data-unidade="' + esc(u) + '">' +
        '<span class="nome">' + esc(u) + '</span>' +
        '<span class="qtd">' + qtdTexto(contagem[u]) + '</span>' +
        '<span class="seta" aria-hidden="true">›</span></button></li>';
    }).join('');
  }

  function desenharBuscaGeral() {
    var termo = $('busca-geral').value;
    var ativo = termo.trim().length > 0;
    $('resultado-geral').classList.toggle('oculto', !ativo);
    $('placa').classList.toggle('oculto', ativo);
    if (!ativo) return;
    var lista = ordenar(filtrar(POSTOS, termo));
    $('lista-geral').innerHTML = lista.map(function (r) { return htmlPosto(r, true); }).join('');
    $('vazio-geral').classList.toggle('oculto', lista.length > 0);
  }

  function desenharPostos() {
    var daUnidade = POSTOS.filter(function (r) { return r.Unidade === unidadeAtual; });
    var lista = ordenar(filtrar(daUnidade, $('busca-unidade').value));
    $('lista-postos').innerHTML = lista.map(function (r) { return htmlPosto(r, false); }).join('');
    $('vazio-unidade').classList.toggle('oculto', lista.length > 0);
  }

  // ---------- navegação ----------
  function guardar(chave, valor) {
    try { valor ? localStorage.setItem(chave, valor) : localStorage.removeItem(chave); } catch (e) {}
  }
  function ler(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }

  function abrirUnidade(u) {
    var total = POSTOS.filter(function (r) { return r.Unidade === u; }).length;
    if (!total) return voltarUnidades();
    unidadeAtual = u;
    guardar('unidade', u);
    $('nome-unidade').textContent = u;
    $('qtd-unidade').textContent = qtdTexto(total) + ' para abastecer';
    $('busca-unidade').value = '';
    $('tela-unidades').classList.add('oculto');
    $('tela-postos').classList.remove('oculto');
    desenharPostos();
    window.scrollTo(0, 0);
  }

  function voltarUnidades() {
    unidadeAtual = null;
    guardar('unidade', null);
    $('tela-postos').classList.add('oculto');
    $('tela-unidades').classList.remove('oculto');
    window.scrollTo(0, 0);
  }

  $('lista-unidades').addEventListener('click', function (e) {
    var b = e.target.closest('[data-unidade]');
    if (b) abrirUnidade(b.getAttribute('data-unidade'));
  });
  $('btn-trocar').addEventListener('click', voltarUnidades);
  $('busca-geral').addEventListener('input', desenharBuscaGeral);
  $('busca-unidade').addEventListener('input', desenharPostos);

  fetch('postos.csv', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
    .then(function (t) {
      POSTOS = parseCSV(t).filter(autorizado);
      $('carregando').classList.add('oculto');
      desenharUnidades();
      var salva = ler('unidade');
      if (salva) abrirUnidade(salva);
    })
    .catch(function () {
      $('carregando').textContent = 'Não foi possível carregar a lista de postos. Verifique a internet e abra de novo.';
    });

  // ---------- login da gestão ----------
  var dlg = $('dialog-login');
  var logado = false;

  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) { if (r.ok) { logado = true; $('abrir-login').textContent = 'Gestão'; } })
    .catch(function () {});

  function mostrarErro(msg) {
    var el = $('erro-login');
    el.textContent = msg;
    el.classList.toggle('oculto', !msg);
  }

  function abrirLogin() {
    mostrarErro('');
    $('form-login').reset();
    dlg.showModal();
    $('usuario').focus();
  }
  $('abrir-login').addEventListener('click', function () {
    if (logado) { location.href = '/gestao/'; return; }
    abrirLogin();
  });
  // /gestao sem sessão manda para /?entrar=1
  if (/[?&]entrar=1/.test(location.search)) {
    history.replaceState(null, '', location.pathname);
    abrirLogin();
  }
  $('cancelar-login').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  $('form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var usuario = $('usuario').value.trim();
    var senha = $('senha').value;
    if (!usuario || !senha) { mostrarErro('Preencha usuário e senha.'); return; }
    var btn = $('btn-entrar');
    btn.disabled = true; btn.textContent = 'Entrando…';
    fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario, senha: senha })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) { location.href = '/gestao/'; return; }
        mostrarErro(res.d.erro || 'Não foi possível entrar. Tente de novo.');
        $('senha').value = ''; $('senha').focus();
      })
      .catch(function () { mostrarErro('Sem conexão com o servidor. Verifique a internet.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });

  // ---------- app instalável ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});

  var instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var faixa = $('faixa-instalar'), pedido = null;
  var fechouFaixa = ler('faixa-fechada') === '1';

  if (!instalado && !fechouFaixa) {
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      faixa.classList.remove('oculto');
      $('faixa-texto').textContent = 'Instale no iPhone para abrir mais rápido';
      $('btn-instalar').textContent = 'Como instalar';
      $('btn-instalar').addEventListener('click', function () {
        $('ios-ajuda').classList.remove('oculto'); faixa.classList.add('oculto');
      });
    } else {
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault(); pedido = e; faixa.classList.remove('oculto');
      });
      $('btn-instalar').addEventListener('click', function () {
        if (!pedido) return;
        pedido.prompt();
        pedido.userChoice.then(function () { faixa.classList.add('oculto'); pedido = null; });
      });
    }
  }
  $('btn-fechar-instalar').addEventListener('click', function () {
    faixa.classList.add('oculto'); guardar('faixa-fechada', '1');
  });
  $('btn-ios-ok').addEventListener('click', function () { $('ios-ajuda').classList.add('oculto'); });
  window.addEventListener('appinstalled', function () { faixa.classList.add('oculto'); });
})();
