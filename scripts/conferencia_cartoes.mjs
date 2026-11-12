// Conferência com os cartões (Operacional): relê os últimos 45 dias da Ticket Log e da TruckPag (APIs) e compara com a
// CONTROLES\Base_copia.xlsx (lista .dados/cartoes-api/base-copia.json, montada pelo scripts/base_copia_lista.py). Publica no
// KV "conferencia-cartoes" o que está diferente (hodômetro, litros e valor), o que falta na Base_copia e o que sumiu do
// cartão. A classificação (corrigido no portal x alterado no cartão x conflito) é feita no site, com o histórico de
// correções (functions/api/conferencia-cartoes). Também atende os pedidos de inclusão da tela: monta o lote com o motor
// do Consolidador, como o D-1 das APIs (scripts/cartoes_api.mjs).
// Bomba interna: só hodômetro e litros (o valor muda de propósito no Rateio das NFs).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buscarTicket, buscarTruckpag, eventoTicket, eventoTruckpag, temConfig, CORE, completarDoHistorico, HISTORICO, semCpf } from './cartoes_api.mjs';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(PROJETO, '.dados', 'cartoes-api', 'conferencia');
const LISTA = path.join(PROJETO, '.dados', 'cartoes-api', 'base-copia.json');
const SAIDA = path.join(PROJETO, '.dados', 'cartoes-api', 'conferencia-cartoes.json');
const CONFIG = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'apis-cartoes.json');
const DIAS = 45;                    // dias conferidos (até anteontem: ontem ainda pode estar entrando pelo D-1)
const INTERVALO = 3 * 3600e3;       // uma conferência completa a cada 3 horas
const VALIDADE = 2.5 * 3600e3;      // leitura de um dia vale por 2,5 h (na próxima volta lê de novo)

const p2 = (x) => String(x).padStart(2, '0');
const diaLocal = (ms = Date.now()) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const limpa = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ehArla = (f) => /ARLA/i.test(String(f || ''));
const minutoDeData = (d) => Math.round((d.getTime() / 864e5 + 25569) * 1440);   // a data vem com a hora local nos campos UTC
const quandoDe = (min) => { const d = new Date((min / 1440 - 25569) * 864e5); return d.toISOString().slice(0, 16).replace('T', ' '); };
const idDe = (ev) => ev._api + ':' + ev._id;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
function cartaoDaLinha(forma, serial) {
  const f = semAcento(forma);
  if (f === 'CARTAO FISICO') return 'TICKET';
  if (f === 'TRUCKPAG') return 'TRUCKPAG';
  if (!f && serial < 45836) return 'TICKET';   // forma vazia antes de 28/06/2025: só havia Ticket
  return null;
}

async function lerDia(dia, log) {
  const arq = path.join(CACHE, dia + '.json');
  const c = lerJson(arq, null);
  if (c && Date.now() - c.em < VALIDADE) return c;
  try {
    const [ticket, truckpag] = (await Promise.all([buscarTicket(dia), buscarTruckpag(dia)])).map(semCpf);   // sem o CPF do motorista
    const novo = { dia, em: Date.now(), ticket, truckpag };
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(arq, JSON.stringify(novo));
    return novo;
  } catch (e) {
    log('Conferência com os cartões: não foi possível ler ' + dia + ' (' + String(e.message || e).slice(0, 160) + ')' + (c ? '; fica a leitura anterior.' : '.'));
    return c;   // null: o dia fica fora (não acusa nada sem ter lido)
  }
}

function eventosDe(lido) {
  const evs = [];
  for (const t of lido.ticket) { const ev = eventoTicket(t); ev._dia = lido.dia; ev._raw = t; evs.push(ev); }
  for (const t of lido.truckpag) { const ev = eventoTruckpag(t); ev._dia = lido.dia; ev._raw = t; evs.push(ev); }
  return evs;
}

// situação de cada transação da TruckPag (relatório analítico de transações, o mesmo da Conciliação de NFs): o relatório
// de abastecimentos não diz se foi estornada/recusada nem se o lançamento manual da bomba foi um VAZAMENTO (não é abastecimento)
async function situacaoTruckpag(desde, ate, log) {
  try {
    const c = lerJson(CONFIG, {}).truckpag || {};
    const host = (c.hosts || []).find((h) => /prd/.test(h)) || 'https://api.prd.truckpag.com.br';
    const r = await fetch(host + '/api/integracao-clientes/relatorios/analitico-transacao', { method: 'POST', signal: AbortSignal.timeout(180_000),
      headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ data_inicial: desde, data_final: ate }) });
    const j = await r.json();
    if (!Array.isArray(j.data)) throw new Error('HTTP ' + r.status);
    return new Map(j.data.map((x) => [String(x.transacao_id), { status: String(x.transacao_status || '').toUpperCase(), mensagem: String(x.mensagem || '').toUpperCase() }]));
  } catch (e) {
    log('Conferência com os cartões: situação das transações da TruckPag indisponível (' + String(e.message || e).slice(0, 120) + ').');
    return new Map();
  }
}
const naoConta = (ev, situacao) => {
  if (ev._api !== 'truckpag') return false;
  const s = situacao.get(String(ev._id));
  return !!s && (s.status !== 'APROVADA' || s.mensagem.includes('VAZAMENTO'));
};

