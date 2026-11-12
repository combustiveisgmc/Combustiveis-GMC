// Confirmação dentro do site (no lugar do confirm() do navegador): janela no padrão das outras, Cancelar + ação.
// Uso: if (!(await confirmar('Excluir …?'))) return;   Exclusão (texto começando com Excluir/Remover/Descartar) = botão vermelho.
export function confirmar(texto, o = {}) {
  return new Promise((resolver) => {
    const perigo = o.perigo ?? /^(excluir|remover|descartar|desfazer)/i.test(String(texto).trim());
    const rotulo = o.ok || (perigo ? (String(texto).trim().match(/^\S+/)[0].replace(/[^A-Za-zÀ-ú]/g, '') || 'Confirmar') : 'Confirmar');
    const d = document.createElement('dialog');
    d.className = 'dialogo dialogo-confirmar';
    d.setAttribute('aria-labelledby', 'cf-titulo');
    d.innerHTML = '<h2 id="cf-titulo"></h2><p class="dialogo-explica cf-texto"></p>' +
      '<div class="dialogo-acoes"><button type="button" class="btn" data-nao>Cancelar</button>' +
      '<button type="button" class="btn ' + (perigo ? 'btn-perigo' : 'btn-principal') + '" data-sim></button></div>';
    d.querySelector('#cf-titulo').textContent = o.titulo || (perigo ? 'Confirmar exclusão' : 'Confirmar');
    d.querySelector('.cf-texto').textContent = texto;
    d.querySelector('[data-sim]').textContent = rotulo.charAt(0).toUpperCase() + rotulo.slice(1).toLowerCase();
    // responde no clique (o evento 'close' pode atrasar com a aba em segundo plano); Esc ou clique fora = Cancelar
    let feito = false;
    const fim = (sim) => { if (feito) return; feito = true; if (d.open) d.close(); d.remove(); resolver(sim); };
    d.querySelector('[data-sim]').addEventListener('click', () => fim(true));
    d.querySelector('[data-nao]').addEventListener('click', () => fim(false));
    d.addEventListener('click', (e) => { if (e.target === d) fim(false); });
    d.addEventListener('close', () => fim(false));
    (document.querySelector('dialog[open]') || document.body).appendChild(d);   // por cima de outra janela aberta
    d.showModal();
    d.querySelector(perigo ? '[data-nao]' : '[data-sim]').focus();   // exclusão: o foco fica no Cancelar
  });
}