(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 401) { location.href = '/?entrar=1'; return null; }
      return r.json();
    })
    .then(function (u) {
      if (!u) return;
      var primeiro = (u.nome || '').split(' ')[0];
      $('ola').textContent = 'Olá, ' + primeiro;
      $('quem').innerHTML = '';
      var b = document.createElement('strong');
      b.textContent = u.nome;
      $('quem').appendChild(b);
    })
    .catch(function () {});

  $('btn-sair').addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {})
      .then(function () { location.href = '/'; });
  });
})();