// compara os eventos dos cartões com a Base_copia; dias = os que foram lidos (só eles entram em "sumiu")
function comparar(eventos, dias, enviados) {
  const b = lerJson(LISTA, null);
  if (!b) throw new Error('lista da Base_copia indisponível');
  const c = b.col, D = b.dic, txt = (k, i) => (c[k][i] === null ? null : D[k][c[k][i]]);
  const diasSet = new Set(dias);
  const porChave = new Map();   // placa|minuto -> linhas da Base_copia
  const porMinuto = new Map();  // minuto -> linhas (para achar a mesma transação com a placa trocada)
  for (let i = 0; i < c.linha.length; i++) {
    const serial = c.dt[i], min = Math.round(serial * 1440);
    const dia = quandoDe(min).slice(0, 10);
    if (!diasSet.has(dia)) continue;
    const posto = txt('posto', i) || '';
    const l = { linha: c.linha[i], serial, min, dia, placa: limpa(txt('placa', i)), fuel: txt('fuel', i), posto, mot: txt('mot', i),
      cartao: cartaoDaLinha(txt('forma', i), serial), interna: /^POSTO INT/i.test(posto),
      Q: c.hodo[i], O: c.litros[i], T: c.valor[i], usada: false };
    const k = l.placa + '|' + min;
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(l);
    if (!porMinuto.has(min)) porMinuto.set(min, []);
    porMinuto.get(min).push(l);
  }
  const mesmoTipo = (l, ev) => !l.usada && ehArla(l.fuel) === ehArla(ev['TIPO COMBUSTIVEL']);
  // 1ª passagem: mesma placa e mesmo minuto (± 1 minuto de arredondamento)
  const achar = (ev) => {
    const placa = limpa(ev.PLACA), min = minutoDeData(ev['DATA TRANSACAO']);
    for (const dm of [0, -1, 1]) {
      const cand = (porChave.get(placa + '|' + (min + dm)) || []).filter((l) => mesmoTipo(l, ev));
      if (cand.length) return cand.sort((x, y) => Math.abs((x.O || 0) - (ev.LITROS || 0)) - Math.abs((y.O || 0) - (ev.LITROS || 0)))[0];
    }
    return null;
  };
  // 2ª passagem: placa trocada (corrigida no portal ou no cartão) — mesmo minuto, mesmo cartão e mesmos litros
  const acharPorLitros = (ev) => {
    const min = minutoDeData(ev['DATA TRANSACAO']);
    for (const dm of [0, -1, 1]) {
      const l = (porMinuto.get(min + dm) || []).find((x) => mesmoTipo(x, ev) && x.cartao === ev.fonte && Math.abs((x.O || 0) - (ev.LITROS || 0)) < 0.01);
      if (l) return l;
    }
    return null;
  };
  // 3ª passagem: hora ou combustível mudados — mesma placa, mesmo dia, mesmo cartão e mesmos litros
  const acharNoDia = (ev) => {
    const placa = limpa(ev.PLACA), dia = quandoDe(minutoDeData(ev['DATA TRANSACAO'])).slice(0, 10);
    for (const ls of porChave.values()) {
      const l = ls.find((x) => !x.usada && x.placa === placa && x.dia === dia && x.cartao === ev.fonte && Math.abs((x.O || 0) - (ev.LITROS || 0)) < 0.01);
      if (l) return l;
    }
    return null;
  };
  const itens = [];
  const base = (ev, extra) => ({ cartao: ev.fonte, placa: limpa(ev.PLACA), quando: quandoDe(minutoDeData(ev['DATA TRANSACAO'])),
    combustivel: ev['TIPO COMBUSTIVEL'], posto: ev['NOME ESTABELECIMENTO'] || '', motorista: ev['NOME MOTORISTA'] || '', ...extra });
  const pares = eventos.map((ev) => { const l = achar(ev); if (l) l.usada = true; return [ev, l]; });
  for (const par of pares) if (!par[1]) { const l = acharPorLitros(par[0]); if (l) { l.usada = true; par[1] = l; } }
  for (const par of pares) if (!par[1]) { const l = acharNoDia(par[0]); if (l) { l.usada = true; par[1] = l; } }
  for (const [ev, l] of pares) {
    const cart = { F: limpa(ev.PLACA), Q: ev['HODOMETRO OU HORIMETRO'], O: ev.LITROS, T: ev['VALOR EMISSAO'] ?? (ev.LITROS && ev['VL/LITRO'] ? Math.round(ev.LITROS * ev['VL/LITRO'] * 100) / 100 : null) };
    if (!l) {
      if (enviados.has(idDe(ev))) continue;   // já foi num lote do D-1: está a caminho da Base_copia
      itens.push(base(ev, { tipo: 'falta', id: idDe(ev), dia: ev._dia, cartaoVals: cart }));
      continue;
    }
    const colunas = [];
    if (l.placa !== cart.F) colunas.push('F');
    if (cart.Q !== null && cart.Q !== undefined && (l.Q === null || Math.abs(l.Q - cart.Q) >= 0.5)) colunas.push('Q');
    // litros: a TruckPag manda 3 casas (150,045) e a Base_copia guarda 2 (150,05); menos de 0,01 L é arredondamento
    if (cart.O !== null && cart.O !== undefined && Math.abs((l.O || 0) - cart.O) >= 0.0099) colunas.push('O');
    // valor: só diferença de mais de R$ 0,50 (a Base_copia guarda o valor com 4 casas; o cartão, com 2)
    if (!l.interna && cart.T !== null && cart.T !== undefined && Math.abs((l.T || 0) - cart.T) >= 0.5) colunas.push('T');
    if (colunas.length) {
      itens.push(base(ev, { tipo: 'diferente', linha: l.linha, chave: l.placa + '|' + l.min, colunas,
        nossos: { F: l.placa, Q: l.Q, O: l.O, T: l.T }, cartaoVals: cart, id: idDe(ev) }));
    }
  }
  // linhas Ticket/TruckPag da Base_copia que nenhuma transação dos cartões explicou
  for (const ls of porChave.values()) {
    for (const l of ls) {
      if (l.usada || !l.cartao) continue;
      itens.push({ tipo: 'sumiu', cartao: l.cartao, placa: l.placa, quando: quandoDe(l.min), combustivel: l.fuel, posto: l.posto, motorista: l.mot || '',
        linha: l.linha, chave: l.placa + '|' + l.min, nossos: { Q: l.Q, O: l.O, T: l.T } });
    }
  }
  itens.sort((a, b) => (a.quando < b.quando ? 1 : -1));
  return itens;
}

