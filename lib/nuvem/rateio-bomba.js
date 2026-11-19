// Bomba interna > Rateio das NFs, parte do vigia (scripts/cartoes_api.mjs chama a cada volta das APIs dos cartões):
//  1) junta os abastecimentos das bombas internas: Base_copia (lista publicada pelo vigia) + transações das APIs que a
//     Base_copia ainda não tem (mesmo minuto e litros = mesmo abastecimento);
//  2) publica no KV ("bomba-rateio") a lista de cada tanque para a página (validação e rateio de cada nota);
//  3) nos tanques com início do rateio definido, calcula o rateio (public/gestao/lib/rateio.js, a mesma conta da página)
//     e corrige o VL/LITRO e o VALOR EMISSAO para o preço da nota (e a INFORMAÇÃO ADICIONAL 3 corrigida na validação):
//     na Base_copia pela fila do Editar abastecimentos; nas linhas do D-1 e do tempo real pelo ajustar().
// Passo 4 da migração (19/11/2026): regras do Rateio das NFs sem arquivos próprios (antes em scripts/bomba_rateio.mjs, sem mudar
// regra). io = {api, log, agora(), diaLocal(ms), lista() -> lista da Base_copia ({col, dic, versao}), inteiras({postos, desde}) ->
// {linha: [40 colunas]} das bombas, ler(nome, padrao)/gravar(nome, valor) ('rateio-enviados', 'bomba-rateio'), publicar(chave, objeto)}.
// Usado pelo vigia (scripts/bomba_rateio.mjs) e pela nuvem (supabase/functions/cartoes-api, cópia em _shared).
import * as CORE from '../../public/gestao/lib/consolidador.js';
import { ratear } from '../../public/gestao/lib/rateio.js';
const DIAS_LINHA = 60;        // linha inteira só dos últimos 60 dias (o CSV é feito na validação, logo depois da nota fechar)
const DIAS_SEM_INICIO = 30;   // tanque sem início definido: a página mostra os últimos 30 dias (para escolher onde começar)

const p2 = (x) => String(x).padStart(2, '0');
const tanqueDe = (c) => (/ARLA/i.test(c || '') ? 'arla' : /^DIESEL/i.test(c || '') ? 'diesel' : null);
const normPlaca = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
// horários em ms com a hora local nos campos UTC (como o resto do sistema)
const msDoSerial = (s) => Math.round((s - 25569) * 86400) * 1000;
const msDoQuando = (q) => { const [a, m, d, h, mi, s] = q.match(/\d+/g).map(Number); return Date.UTC(a, m - 1, d, h, mi, s || 0); };
const quandoDoMs = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); };
// mesma chave do chaveTransacao (cartoes_api.mjs) e da página: placa | minuto | litros×100
export const chave = (placa, ms, litros) => normPlaca(placa) + '|' + Math.floor(ms / 60000) + '|' + Math.round(Number(litros || 0) * 100);
const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;

// Regras de 17/11/2026 (pedido do usuário: o preço dos abastecimentos das bombas ficava indo e voltando entre duas notas):
// 1) o preço da nota só é aplicado quando TODAS as notas do abastecimento estão fechadas (litros todos rateados);
export function precoFechado(x) {
  if (!x || x.preco === null || x.preco === undefined || !x.nota) return null;
  const notas = x.partes.filter((p) => p.nota).map((p) => p.nota);
  return notas.length && notas.every((n) => n.situacao === 'fechada') ? x.preco : null;
}
// 2) depois disso o preço fica travado: abastecimento corrigido à mão ou que já recebeu o preço da nota fechada não muda mais
//    (estado.travados: placa, data = serial do Excel, tanque; à mão = sem tanque, vale para qualquer combustível);
const segundo = (serial) => Math.round(Number(serial) * 86400);
export function travas(travados) {
  const s = new Set();
  for (const t of travados || []) s.add(normPlaca(t.placa) + '|' + segundo(t.data) + '|' + (t.tanque || '*'));
  return (placa, serial, tanque) => s.has(normPlaca(placa) + '|' + segundo(serial) + '|*') || s.has(normPlaca(placa) + '|' + segundo(serial) + '|' + tanque);
}
// 3) o mesmo abastecimento da API e da Base_copia: mesma placa, até 10 min e 0,5 L de diferença (o minuto exato contava em
//    dobro quando a hora da API e a da Base caíam em minutos diferentes, e o rateio empurrava os seguintes para outra nota)
export const mesmoAbastecimento = (a, b) => normPlaca(a.placa) === normPlaca(b.placa) && Math.abs(a.t - b.t) <= 10 * 60000 &&
  Math.abs(Number(a.litros) - Number(b.litros)) <= 0.5;

