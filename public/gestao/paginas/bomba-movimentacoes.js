// Bomba interna > Movimentações: compras de combustível das bombas internas (entram no estoque do tanque).
// Lançar: data e hora, unidade (base), tanque, litragem, valor total, NF (número, fornecedor, CNPJ e emissão, que aparecem no
// Rateio das NFs) e observação. Listagem com filtro, editar e excluir. "Fornecedor do cadastro" (Preço bomba interna, aba
// Fornecedores) preenche o CNPJ da unidade; o CNPJ digitado mostra a qual fornecedor do cadastro ele pertence.
import { esc } from '../lib/dados.js';
import { NOME_TANQUE, fmtQuando, agoraLocal } from '../lib/bomba.js';
import { ligarBaixar } from '../lib/baixar.js';

async function obter(url) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 401) { location.href = '/?entrar=1'; throw new Error('sessão'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar (' + r.status + ').');
  return j;
}
const num = (v, c = 0) => (v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
const fmtCnpj = (c) => (c && /^\d{14}$/.test(c) ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c || '');
const NOMES_UNIDADE = { SP: 'São Paulo', GV: 'Governador Valadares', BELEM: 'Belém', JEQUIE: 'Jequié', SALVADOR: 'Salvador' };
const nomeUnidade = (u) => NOMES_UNIDADE[u] || u.charAt(0) + u.slice(1).toLowerCase();
const lerNum = (s) => { const t = String(s ?? '').trim().replace(/R\$|\s/g, ''); if (!t) return null; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); };

export async function montar(ctx) {
  const { pagina } = ctx;
  pagina.innerHTML = '<div class="carregando"><div class="giro"></div>Carregando as movimentações…</div>';
  let bases, movs, podeEditar, cadastro = [];
  try {
    const [b, m] = await Promise.all([obter('/api/bomba/bases'), obter('/api/bomba/movimentacoes')]);
    bases = b.bases; movs = m.movimentacoes; podeEditar = m.podeEditar; cadastro = (m.fornecedores || []).filter((x) => x.cnpj);
  } catch (e) {
    if (e.message !== 'sessão') pagina.innerHTML = '<div class="vazio">' + esc(e.message) + ' Recarregue a página para tentar de novo.</div>';
    return {};
  }
  const nomeBase = (id) => (bases.find((b) => b.id === id) || {}).nome || '(base excluída)';
  const ativas = bases.filter((b) => b.ativo);

  pagina.innerHTML = `
    ${podeEditar ? `<dialog class="dialogo dialogo-largo" id="bm-dlg" aria-labelledby="bm-form-titulo">
      <h2 id="bm-form-titulo">Lançar compra</h2>
      <form id="bm-form" novalidate>
        <p class="erro-form oculto" id="bm-erro" role="alert"></p>
        <div class="grade-form">
          <label class="campo-form"><span>Data e hora</span><input name="quando" type="datetime-local" required></label>
          <label class="campo-form"><span>Unidade</span><select name="base" required></select></label>
          <label class="campo-form"><span>Tanque</span><select name="tanque" required></select></label>
          <label class="campo-form"><span>Litragem (L)</span><input name="litros" inputmode="decimal" required autocomplete="off" placeholder="Ex.: 10.000"></label>
          <label class="campo-form"><span>Valor total (R$)</span><input name="valor" inputmode="numeric" data-moeda="2" required autocomplete="off" placeholder="0,00"></label>
          <label class="campo-form"><span>Nº da NF</span><input name="nf" autocomplete="off" maxlength="40"></label>
          <label class="campo-form"><span>Emissão da NF</span><input name="emissao" type="date"></label>
          <label class="campo-form largo"><span>Fornecedor do cadastro <small>(Preço bomba interna)</small></span><select name="cadastro"></select></label>
          <label class="campo-form"><span>Fornecedor</span><input name="fornecedor" autocomplete="off" maxlength="120" list="bm-fornecedores"></label>
          <label class="campo-form"><span>CNPJ do fornecedor</span><input name="cnpj" data-mascara="cnpj" inputmode="numeric" autocomplete="off" maxlength="18" placeholder="00.000.000/0000-00"></label>
          <datalist id="bm-fornecedores"></datalist>
          <label class="campo-form largo"><span>Observação</span><input name="obs" autocomplete="off" maxlength="500"></label>
        </div>
        <p class="nota" id="bm-cad-nota"></p>
        <p class="nota" id="bm-preco"></p>
        <div class="dialogo-acoes">
          <button type="button" class="btn" id="bm-cancelar">Cancelar</button>
          <button type="submit" class="btn btn-principal" id="bm-salvar">Lançar compra</button>
        </div>
      </form>
    </dialog>` : ''}
    <section class="painel painel-tabela">
      <div class="painel-cab"><h2>Compras</h2><span class="conta" id="bm-conta"></span></div>
      <div class="tabela-ferramentas">
        <select id="bm-f-base" class="campo-sel" aria-label="Unidade"></select>
        <select id="bm-f-tanque" class="campo-sel" aria-label="Tanque"><option value="">Todos os tanques</option><option value="diesel">Diesel S10</option><option value="arla">Arla 32</option></select>
        <button type="button" class="btn" id="bm-exportar"><svg aria-hidden="true"><use href="#i-baixar"/></svg><span class="txt">Baixar</span></button>
        ${podeEditar && ativas.length ? '<button type="button" class="btn btn-principal" id="bm-novo"><svg aria-hidden="true"><use href="#i-mais"/></svg><span class="txt">Lançar compra</span></button>' : ''}
      </div>
      <dl class="apoio" id="bm-totais"></dl>
      <div class="tabela-rolagem"><table class="dados" id="bm-tabela"></table></div>
    </section>`;
  const el = (id) => pagina.querySelector('#' + id);
  ctx.definirSub('Compras de combustível das bombas internas. Cada compra entra no estoque do tanque.');
  const f = el('bm-form');
  el('bm-f-base').innerHTML = '<option value="">Todas as unidades</option>' + bases.map((b) => '<option value="' + b.id + '">' + esc(b.nome) + '</option>').join('');

  function opcoesTanque(baseId, atual) {
    const b = bases.find((x) => x.id === Number(baseId));
    const ts = b ? ['diesel', 'arla'].filter((t) => b.tanques[t]) : [];
    f.tanque.innerHTML = ts.map((t) => '<option value="' + t + '"' + (t === atual ? ' selected' : '') + '>' + NOME_TANQUE[t] + '</option>').join('');
    f.tanque.disabled = !ts.length;
  }
  function precoUnit() {
    if (!f) return;
    const l = lerNum(f.litros.value), v = lerNum(f.valor.value);
    el('bm-preco').textContent = l > 0 && v > 0 ? 'Preço por litro desta compra: R$ ' + num(v / l, 4) : '';
  }
  // cadastro do Preço bomba interna (com CNPJ) do produto do tanque escolhido
  function opcoesCadastro() {
    const prod = f.tanque.value === 'arla' ? 'ARLA' : 'DIESEL', atual = String(f.cnpj.value).replace(/\D/g, '');
    const ls = cadastro.filter((x) => x.produto === prod);
    f.cadastro.innerHTML = '<option value="">— escolher —</option>' + ls.map((x) => '<option value="' + x.cnpj + '"' + (x.cnpj === atual ? ' selected' : '') + '>' +
      esc(x.fornecedor + ' · ' + nomeUnidade(x.unidade) + ' · ' + fmtCnpj(x.cnpj)) + '</option>').join('');
    notaCadastro();
  }
  function notaCadastro() {
    const c = String(f.cnpj.value).replace(/\D/g, ''), x = c.length === 14 ? cadastro.find((y) => y.cnpj === c) : null;
    el('bm-cad-nota').textContent = c.length !== 14 ? '' : x ? 'CNPJ do cadastro: ' + x.fornecedor + ' (' + nomeUnidade(x.unidade) + ').' : 'CNPJ fora do cadastro de fornecedores do Preço bomba interna.';
  }
  let editando = null;
  function fornecedores() {   // os já lançados, para escolher e trazer o CNPJ junto
    const m = new Map();
    for (const x of movs) if (x.fornecedor && !m.has(x.fornecedor)) m.set(x.fornecedor, x.cnpj || '');
    el('bm-fornecedores').innerHTML = [...m.keys()].sort().map((n) => '<option value="' + esc(n) + '">').join('');
    return m;
  }
  function limparForm() {
    editando = null;
    f.reset();
    fornecedores();
    f.quando.value = agoraLocal();
    f.base.innerHTML = ativas.map((b) => '<option value="' + b.id + '">' + esc(b.nome) + '</option>').join('');
    opcoesTanque(f.base.value);
    opcoesCadastro();
    el('bm-form-titulo').textContent = 'Lançar compra';
    el('bm-salvar').textContent = 'Lançar compra';
    el('bm-erro').classList.add('oculto');
    precoUnit();
  }
  const dlg = el('bm-dlg');
  const fecharForm = () => { if (dlg && dlg.open) dlg.close(); };
  if (f) {
    if (!ativas.length) f.innerHTML = '<div class="vazio">Cadastre uma base em Bomba interna > Estoque para lançar compras.</div>';
    else {
      limparForm();
      f.base.addEventListener('change', () => { opcoesTanque(f.base.value); opcoesCadastro(); });
      f.tanque.addEventListener('change', opcoesCadastro);
      f.cadastro.addEventListener('change', () => {
        const x = cadastro.find((y) => y.cnpj === f.cadastro.value);
        if (!x) return;
        // a escolha no cadastro sempre manda: CNPJ e nome juntos (antes o nome só entrava com o campo vazio e, trocando a
        // escolha, ficava o fornecedor antigo com o CNPJ do novo — 11/11/2026)
        f.cnpj.value = fmtCnpj(x.cnpj);
        f.fornecedor.value = x.fornecedor;
        notaCadastro();
      });
      f.cnpj.addEventListener('input', () => {
        notaCadastro();
        const c = String(f.cnpj.value).replace(/\D/g, ''), x = c.length === 14 ? cadastro.find((y) => y.cnpj === c) : null;
        if (x) { f.cadastro.value = c; f.fornecedor.value = x.fornecedor; }   // CNPJ do cadastro: o nome acompanha
      });
      f.litros.addEventListener('input', precoUnit);
      f.valor.addEventListener('input', precoUnit);
      f.fornecedor.addEventListener('change', () => { const c = fornecedores().get(f.fornecedor.value.trim().toUpperCase()); if (c && !f.cnpj.value) f.cnpj.value = fmtCnpj(c); });
      el('bm-cancelar').addEventListener('click', () => { fecharForm(); limparForm(); });
      el('bm-novo').addEventListener('click', () => { limparForm(); dlg.showModal(); f.quando.focus(); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        // data fora do comum (outro ano ou a mais de 45 dias de hoje): confirma antes. Em 11/11/2026 um pedido foi lançado
        // com 11/11/2025 e não entrou no estoque (a compra só conta depois da medição do tanque) nem aparecia na lista
        const q = new Date(f.quando.value), hoje = new Date();
        if (!Number.isNaN(q.getTime()) && (q.getFullYear() !== hoje.getFullYear() || Math.abs(q - hoje) > 45 * 864e5) &&
          !(await confirmar('A data do pedido é ' + q.toLocaleDateString('pt-BR') + ' ' + q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
            ', longe de hoje. Está certa? (Compra com data antes da medição do tanque não entra no estoque.)'))) { f.quando.focus(); return; }
        const corpo = { id: editando ? editando.id : undefined, base_id: Number(f.base.value), tanque: f.tanque.value, quando: f.quando.value,
          litros: lerNum(f.litros.value), valor: lerNum(f.valor.value), nf: f.nf.value, obs: f.obs.value,
          fornecedor: f.fornecedor.value, cnpj: f.cnpj.value, emissao: f.emissao.value };
        await enviar(corpo, el('bm-salvar'), () => { fecharForm(); limparForm(); });
      });
    }
  }
  async function enviar(corpo, btn, depois) {
    const erro = el('bm-erro'), rot = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    try {
      const r = await fetch('/api/bomba/movimentacoes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { location.href = '/?entrar=1'; return; }
      if (!r.ok) { if (erro) { erro.textContent = j.erro || 'Não foi possível salvar.'; erro.classList.remove('oculto'); } else alert(j.erro || 'Não foi possível salvar.'); return; }
      movs = j.movimentacoes;
      if (depois) depois();
      desenhar();
    } catch {
      if (erro) { erro.textContent = 'Sem conexão com o servidor. Tente de novo.'; erro.classList.remove('oculto'); }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = rot; }
    }
  }

  function visiveis() {
    const fb = el('bm-f-base').value, ft = el('bm-f-tanque').value;
    return movs.filter((m) => (!fb || m.base_id === Number(fb)) && (!ft || m.tanque === ft));
  }
  function desenhar() {
    const ls = visiveis();
    const litros = ls.reduce((s, m) => s + m.litros, 0), valor = ls.reduce((s, m) => s + m.valor, 0);
    el('bm-conta').textContent = num(ls.length) + (ls.length === 1 ? ' compra' : ' compras');
    el('bm-totais').innerHTML = '<div><dt>Litros</dt><dd class="num">' + num(litros, 0) + ' L</dd></div><div><dt>Valor</dt><dd class="num">R$ ' + num(valor, 2) + '</dd></div>' +
      '<div><dt>Preço médio</dt><dd class="num">' + (litros ? 'R$ ' + num(valor / litros, 4) : '—') + '</dd></div>';
    el('bm-tabela').innerHTML = '<thead><tr><th><span>Data e hora</span></th><th><span>Unidade</span></th><th><span>Tanque</span></th><th class="n"><span>Litros</span></th>' +
      '<th class="n"><span>Valor total</span></th><th class="n"><span>R$/L</span></th><th><span>NF</span></th><th><span>Fornecedor</span></th><th><span>Observação</span></th><th><span>Lançado por</span></th>' +
      (podeEditar ? '<th class="acoes-linha"><span>Ações</span></th>' : '') + '</tr></thead><tbody>' +
      (ls.length ? ls.map((m) => '<tr><td>' + esc(fmtQuando(m.quando)) + '</td><td>' + esc(nomeBase(m.base_id)) + '</td><td>' + esc(NOME_TANQUE[m.tanque]) + '</td>' +
        '<td class="n">' + num(m.litros, 0) + '</td><td class="n">R$ ' + num(m.valor, 2) + '</td><td class="n">' + num(m.valor / m.litros, 4) + '</td>' +
        '<td>' + esc(m.nf || '') + (m.emissao ? '<br><small class="rt-quem">emissão ' + esc(m.emissao.split('-').reverse().join('/')) + '</small>' : '') + '</td>' +
        '<td class="trunc" title="' + esc((m.fornecedor || '') + (m.cnpj ? ' · ' + fmtCnpj(m.cnpj) : '')) + '">' + esc(m.fornecedor || '') + '</td><td class="trunc" title="' + esc(m.obs || '') + '">' + esc(m.obs || '') + '</td><td>' + esc(m.usuario_nome) + '</td>' +
        (podeEditar ? '<td class="acoes-linha"><button type="button" class="btn-linha" data-editar="' + m.id + '">Editar</button>' +
          '<button type="button" class="btn-lixeira" data-excluir="' + m.id + '" aria-label="Excluir compra" title="Excluir compra"><svg aria-hidden="true"><use href="#i-lixeira"/></svg></button></td>' : '') + '</tr>').join('')
        : '<tr><td colspan="11"><div class="vazio">Nenhuma compra lançada' + (podeEditar && ativas.length ? '. Use o botão Lançar compra.' : '.') + '</div></td></tr>') + '</tbody>';
  }
  el('bm-f-base').addEventListener('change', desenhar);
  el('bm-f-tanque').addEventListener('change', desenhar);
  el('bm-tabela').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-editar]'), ex = e.target.closest('[data-excluir]');
    if (ed && f) {
      const m = movs.find((x) => x.id === Number(ed.dataset.editar));
      if (!m) return;
      editando = m;
      if (!ativas.some((b) => b.id === m.base_id)) f.base.innerHTML += '<option value="' + m.base_id + '">' + esc(nomeBase(m.base_id)) + '</option>';
      f.base.value = String(m.base_id); opcoesTanque(m.base_id, m.tanque);
      f.quando.value = m.quando; f.litros.value = num(m.litros, 2); f.valor.value = num(m.valor, 2); f.nf.value = m.nf || ''; f.obs.value = m.obs || '';
      f.fornecedor.value = m.fornecedor || ''; f.cnpj.value = fmtCnpj(m.cnpj); f.emissao.value = m.emissao || '';
      opcoesCadastro();
      el('bm-form-titulo').textContent = 'Editar compra'; el('bm-salvar').textContent = 'Salvar alteração';
      precoUnit();
      if (!dlg.open) dlg.showModal();
      f.litros.focus();
    }
    if (ex) {
      const m = movs.find((x) => x.id === Number(ex.dataset.excluir));
      if (!m || !await confirmar('Excluir a compra de ' + num(m.litros, 0) + ' L de ' + NOME_TANQUE[m.tanque] + ' (' + nomeBase(m.base_id) + ', ' + fmtQuando(m.quando) + ')? Ela sai do estoque.')) return;
      await enviar({ id: m.id, excluir: true }, null, () => { if (editando && editando.id === m.id) limparForm(); });
    }
  });
  ligarBaixar(el('bm-exportar'), () => ({
    nome: 'movimentacoes-bomba-interna-' + new Date().toISOString().slice(0, 10), aba: 'Movimentações',
    colunas: [{ titulo: 'Data e hora', largura: 17 }, { titulo: 'Unidade', largura: 26 }, { titulo: 'Tanque', largura: 10 },
      { titulo: 'Litros', tipo: 'numero', casas: 2, largura: 12 }, { titulo: 'Valor total', tipo: 'moeda', largura: 14 }, { titulo: 'R$/L', tipo: 'numero', casas: 4, largura: 10 },
      { titulo: 'NF', largura: 12 }, { titulo: 'Emissão', tipo: 'data', largura: 12 }, { titulo: 'Fornecedor', largura: 28 }, { titulo: 'CNPJ', largura: 20 },
      { titulo: 'Observação', largura: 30 }, { titulo: 'Lançado por', largura: 20 }],
    linhas: visiveis().map((m) => [fmtQuando(m.quando), nomeBase(m.base_id), NOME_TANQUE[m.tanque], m.litros, m.valor, m.litros ? m.valor / m.litros : null, m.nf,
      m.emissao || '', m.fornecedor, fmtCnpj(m.cnpj), m.obs, m.usuario_nome]),
  }));
  desenhar();
  return {};
}
