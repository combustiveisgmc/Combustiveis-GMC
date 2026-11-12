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
    TICKETLOG: ['#2F7D32', '#FFFFFF'],
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
  var ICONE_MAPA = '<svg viewBox="0 0 256 256" aria-hidden="true" fill="currentColor"><path d="M234.35,129,152,152,129,234.35a8,8,0,0,1-15.21.27l-65.28-176A8,8,0,0,1,58.63,48.46l176,65.28A8,8,0,0,1,234.35,129Z" opacity="0.45"/><path d="M237.33,106.21,61.41,41l-.16-.05A16,16,0,0,0,40.9,61.25a1,1,0,0,0,.05.16l65.26,175.92A15.77,15.77,0,0,0,121.28,248h.3a15.77,15.77,0,0,0,15-11.29l.06-.2,21.84-78,78-21.84.2-.06a16,16,0,0,0,.62-30.38ZM149.84,144.3a8,8,0,0,0-5.54,5.54L121.3,232l-.06-.17L56,56l175.82,65.22.16.06Z"/></svg>';

  // nome do cartão como no resto do portal ("Ticket", não "TICKETLOG")
  var NOME_CARTAO = { TICKETLOG: 'Ticket', TICKET: 'Ticket', TRUCKPAG: 'TruckPag', VELOE: 'Veloe', IDENTIFICACAO: 'Identificação', VIBRA: 'Vibra' };
  function nomeCartao(c) {
    var k = semAcento(c || '').toUpperCase().replace(/\s+/g, '');
    return NOME_CARTAO[k] || c || 'Não informado';
  }

  // posto compacto: nome, cidade e cartão; o mapa é o botão à direita (a linha inteira também abre o mapa)
  function htmlPosto(r, mostrarUnidade) {
    var cor = corCartao(r.Cartao);
    var url = (r.Latitude && r.Longitude) ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.Latitude + ',' + r.Longitude) : '';
    var mapa = url
      ? '<a class="btn-mapa" target="_blank" rel="noopener" href="' + url + '" aria-label="Abrir ' + esc(r.Posto) + ' no mapa" title="Abrir no mapa">' + ICONE_MAPA + '</a>'
      : '<span class="sem-mapa">Sem mapa</span>';
    return '<li class="posto' + (url ? ' com-mapa' : '') + '">' +
      '<div class="posto-linha"><div class="posto-texto">' +
        '<h3>' + esc(r.Posto) + '</h3>' +
        '<p class="cidade">' + esc(r.Cidade) + (mostrarUnidade ? ' <span class="unid">· ' + esc(r.Unidade) + '</span>' : '') + '</p>' +
        '<span class="cartao" style="background:' + cor[0] + ';color:' + cor[1] + '">' + esc(nomeCartao(r.Cartao)) + '</span>' +
      '</div>' + mapa + '</div>' +
      (r.Aviso ? '<p class="aviso">' + esc(r.Aviso) + '</p>' : '') +
    '</li>';
  }
  // tocar em qualquer parte do posto abre o mapa (como o botão)
  function abrirMapaDaLinha(e) {
    if (e.target.closest('a, button')) return;
    var li = e.target.closest('li.posto.com-mapa');
    if (li) li.querySelector('.btn-mapa').click();
  }

  // linha do topo: os cartões aceitos (os números de unidades e postos não ajudam o motorista a achar onde abastecer)
  function desenharKpis() {
    var cartoes = {};
    // "Identificação" não entra na lista (pedido do usuário); o selo continua no posto
    POSTOS.forEach(function (r) { if (r.Cartao && nomeCartao(r.Cartao) !== 'Identificação') cartoes[nomeCartao(r.Cartao)] = 1; });
    var nomes = Object.keys(cartoes).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    $('kpis').innerHTML = nomes.length ? '<p class="cartoes-aceitos"><span>Cartões aceitos:</span> ' + esc(nomes.join(', ')) + '</p>' : '';
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
  $('lista-postos').addEventListener('click', abrirMapaDaLinha);
  $('lista-geral').addEventListener('click', abrirMapaDaLinha);
  $('busca-geral').addEventListener('input', desenharBuscaGeral);
  $('busca-unidade').addEventListener('input', desenharPostos);

  fetch('postos.csv', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
    .then(function (t) {
      POSTOS = parseCSV(t).filter(autorizado);
      $('carregando').classList.add('oculto');
      desenharKpis();
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

  // motorista entra com o usuário de 6 números (ou digita o CPF inteiro, por costume): a sessão dele já dura 30 dias,
  // então "Mantenha conectado" só aparece para a gestão. A senha pode ter letras (ele pode trocar): teclado normal
  function ajustarManter() {
    var mot = /^[\d.\-\s]+$/.test($('usuario').value.trim());
    document.querySelector('#form-login .manter').hidden = mot;
    $('nota-motorista').hidden = !mot || !$('usuario').value.trim();
    if (mot) $('manter').checked = false;
  }
  $('usuario').addEventListener('input', ajustarManter);
  function abrirLogin() {
    mostrarErro('');
    $('form-login').reset();
    ajustarManter();
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
      body: JSON.stringify({ usuario: usuario, senha: senha, manter: $('manter').checked })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) {
          // login novo: os filtros guardados da sessão anterior começam limpos
          try { Object.keys(sessionStorage).filter(function (k) { return k.indexOf('filtros:') === 0; }).forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) {}
          location.href = res.d.motorista ? '/motorista/' : '/gestao/';
          return;
        }
        mostrarErro(res.d.erro || 'Não foi possível entrar. Tente de novo.');
        $('senha').value = ''; $('senha').focus();
      })
      .catch(function () { mostrarErro('Sem conexão com o servidor. Verifique a internet.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });

  // ---------- aviso de cartão faltando no caminhão (vai para a gestão: Operacional > Cartões frota) ----------
  var dlgCartao = $('dialog-cartao'), formCartao = $('form-cartao');
  function erroCartao(msg) { $('erro-cartao').textContent = msg; $('erro-cartao').classList.toggle('oculto', !msg); }
  $('abrir-aviso-cartao').addEventListener('click', function () {
    formCartao.reset();
    erroCartao('');
    formCartao.classList.remove('oculto');
    $('ok-cartao').classList.add('oculto');
    // placa e nome do último aviso feito neste celular já vêm preenchidos
    $('ac-placa').value = ler('aviso-placa') || '';
    $('ac-nome').value = ler('aviso-nome') || '';
    conferida = { placa: '', ok: false }; enviarAssimMesmo = '';
    mostrarSugestoes([], '');
    dlgCartao.showModal();
    ($('ac-placa').value ? formCartao.querySelector('input[name="cartao"]') : $('ac-placa')).focus();
  });
  $('cancelar-cartao').addEventListener('click', function () { dlgCartao.close(); });
  $('fechar-cartao').addEventListener('click', function () { dlgCartao.close(); });
  dlgCartao.addEventListener('click', function (e) { if (e.target === dlgCartao) dlgCartao.close(); });
  // sugestões de placa: o site procura no controle de cartões o que foi digitado (a partir de 3 caracteres),
  // aceitando placa antiga/Mercosul e erro de digitação; a placa que não está no controle pede confirmação ao enviar
  var tPlaca = null, conferida = { placa: '', ok: false }, enviarAssimMesmo = '';
  function buscarPlacas(q, depois) {
    fetch('/api/placas-aviso?q=' + encodeURIComponent(q), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { depois(d); })
      .catch(function () { depois(null); });   // sem internet: não atrapalha o envio
  }
  function mostrarSugestoes(lista, texto) {
    var caixa = $('ac-sugestoes');
    if (!lista.length && !texto) { caixa.classList.add('oculto'); caixa.innerHTML = ''; return; }
    caixa.innerHTML = (texto ? '<p>' + texto + '</p>' : '') + lista.map(function (p) {
      return '<button type="button" class="sugestao-placa" data-placa="' + p + '">' + p + '</button>';
    }).join('');
    caixa.classList.remove('oculto');
  }
  function escolherPlaca(p) {
    $('ac-placa').value = p;
    conferida = { placa: p, ok: true };
    mostrarSugestoes([], '');
    erroCartao('');
    formCartao.querySelector('input[name="cartao"]').focus();
  }
  $('ac-sugestoes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-placa]');
    if (b) escolherPlaca(b.getAttribute('data-placa'));
  });
  $('ac-placa').addEventListener('input', function (e) {
    var q = e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    clearTimeout(tPlaca);
    enviarAssimMesmo = '';
    if (q.length < 3) { mostrarSugestoes([], ''); return; }
    tPlaca = setTimeout(function () {
      buscarPlacas(q, function (d) {
        if (!d || $('ac-placa').value !== q) return;
        var exata = d.exata || d.controle === false;
        // placa antiga de um caminhão que está no controle com a Mercosul (ou o contrário): troca pela do controle
        if (d.exata && d.placa && d.placa !== q) {
          $('ac-placa').value = d.placa;
          conferida = { placa: d.placa, ok: true };
          mostrarSugestoes([], 'Placa trocada para ' + d.placa + ', como está no controle de cartões.');
          return;
        }
        conferida = { placa: q, ok: exata };
        var outras = (d.sugestoes || []).filter(function (p) { return p !== q; });
        if (exata) mostrarSugestoes([], '');
        else if (q.length >= 7) mostrarSugestoes(outras, outras.length ? 'Essa placa não está no controle. Você quis dizer:' : 'Essa placa não está no controle de cartões. Confira.');
        else mostrarSugestoes(outras, outras.length ? 'Toque na placa:' : '');
      });
    }, 250);
  });

  formCartao.addEventListener('submit', function (e) {
    e.preventDefault();
    var placa = $('ac-placa').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var cartoes = [].map.call(formCartao.querySelectorAll('input[name="cartao"]:checked'), function (c) { return c.value; });
    var nome = $('ac-nome').value.trim();
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) { erroCartao('Confira a placa (ex.: ABC1D23 ou ABC1234).'); $('ac-placa').focus(); return; }
    if (!cartoes.length) { erroCartao('Marque qual cartão está faltando.'); formCartao.querySelector('input[name="cartao"]').focus(); return; }
    if (nome.length < 3) { erroCartao('Escreva o seu nome.'); $('ac-nome').focus(); return; }
    // placa fora do controle de cartões: mostra as parecidas; tocar em "Enviar aviso" de novo manda assim mesmo
    if (!(conferida.placa === placa && conferida.ok) && enviarAssimMesmo !== placa) {
      var btnC = $('enviar-cartao');
      btnC.disabled = true;
      buscarPlacas(placa, function (d) {
        btnC.disabled = false;
        if (!d || d.exata || d.controle === false) {
          if (d && d.placa) $('ac-placa').value = d.placa;   // a forma da placa que está no controle
          conferida = { placa: $('ac-placa').value, ok: true };
          $('enviar-cartao').click();
          return;
        }
        enviarAssimMesmo = placa;
        var outras = (d.sugestoes || []).filter(function (p) { return p !== placa; });
        mostrarSugestoes(outras, outras.length ? 'Você quis dizer:' : '');
        erroCartao('A placa ' + placa + ' não está no controle de cartões. ' + (outras.length ? 'Toque numa das placas abaixo ou' : 'Confira a placa ou') +
          ' toque em "Enviar aviso" de novo para mandar assim mesmo.');
        $('ac-placa').focus();
      });
      return;
    }
    erroCartao('');
    var btn = $('enviar-cartao');
    btn.disabled = true; btn.textContent = 'Enviando…';
    fetch('/api/alerta-cartao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placa: placa, cartoes: cartoes, motorista: nome, observacao: $('ac-obs').value, site: formCartao.site.value })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { erroCartao(res.d.erro || 'Não foi possível enviar. Tente de novo.'); return; }
        guardar('aviso-placa', placa);
        guardar('aviso-nome', nome);
        formCartao.classList.add('oculto');
        $('ok-cartao').classList.remove('oculto');
        $('fechar-cartao').focus();
      })
      .catch(function () { erroCartao('Sem internet agora. Tente de novo quando tiver sinal.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Enviar aviso'; });
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