// ---------- pedidos de inclusão (tela): lote como o D-1 ----------
async function incluir({ api, log }) {
  const { pedidos } = await api('GET', '/api/sync/conferencia-cartoes/pedidos');
  if (!pedidos || !pedidos.length) return;
  const hist = lerJson(HISTORICO, null);
  if (!hist) { log('Conferência com os cartões: histórico da Base indisponível para incluir; tenta na próxima volta.'); return; }
  const estado = await api('GET', '/api/sync/cartoes-api/estado');
  const dec = {
    aliasExtras: (estado.postos || []).filter((p) => p.decisao === 'mesmo' && p.canonico).map((p) => [p.nome, p.canonico]),
    postosNovos: (estado.postos || []).filter((p) => p.decisao === 'novo').map((p) => ({ nome_cru: p.nome, endereco: p.endereco, cidade: p.cidade, uf: p.uf })),
    postosIgnorados: (estado.postos || []).filter((p) => p.decisao === 'ignorar').map((p) => p.nome),
  };
  const resultado = [];
  const porDia = new Map();
  for (const p of pedidos) { if (!porDia.has(p.dia)) porDia.set(p.dia, []); porDia.get(p.dia).push(p); }
  for (const [dia, ps] of porDia) {
    const lido = await lerDia(dia, log);
    const evs = lido ? eventosDe(lido) : [];
    const escolhidos = [];
    for (const p of ps) {
      const ev = evs.find((e) => idDe(e) === p.cartao_id);
      if (!ev) resultado.push({ id: p.id, estado: 'erro', mensagem: 'A transação não aparece mais no cartão.' });
      else { const c = { ...ev }; delete c._raw; escolhidos.push({ p, ev: c }); }
    }
    if (!escolhidos.length) continue;
    const baseH = CORE.carregarHistorico(hist);
    for (const [k, serial] of estado.chaves || []) if (!baseH.existing_keys.has(k)) baseH.existing_keys.set(k, [CORE.excelSerialToDate(serial)]);
    escolhidos.forEach((x) => completarDoHistorico(baseH, x.ev));
    const r = CORE.consolidar({ base: baseH, manuais: escolhidos.map((x) => x.ev), ...dec });
    const dup = new Set(r.duplicados.map((x) => x.placa + '|' + x.data.getTime() + '|' + x.hodometro));
    const vao = [];
    for (const x of escolhidos) {
      const k = x.ev.PLACA + '|' + x.ev['DATA TRANSACAO'].getTime() + '|' + x.ev['HODOMETRO OU HORIMETRO'];
      if (dup.has(k)) resultado.push({ id: x.p.id, estado: 'duplicado', mensagem: 'Já existe na Base_copia (mesma placa, data e hodômetro).' });
      else vao.push(x);
    }
    const evsLote = r.eventos.filter((e) => vao.some((x) => idDe(x.ev) === idDe(e)));
    if (!evsLote.length) { vao.forEach((x) => resultado.push({ id: x.p.id, estado: 'erro', mensagem: 'O Consolidador não montou a linha.' })); continue; }
    const linhas = evsLote.map((e) => [e.fonte, ...CORE.buildRow(e)]);
    const chaves = evsLote.filter((e) => e['HODOMETRO OU HORIMETRO'] !== null && e['HODOMETRO OU HORIMETRO'] !== undefined)
      .map((e) => [[e.PLACA, e['HODOMETRO OU HORIMETRO'], e['TIPO COMBUSTIVEL']].join('§'), CORE.dateToSerial(e['DATA TRANSACAO'])]);
    const resumo = { n_ticket: evsLote.filter((e) => e.fonte === 'TICKET').length, n_truckpag: evsLote.filter((e) => e.fonte === 'TRUCKPAG').length,
      conferencia: true, avisos: r.avisos.filter((a) => evsLote.some((e) => a.includes(e.PLACA))).slice(0, 50) };
    try {
      const j = await api('POST', '/api/sync/cartoes-api/lote', { dia, linhas, chaves, ids: evsLote.map(idDe), resumo });
      vao.forEach((x) => resultado.push({ id: x.p.id, estado: 'feito', lote_id: j.id, mensagem: 'Lote ' + j.id + ' do Consolidador.' }));
      log(`Conferência com os cartões: ${evsLote.length} transação(ões) de ${dia} incluída(s) num lote da Base_copia (lote ${j.id}).`);
    } catch (e) {
      vao.forEach((x) => resultado.push({ id: x.p.id, estado: 'erro', mensagem: String(e.message || e).slice(0, 200) }));
    }
  }
  if (resultado.length) await api('POST', '/api/sync/conferencia-cartoes/pedidos', { itens: resultado });
}

