// Cadastros auxiliares (engrenagem dentro do formulário de cada cadastro). Desde 18/11/2026 são TABELAS no banco (Supabase, esquema
// `cadastro`): unidades, categorias de veículo, marcas, avisos de posto e produtos de contrato — os mesmos em todo o portal (a
// unidade da placa, do motorista, do contrato e do fornecedor é um cadastro só). API: /api/opcoes (lib/opcoes-cadastro.js).
// Campos usados nas contas do site (situação, plataforma, combustível...) aparecem como fixos, só para consulta.
//   const opc = await carregarOpcoes('cadastro-placas')          -> {opcoes: {campo: [nomes ativos]}, registros, podeEditar}
//   listaEfetiva(opc, 'categoria', sugestoesDosDados)             -> o cadastro (ou as sugestões dos dados se o banco não respondeu)
//   BOTAO_OPCOES (HTML da engrenagem) + abrirOpcoes({...})       -> janela para manter os cadastros
import { esc } from './dados.js';

export async function carregarOpcoes(tela) {
  try {
    const r = await fetch('/api/opcoes?tela=' + encodeURIComponent(tela), { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return { opcoes: {}, registros: {}, podeEditar: false };
    const j = await r.json();
    return { opcoes: j.opcoes || {}, registros: j.registros || {}, podeEditar: !!j.podeEditar };
  } catch {
    return { opcoes: {}, registros: {}, podeEditar: false };
  }
}

// lista do cadastro (só os ativos) ou, se o banco não respondeu, as opções de antes (valores que já existem nos dados)
export function listaEfetiva(opc, campo, padrao = []) {
  const v = opc && opc.opcoes && opc.opcoes[campo];
  return Array.isArray(v) && v.length ? v : padrao;
}
export const temConfig = (opc, campo) => !!(opc && opc.opcoes && Array.isArray(opc.opcoes[campo]) && opc.opcoes[campo].length);

export const BOTAO_OPCOES = '<button type="button" class="btn-opcoes" data-opcoes aria-label="Cadastros deste formulário (unidades, categorias...)" ' +
  'title="Cadastros deste formulário"><svg aria-hidden="true"><use href="#i-engrenagem"/></svg></button>';

async function enviar(corpo) {
  const r = await fetch('/api/opcoes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível gravar (' + r.status + ').');
  return j;
}

/**
 * Janela dos cadastros do formulário.
 * @param {object} o
 * @param {string} o.tela        id da tela em lib/opcoes-cadastro.js (ex.: 'cadastro-placas')
 * @param {string} o.titulo      título da janela
 * @param {Array<{id, rotulo, valores, fixo?, explica?}>} o.campos  (os fixos mostram `valores`; os outros vêm do banco)
 * @param {boolean} o.podeEditar
 * @param {Function} [o.aoSalvar] ({campo: [nomes ativos]}) a cada mudança gravada
 */
export async function abrirOpcoes({ tela, titulo, campos, podeEditar, aoSalvar }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialogo opcoes-dlg';
  dlg.setAttribute('aria-labelledby', 'opc-titulo');
  dlg.innerHTML = '<div class="carregando"><div class="giro"></div>Carregando os cadastros…</div>';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();

  const opc = await carregarOpcoes(tela);
  let registros = opc.registros || {};
  const pode = podeEditar && opc.podeEditar;
  const semBanco = campos.some((c) => !c.fixo) && !Object.keys(registros).length;
  let editando = null;   // 'campo:id' em edição

  const chipFixo = (v) => '<li class="opc-chip"><span>' + esc(v) + '</span></li>';
  const detalhesUnidade = (x) => [x.nome_curto, x.centro_custo ? 'CC ' + x.centro_custo : null, x.empresa !== 'RAJA LOG' ? x.empresa : null,
    x.operacional === false ? 'não operacional' : null].filter(Boolean).join(' · ');
  function itemHtml(c, x) {
    const chave = c.id + ':' + x.id;
    if (editando === chave) {
      const unid = c.id === 'unidade';
      return '<li class="opc-item opc-editando" data-id="' + x.id + '"><form class="opc-form-item" data-campo="' + esc(c.id) + '" data-id="' + x.id + '">' +
        '<label class="campo-form"><span>Nome</span><input name="nome" maxlength="80" value="' + esc(x.nome) + '" autocomplete="off" required></label>' +
        (unid ? '<label class="campo-form"><span>Nome curto</span><input name="nome_curto" maxlength="40" value="' + esc(x.nome_curto || '') + '" autocomplete="off"></label>' +
          '<label class="campo-form"><span>Centro de custo</span><input name="centro_custo" maxlength="20" value="' + esc(x.centro_custo || '') + '" autocomplete="off" inputmode="numeric"></label>' +
          '<label class="campo-form"><span>Empresa</span><select name="empresa" class="campo-sel">' + ['RAJA LOG', 'KEMIGAS'].map((e) =>
            '<option' + (x.empresa === e ? ' selected' : '') + '>' + e + '</option>').join('') + '</select></label>' +
          '<label class="nt-opcao"><input type="checkbox" name="operacional"' + (x.operacional !== false ? ' checked' : '') + '> Operacional (entra nas metas e painéis)</label>' : '') +
        '<div class="opc-form-acoes"><button type="button" class="btn" data-cancelar>Cancelar</button><button type="submit" class="btn btn-principal">Salvar</button></div>' +
        '</form></li>';
    }
    const det = c.id === 'unidade' ? detalhesUnidade(x) : '';
    return '<li class="opc-item' + (x.ativa ? '' : ' opc-inativo') + '" data-id="' + x.id + '"><span class="opc-nome">' + esc(x.nome) +
      (det ? '<small>' + esc(det) + '</small>' : '') + (x.ativa ? '' : ' <span class="opc-fixo">desativado</span>') + '</span>' +
      (pode ? '<span class="opc-acoes"><button type="button" class="btn-lixeira btn-editar" data-editar="' + x.id + '" aria-label="Editar ' + esc(x.nome) + '" title="Editar">' +
        '<svg aria-hidden="true"><use href="#i-lapis"/></svg></button>' +
        '<button type="button" class="btn opc-ativar" data-ativar="' + x.id + '" data-ativo="' + (x.ativa ? 1 : 0) + '">' + (x.ativa ? 'Desativar' : 'Reativar') + '</button></span>' : '') +
      '</li>';
  }
  function secao(c) {
    if (c.fixo) {
      return '<section class="opc-campo" data-campo="' + esc(c.id) + '"><h3>' + esc(c.rotulo) + ' <span class="opc-fixo">fixo</span></h3>' +
        '<ul class="opc-lista">' + ((c.valores || []).length ? c.valores.map(chipFixo).join('') : '<li class="opc-vazia">Nenhuma opção.</li>') + '</ul>' +
        '<p class="nota-campo">' + esc(c.explica || 'Usada nas contas do site: não muda por aqui.') + '</p></section>';
    }
    const lista = (registros[c.id] || []).slice().sort((a, b) => (b.ativa - a.ativa) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const ativos = lista.filter((x) => x.ativa).length;
    return '<section class="opc-campo" data-campo="' + esc(c.id) + '"><h3>' + esc(c.rotulo) + ' <small class="opc-conta">' + ativos + ' ativo(s)' +
      (lista.length > ativos ? ', ' + (lista.length - ativos) + ' desativado(s)' : '') + '</small></h3>' +
      '<ul class="opc-itens">' + (lista.length ? lista.map((x) => itemHtml(c, x)).join('') : '<li class="opc-vazia">Nenhum cadastrado.</li>') + '</ul>' +
      (pode ? '<form class="opc-novo" data-campo="' + esc(c.id) + '"><input name="nome" type="text" maxlength="80" autocomplete="off" spellcheck="false" placeholder="Novo cadastro…" ' +
        'aria-label="Nova ' + esc(c.rotulo.toLowerCase()) + '"><button type="submit" class="btn">Adicionar</button></form>' : '') +
      (c.explica ? '<p class="nota-campo">' + esc(c.explica) + '</p>' : '') + '</section>';
  }
  function desenhar() {
    dlg.innerHTML = '<div class="opc-corpo"><h2 id="opc-titulo">' + esc(titulo) + '</h2>' +
      '<p class="dialogo-explica">' + (semBanco ? 'O banco de dados não respondeu: os cadastros não puderam ser carregados. Tente de novo em instantes.'
        : pode ? 'Cadastros do portal: a mesma unidade, categoria ou marca vale em todos os formulários. Desativar tira da lista dos formulários; quem já usa continua com ela.'
          : 'Seu acesso é só de consulta: os cadastros aparecem como estão.') + '</p>' +
      '<p class="erro-form oculto" role="alert"></p>' + campos.map(secao).join('') +
      '<div class="dialogo-acoes"><button type="button" class="btn btn-principal" data-fechar>Fechar</button></div></div>';
  }
  desenhar();
  const erro = (t) => { const e = dlg.querySelector('.erro-form'); e.textContent = t || ''; e.classList.toggle('oculto', !t); if (t) e.scrollIntoView({ block: 'nearest' }); };
  async function gravar(campo, acao, id, dados) {
    erro('');
    try {
      const j = await enviar({ tela, campo, acao, id, dados });
      registros = j.registros || registros;
      editando = null;
      desenhar();
      if (aoSalvar) aoSalvar({ [campo]: (j.opcoes || {})[campo] || [] });
      return true;
    } catch (e) { erro(e.message); return false; }
  }

  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) { dlg.close(); return; }
    const sec = e.target.closest('.opc-campo');
    if (!sec) return;
    const campo = sec.dataset.campo;
    const ed = e.target.closest('[data-editar]');
    if (ed) { editando = campo + ':' + ed.dataset.editar; erro(''); desenhar(); const i = dlg.querySelector('.opc-editando input[name="nome"]'); if (i) i.focus(); return; }
    if (e.target.closest('[data-cancelar]')) { editando = null; desenhar(); return; }
    const at = e.target.closest('[data-ativar]');
    if (at) gravar(campo, at.dataset.ativo === '1' ? 'desativar' : 'ativar', Number(at.dataset.ativar), {});
  });
  dlg.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, campo = f.dataset.campo;
    if (f.classList.contains('opc-novo')) {
      const nome = f.nome.value.replace(/\s+/g, ' ').trim();
      if (!nome) { f.nome.focus(); return; }
      if (await gravar(campo, 'adicionar', null, { nome })) { const i = dlg.querySelector('.opc-novo[data-campo="' + campo + '"] input'); if (i) i.focus(); }
      return;
    }
    // edição de um item: nome (renomear) e, na unidade, os outros dados (editar)
    const id = Number(f.dataset.id), x = (registros[campo] || []).find((r) => r.id === id);
    if (!x) return;
    const nome = f.nome.value.replace(/\s+/g, ' ').trim();
    if (nome && nome !== x.nome && !(await gravar(campo, 'renomear', id, { nome }))) return;
    if (campo === 'unidade') {
      const dados = { nome_curto: f.nome_curto.value.trim(), centro_custo: f.centro_custo.value.trim(), empresa: f.empresa.value, operacional: f.operacional.checked };
      const mudou = dados.nome_curto !== (x.nome_curto || '') || dados.centro_custo !== (x.centro_custo || '') || dados.empresa !== x.empresa || dados.operacional !== (x.operacional !== false);
      if (mudou) { await gravar(campo, 'editar', id, dados); return; }
    }
    editando = null; desenhar();
  });
}