// lista da Base_copia (formato colunar do base_copia_lista.py) -> linhas
function linhasDaLista(lista) {
  if (!lista || !lista.col) return [];
  const c = lista.col, D = lista.dic, txt = (k, i) => (c[k] && c[k][i] !== null && c[k][i] !== undefined ? D[k][c[k][i]] : null);
  const r = [];
  for (let i = 0; i < c.linha.length; i++) {
    if (typeof c.dt[i] !== 'number') continue;
    r.push({ linha: c.linha[i], serial: c.dt[i], t: msDoSerial(c.dt[i]), placa: txt('placa', i), motorista: txt('mot', i), fuel: txt('fuel', i),
      posto: txt('posto', i), litros: c.litros[i], vl: c.vl[i], valor: c.valor[i], cc: txt('inf3', i), reduzido: txt('reduzido', i) });
  }
  return r;
}

export async function preparar(io, { eventos, aliasExtras }) {
  const { api, log } = io;
  const estado = await api('GET', '/api/sync/bomba-rateio/estado');
  const aliasMap = CORE.buildAliasMap(aliasExtras);
  const basePorPosto = new Map(estado.bases.map((b) => [CORE.postoLookupKey(b.posto, aliasMap), b]));
  const lista = await io.lista();
  const daLista = linhasDaLista(lista);
  const limiteLinha = io.agora() - DIAS_LINHA * 864e5;
  let inteiras = {};
  {   // postos das bombas e data inicial para o base_copia_lista.py (vale na próxima publicação da lista)
    const ini = (estado.inicios || []).map((i) => msDoQuando(i.quando));
    const desde = Math.max(limiteLinha, ini.length ? Math.min(...ini) : limiteLinha) - 864e5;
    const pb = { postos: estado.bases.map((b) => b.posto), desde: Math.floor(desde / 864e5) + 25569 };
    inteiras = (await io.inteiras(pb)) || {};   // linhas inteiras das bombas (vigia: a lista publicada; nuvem: o banco)
  }
  // empresa e centro de custo mais recentes de cada placa (as transações da API não trazem o nome reduzido)
  const daPlaca = new Map();
  for (const l of [...daLista].sort((a, b) => a.t - b.t)) {
    const p = normPlaca(l.placa);
    if (p) daPlaca.set(p, { reduzido: l.reduzido || (daPlaca.get(p) || {}).reduzido || null, cc: l.cc || (daPlaca.get(p) || {}).cc || null });
  }
  const porTanque = new Map();   // 'base_id|tanque' -> transações
  const grupo = (b, tq) => { const k = b.id + '|' + tq; if (!porTanque.has(k)) porTanque.set(k, []); return porTanque.get(k); };
  const vistos = new Set();      // base|tanque|minuto|litros
  const daBase = new Map();      // base|tanque|placa -> [{t, litros}] (para casar a API com a Base com tolerância)
  for (const l of daLista) {
    const b = basePorPosto.get(CORE.postoLookupKey(l.posto, aliasMap)), tq = tanqueDe(l.fuel);
    if (!b || !tq || !(l.litros > 0)) continue;
    vistos.add(b.id + '|' + tq + '|' + Math.floor(l.t / 60000) + '|' + Math.round(l.litros * 100));
    const kb = b.id + '|' + tq + '|' + normPlaca(l.placa);
    if (!daBase.has(kb)) daBase.set(kb, []);
    daBase.get(kb).push({ placa: l.placa, t: l.t, litros: l.litros });
    grupo(b, tq).push({ id: chave(l.placa, l.t, l.litros), t: l.t, placa: normPlaca(l.placa), motorista: l.motorista, litros: l.litros,
      reduzido: l.reduzido, cc: l.cc, origem: 'base', linha: l.linha, serial: l.serial, vl: l.vl, valor: l.valor });
  }
  for (const ev of eventos || []) {
    const b = basePorPosto.get(CORE.postoLookupKey(ev['NOME ESTABELECIMENTO'], aliasMap)), tq = tanqueDe(ev['TIPO COMBUSTIVEL']);
    const t = ev['DATA TRANSACAO'] && ev['DATA TRANSACAO'].getTime(), litros = ev.LITROS;
    if (!b || !tq || !t || !(litros > 0)) continue;
    const k = b.id + '|' + tq + '|' + Math.floor(t / 60000) + '|' + Math.round(litros * 100);
    if (vistos.has(k)) continue;
    const ev2 = { placa: ev.PLACA, t, litros };
    if ((daBase.get(b.id + '|' + tq + '|' + normPlaca(ev.PLACA)) || []).some((x) => mesmoAbastecimento(ev2, x))) continue;   // já está na Base
    vistos.add(k);
    const pl = normPlaca(ev.PLACA), hist = daPlaca.get(pl) || {};
    grupo(b, tq).push({ id: chave(pl, t, litros), t, placa: pl, motorista: texto(ev['NOME MOTORISTA']).toUpperCase() || null, litros,
      reduzido: ev['NOME REDUZIDO'] || hist.reduzido || null, cc: ev['INFORMACAO ADIDIONAL 3'] || hist.cc || null, origem: 'api' });
  }

  const ccs = new Map((estado.ccs || []).map((c) => [c.chave, c.cc]));
  const pendentes = new Set(estado.linhasPendentes || []);
  const travado = travas(estado.travados);
  const ajustes = new Map();     // id -> {preco, cc}: aplicados às linhas do D-1 e do tempo real
  const correcoes = [];          // fila da Base_copia
  const tanques = [];
  const agora = io.agora();
  for (const [k, trs] of porTanque) {
    const [baseId, tq] = k.split('|');
    const ini = (estado.inicios || []).find((i) => String(i.base_id) === baseId && i.tanque === tq);
    trs.sort((a, b) => a.t - b.t || a.placa.localeCompare(b.placa));
    const desde = ini ? msDoQuando(ini.quando) : Date.parse(io.diaLocal(agora) + 'T00:00:00Z') - DIAS_SEM_INICIO * 864e5;
    const visiveis = trs.filter((tr) => tr.t >= desde);
    tanques.push({ base_id: Number(baseId), tanque: tq, desde: quandoDoMs(desde), transacoes: visiveis.map((tr) => ({ id: tr.id, quando: quandoDoMs(tr.t),
      placa: tr.placa, motorista: tr.motorista, litros: tr.litros, reduzido: tr.reduzido, cc: tr.cc, origem: tr.origem, linha: tr.linha || null,
      ...(tr.linha && tr.t >= limiteLinha && inteiras[tr.linha] ? { completa: inteiras[tr.linha] } : {}) })) });
    for (const tr of visiveis) if (ccs.has(tr.id)) ajustes.set(tr.id, { cc: ccs.get(tr.id) });
    if (!ini) continue;
    const notas = estado.notas.filter((n) => String(n.base_id) === baseId && n.tanque === tq);
    const r = ratear(visiveis, notas, { t: desde, placa: ini.placa || null, jaRateado: ini.ja_rateado || 0 });
    for (const x of r.transacoes) {
      const tr = x.tr, cc = ccs.get(tr.id);
      const preco = precoFechado(x);   // nota ainda em uso: fica o preço do cartão até ela fechar
      if (preco !== null) ajustes.set(tr.id, { ...(ajustes.get(tr.id) || {}), preco });
      if (tr.origem !== 'base' || pendentes.has(tr.linha)) continue;
      const celulas = {}, antes = {};
      if (preco !== null && !travado(tr.placa, tr.serial, tq)) {
        const p = arred(preco, 6), v = arred(tr.litros * preco, 2);
        if (tr.vl === null || Math.abs(tr.vl - p) > 0.00005 || tr.valor === null || Math.abs(tr.valor - v) > 0.005) {
          celulas.P = p; celulas.T = v; antes.P = tr.vl; antes.T = tr.valor;
        }
      }
      if (cc && texto(cc).toUpperCase() !== texto(tr.cc).toUpperCase()) { celulas.AD = cc; antes.AD = tr.cc; }
      if (Object.keys(celulas).length) correcoes.push({ linha: tr.linha, placa: tr.placa, data: tr.serial, tanque: tq, celulas, antes });
    }
  }
  // CC corrigido em abastecimento de tanque sem início (só a Base_copia; o preço não muda)
  for (const t of tanques) {
    const ini = (estado.inicios || []).some((i) => i.base_id === t.base_id && i.tanque === t.tanque);
    if (ini) continue;
    for (const tr of porTanque.get(t.base_id + '|' + t.tanque)) {
      const cc = ccs.get(tr.id);
      if (!cc || tr.origem !== 'base' || pendentes.has(tr.linha) || texto(cc).toUpperCase() === texto(tr.cc).toUpperCase()) continue;
      correcoes.push({ linha: tr.linha, placa: tr.placa, data: tr.serial, tanque: t.tanque, celulas: { AD: cc }, antes: { AD: tr.cc } });
    }
  }

  // correções da Base_copia: cada uma só uma vez por versão da lista (até a lista nova chegar, a antiga ainda mostra o valor velho)
  const env = await io.ler('rateio-enviados', {});
  const versao = lista ? lista.versao : null;
  const ja = new Set(env.versao === versao ? env.chaves || [] : []);
  const novas = correcoes.filter((c) => !ja.has(c.linha + '|' + JSON.stringify(c.celulas)));
  for (let i = 0; i < novas.length; i += 300) {
    const lote = novas.slice(i, i + 300);
    const j = await api('POST', '/api/sync/bomba-rateio/precos', { itens: lote });
    lote.forEach((c) => ja.add(c.linha + '|' + JSON.stringify(c.celulas)));
    await io.gravar('rateio-enviados', { versao, chaves: [...ja] });
    log(`Rateio das NFs: ${j.inseridos} correção(ões) de preço/centro de custo para a Base_copia.`);
  }

  // todos os centros de custo (informação adicional 3) que existem na Base_copia, para a lista de correção da página
  const centros = [...new Set(daLista.map((l) => texto(l.cc).toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // lista para a página (só manda de novo se mudou)
  tanques.sort((a, b) => a.base_id - b.base_id || a.tanque.localeCompare(b.tanque));
  const anterior = await io.ler('bomba-rateio', null);
  if (!anterior || JSON.stringify(anterior.tanques) !== JSON.stringify(tanques) || JSON.stringify(anterior.centros) !== JSON.stringify(centros)) {
    const saida = { geradoEm: new Date(io.agora()).toISOString(), listaBaseCopia: versao, tanques, centros };
    await io.gravar('bomba-rateio', saida);
    await io.publicar('bomba-rateio', saida);
  }

  // linha do lote/tempo real: [fonte, ...buildRow] (data 5, placa 6, litros 15, vl/litro 16, valor 20, inf. adicional 3 em 30)
  return {
    ajustar(l) {
      if (!ajustes.size) return l;
      const a = ajustes.get(chave(l[6], msDoSerial(l[5]), l[15]));
      if (!a) return l;
      const n = [...l];
      if (a.preco !== undefined && a.preco !== null) { n[16] = arred(a.preco, 6); n[20] = arred((l[15] || 0) * a.preco, 2); }
      if (a.cc) n[30] = a.cc;
      return n;
    },
  };
}