let proxima = 0;
export async function processar({ api, kvPut, log, forcar }) {
  if (!temConfig()) return;
  try { await incluir({ api, log }); } catch (e) { log('Conferência com os cartões (inclusões): ' + String(e.message || e).slice(0, 200)); }
  const est = lerJson(path.join(CACHE, 'estado.json'), {});
  if (!forcar && (Date.now() < proxima || Date.now() - (est.em || 0) < INTERVALO)) return;
  proxima = Date.now() + INTERVALO;
  const hoje = diaLocal(), ate = somarDias(hoje, -2), desde = somarDias(hoje, -(DIAS + 1));
  const dias = [];
  for (let d = desde; d <= ate; d = somarDias(d, 1)) dias.push(d);
  const lidos = [];
  for (const d of dias) { const l = await lerDia(d, log); if (l) lidos.push(l); }
  const situacao = await situacaoTruckpag(desde, ate, log);
  const eventos = lidos.flatMap(eventosDe).filter((ev) => !naoConta(ev, situacao));
  const estado = await api('GET', '/api/sync/cartoes-api/estado');
  const itens = comparar(eventos, lidos.map((l) => l.dia), new Set(estado.ids || []));
  const saida = { geradoEm: new Date().toISOString(), desde, ate, lidos: lidos.length, transacoes: eventos.length, itens };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(SAIDA, JSON.stringify(saida));
  kvPut('conferencia-cartoes', SAIDA);
  fs.writeFileSync(path.join(CACHE, 'estado.json'), JSON.stringify({ em: Date.now() }));
  const n = (t) => itens.filter((i) => i.tipo === t).length;
  log(`Conferência com os cartões: ${eventos.length} transações de ${lidos.length} dias conferidas; ${n('diferente')} diferente(s), ${n('falta')} faltando na Base_copia, ${n('sumiu')} que não estão no cartão.`);
}