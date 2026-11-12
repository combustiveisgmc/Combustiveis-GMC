// Integração com as APIs dos cartões frota (Ticket Log e TruckPag): busca as transações de um dia e transforma cada uma
// no mesmo "evento" que o Consolidador monta a partir das planilhas (public/gestao/lib/consolidador.js). Usado pelo vigia
// (sincronizar.mjs) para mostrar as transações no site na hora e gravar o dia anterior na Base_copia (D-1).
// Credenciais só neste computador: %LOCALAPPDATA%\GestaoCombustivel\apis-cartoes.json (fora do ownCloud), no formato
//   {"ticket": {"host", "basic", "clientes": [245364, ...]}, "truckpag": {"hosts": ["https://api.prd.truckpag.com.br"], "token"}}
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORE = await import(pathToFileURL(path.join(PROJETO, 'public', 'gestao', 'lib', 'consolidador.js')).href);
export const ARQ_CONFIG = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'apis-cartoes.json');
export const temConfig = () => fs.existsSync(ARQ_CONFIG);
const config = () => JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8'));

const TEMPO = 60_000;   // ms por chamada
async function chamar(url, opcoes) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEMPO);
  try {
    const r = await fetch(url, { ...opcoes, signal: ctl.signal });
    const texto = await r.text();
    let j; try { j = JSON.parse(texto); } catch { j = null; }
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (j && (j.message || j.mensagem || j.errorMessage) || texto).toString().slice(0, 200));
    if (j === null) throw new Error('resposta não é JSON: ' + texto.slice(0, 200));
    return j;
  } finally { clearTimeout(t); }
}

// ---------- Ticket Log (produto 4 = Fleet; a consulta aceita no máximo 1 dia) ----------
export async function buscarTicket(dia) {
  const c = config().ticket, todas = [];
  for (const cliente of c.clientes) {
    const j = await chamar(c.host + '/ticketlog-servicos/ebs/transacaoVeiculo/search', {
      method: 'POST', headers: { Authorization: 'Basic ' + c.basic, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ codigoCliente: cliente, codigoTipoCartao: 4, considerarTransacao: 'T', ordem: 'T',
        dataTransacaoInicial: dia + 'T00:00:00', dataTransacaoFinal: dia + 'T23:59:59' }),
    });
    if (!j.sucesso) throw new Error('Ticket (cliente ' + cliente + '): ' + String(j.mensagem || j.codigoErro).split('\n')[0]);
    for (const t of j.transacoes || []) todas.push({ ...t, _cliente: cliente });
  }
  return todas;
}

// ---------- TruckPag (API nova: relatório analítico de abastecimentos) ----------
export async function buscarTruckpag(dia) {
  const c = config().truckpag;
  const j = await chamar(c.hosts[0] + '/api/integracao-clientes/relatorios/analitico-abastecimentos', {
    method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data_inicial: dia, data_final: dia, bomba: 'T' }),
  });
  return (j.Dados || []).filter((t) => String(t.data_transacao || '').slice(0, 10) === dia);
}

// "AAAA-MM-DD HH:MM:SS(.mmm)" ou "AAAA-MM-DDTHH:MM:SS" (hora local) -> Date com a hora local nos campos UTC (como o Consolidador)
function dataLocal(s) {
  const [a, m, d, h = 0, mi = 0, se = 0] = String(s).match(/\d+/g).map(Number);
  return new Date(Date.UTC(a, m - 1, d, h, mi, se));
}
const txt = (v) => (v === null || v === undefined ? null : String(v).normalize('NFC').replace(/\s+/g, ' ').trim() || null);
const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Ticket -> evento (mesmos campos do lerTicket do Consolidador). Campos que a API não traz (nome reduzido, número da
// frota, endereço do posto...) vêm do histórico da Base em completarDoHistorico().
export function eventoTicket(t) {
  const [fuel] = CORE.normFuel(t.tipoCombustivel);
  const ia = (t.informacoesAdicionais || []).map((x) => txt(x && x.descricaoIA));
  return {
    fonte: 'TICKET', _api: 'ticket', _id: String(t.codigoTransacao),
    'CODIGO TRANSACAO': n(t.codigoTransacao), 'FORMA DE PAGAMENTO': 'Cartao Fisico',
    'CODIGO CLIENTE': t._cliente, 'NOME REDUZIDO': null,
    'DATA TRANSACAO': dataLocal(t.dataTransacao), PLACA: txt(t.placa), 'TIPO FROTA': txt(t.tipoFrota),
    'MODELO VEICULO': txt(t.veiculoModelo), 'NUMERO FROTA': txt(t.numeroFrota), ANO: n(t.ano),
    MATRICULA: n(t.numeroMatricula), 'NOME MOTORISTA': txt(t.nomeMotorista),
    SERVICO: t.codigoTipoCombustivel ? 'Abastecimento' : txt(t.servico),
    'TIPO COMBUSTIVEL': fuel, LITROS: n(t.litros), 'VL/LITRO': n(t.valorLitro),
    'HODOMETRO OU HORIMETRO': n(t.quilometragem), 'KM RODADOS OU HORAS TRABALHADAS': n(t.quilometrosRodados),
    'KM/LITRO OU LITROS/HORA': n(t.quilometrosPorLitro), 'VALOR EMISSAO': n(t.valorTransacao),
    'CODIGO ESTABELECIMENTO': n(t.codigoEstabelecimento),
    // a API marca a bomba interna com " (I)" no fim do nome (POSTO INT RAJA SALVADOR (I)); na Base o nome vem sem isso
    'NOME ESTABELECIMENTO': (txt(t.nomeReduzidoEstabelecimento) || '').replace(/\s*\([IEP]\)\s*$/, '') || null,
    'TIPO ESTABELECIMENTO': null, ENDERECO: null, BAIRRO: null, CIDADE: txt(t.nomeCidade), UF: txt(t.uf),
    'INFORMACAO ADIDIONAL 1': ia[0] || null, 'INFORMACAO ADIDIONAL 2': ia[1] || null, 'INFORMACAO ADIDIONAL 3': ia[2] || null,
    'INFORMACAO ADIDIONAL 4': ia[3] || null, 'INFORMACAO ADIDIONAL 5': ia[4] || null,
    'FORMA TRANSACAO': null, 'CODIGO LIBERACAO RESTRICAO': n(t.codigoLiberacaoRestricao) || null, 'SERIE POS': txt(t.descricaoSeriePOS),
    'NUMERO CARTAO': txt(t.numeroCartao), 'FAMILIA VEICULO': txt(t.familiaVeiculo), 'GRUPO RESTRICAO': txt(t.grupoRestricaoTransacao),
    'CODIGO EMISSORA': n(t.codigoEmissora), RESPONSAVEL: txt(t.responsavel),
    _raw_endereco: null, _raw_cidade: txt(t.nomeCidade), _raw_uf: txt(t.uf),
    _precisa_km: false, _precisa_veiculo: false, _precisa_motorista: false, _precisa_posto: true,
  };
}

// TruckPag -> evento (mesmos campos do lerTruckpag do Consolidador; veículo, matrícula e posto vêm do histórico)
export function eventoTruckpag(t) {
  const [fuel] = CORE.normFuel(t.combustivel);
  const end = [txt(t.estabelecimento_endereco), t.estabelecimento_numero && Number(t.estabelecimento_numero) ? String(t.estabelecimento_numero) : null, txt(t.estabelecimento_complemento)].filter(Boolean).join(', ');
  return {
    fonte: 'TRUCKPAG', _api: 'truckpag', _id: String(t.id_transacao),
    'CODIGO TRANSACAO': null, 'FORMA DE PAGAMENTO': 'TRUCKPAG',
    'DATA TRANSACAO': dataLocal(t.data_transacao), PLACA: txt(t.placa), 'NOME MOTORISTA': txt(t.motorista) || '',
    // R$/L pelo valor total (a API arredonda o valor_litro em 2 casas; o valor total é o cobrado)
    'TIPO COMBUSTIVEL': fuel, LITROS: n(t.volume), 'VL/LITRO': n(t.volume) ? n(t.valor_total) / n(t.volume) : n(t.valor_litro),
    'HODOMETRO OU HORIMETRO': t.quilometragem === null || t.quilometragem === undefined ? null : Math.trunc(Number(t.quilometragem)),
    'NOME ESTABELECIMENTO': txt(t.estabelecimento),
    _raw_endereco: end || null, _raw_cidade: txt(t.cidade || t.estabelecimento_cidade), _raw_uf: txt(t.uf),
    _precisa_km: true, _precisa_veiculo: true, _precisa_motorista: true, _precisa_posto: true,
  };
}

// campos de veículo que a Ticket não manda: os do último abastecimento da placa na Base
const VEICULO = ['CODIGO CLIENTE', 'NOME REDUZIDO', 'TIPO FROTA', 'MODELO VEICULO', 'NUMERO FROTA', 'ANO', 'SERVICO',
  'INFORMACAO ADIDIONAL 1', 'INFORMACAO ADIDIONAL 2', 'INFORMACAO ADIDIONAL 3', 'INFORMACAO ADIDIONAL 4', 'INFORMACAO ADIDIONAL 5',
  'FORMA TRANSACAO', 'CODIGO LIBERACAO RESTRICAO', 'SERIE POS', 'NUMERO CARTAO', 'FAMILIA VEICULO', 'GRUPO RESTRICAO', 'CODIGO EMISSORA', 'RESPONSAVEL'];
export function completarDoHistorico(base, ev) {
  if (ev.fonte !== 'TICKET') return ev;
  const hist = base.vehicle_hist.get(ev.PLACA) || [];
  let prev = null;
  for (const [d, v] of hist) { if (d <= ev['DATA TRANSACAO']) prev = v; else break; }
  if (prev) for (const c of VEICULO) if (ev[c] === null || ev[c] === undefined || ev[c] === '') ev[c] = prev[c] ?? null;
  return ev;
}

// mesma transação (para não contar/gravar duas vezes): placa + minuto + litros
export const chaveTransacao = (placa, data, litros) =>
  String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') + '|' + Math.floor(data.getTime() / 60000) + '|' + Math.round(Number(litros || 0) * 100);
// ===================== processamento do vigia (sincronizar.mjs chama processar() a cada volta) =====================
const CACHE = path.join(PROJETO, '.dados', 'cartoes-api');
export const HISTORICO = path.join(CACHE, 'historico.json');     // cópia do histórico do Consolidador (Base + Base_copia)
const GERADO_BASE = path.join(PROJETO, '.dados', 'abastecimentos.json');   // dados dos painéis (só a Base.xlsx)
const TEMPO_REAL = path.join(CACHE, 'tempo-real.json');
const INICIO_D1 = '2026-10-23';      // primeiro dia gravado na Base_copia pela API (até 22/10 veio pelas planilhas)
const HORA_D1 = 6;                   // o dia anterior é gravado a partir das 6h
const JANELA = 15;                   // dias para trás que podem aparecer em tempo real (se a Base.xlsx estiver atrasada)
const REVISAO = 40;                  // dias fechados relidos uma vez por dia, atrás de lançamentos atrasados nos portais dos cartões
const TARDIOS = path.join(CACHE, 'tardios.json');   // ids que apareceram depois de o dia fechar (podem ir ao D-1 mesmo antes de INICIO_D1)
const p2 = (x) => String(x).padStart(2, '0');
const diaLocal = (ms = Date.now()) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const somarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const quandoDe = (d) => d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
const idDe = (ev) => ev._api + ':' + ev._id;
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };

// transações de um dia, guardadas em .dados/cartoes-api/AAAA-MM-DD.json; busca de novo conforme a idade do dia
async function transacoesDoDia(dia, hoje, log) {
  const arq = path.join(CACHE, dia + '.json');
  const c = lerJson(arq, null);
  const idade = c ? Date.now() - c.em : Infinity;
  const recente = dia >= somarDias(hoje, -1), ultimos = dia >= somarDias(hoje, -3);
  // lido com o dia ainda em andamento (antes das 6h do dia seguinte): não vale como leitura final, por mais antigo que o dia seja.
  // Em 30/10/2026 o vigia parou às 15:59 e só voltou em 03/11: o arquivo de 30/10 (meio dia) foi para o D-1 e 23 transações ficaram de fora.
  const fechado = c && c.em >= new Date(somarDias(dia, 1) + 'T' + p2(HORA_D1) + ':00:00').getTime();
  // mais antigos e lidos depois do fim do dia: relê uma vez por dia até REVISAO dias (lançamento atrasado no portal do cartão:
  // em 10/11/2026 um abastecimento de 19/10 foi lançado na Ticket e nunca chegou, porque o dia já estava lido e fechado)
  const validade = recente || !fechado ? 5 * 60e3 : ultimos ? 60 * 60e3 : dia >= somarDias(hoje, -REVISAO) ? 24 * 3600e3 : Infinity;
  if (c && idade < validade) return { ...c, buscou: false, tardios: [] };
  try {
    const [ticket, truckpag] = await Promise.all([buscarTicket(dia), buscarTruckpag(dia)]);
    const novo = { dia, em: Date.now(), ticket, truckpag };
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(arq, JSON.stringify(novo));
    // tardios: transações que não estavam na leitura anterior, já feita com o dia fechado (só nesse caso: sem leitura fechada
    // antes não há como saber o que é atrasado)
    let tardios = [];
    if (c && fechado) {
      const antes = new Set([...c.ticket.map((t) => 'ticket:' + t.codigoTransacao), ...c.truckpag.map((t) => 'truckpag:' + t.id_transacao)]);
      tardios = [...ticket.map((t) => 'ticket:' + t.codigoTransacao), ...truckpag.map((t) => 'truckpag:' + t.id_transacao)].filter((id) => !antes.has(id));
    }
    return { ...novo, buscou: true, tardios, mudou: !c || c.ticket.length !== ticket.length || c.truckpag.length !== truckpag.length };
  } catch (e) {
    log('APIs dos cartões: não foi possível ler ' + dia + ' (' + String(e.message || e).slice(0, 160) + ')' + (c ? '; fica a leitura anterior.' : '.'));
    return c ? { ...c, buscou: false, tardios: [] } : { dia, em: 0, ticket: [], truckpag: [], buscou: false, tardios: [] };
  }
}

// decisões de postos do Consolidador no formato do consolidar()
function decisoesDe(postos) {
  return {
    aliasExtras: postos.filter((p) => p.decisao === 'mesmo' && p.canonico).map((p) => [p.nome, p.canonico]),
    postosNovos: postos.filter((p) => p.decisao === 'novo').map((p) => ({ nome_cru: p.nome, endereco: p.endereco, cidade: p.cidade, uf: p.uf })),
    postosIgnorados: postos.filter((p) => p.decisao === 'ignorar').map((p) => p.nome),
  };
}

// linhas (48 colunas) -> formato colunar dos painéis (mesmas regras do scripts/importar_base.py)
const COL = { forma: 1, reduzido: 3, data: 4, placa: 5, motorista: 11, servico: 12, combustivel: 13, litros: 14, vl: 15, hodo: 16, km: 17,
  valor: 19, posto: 21, tipo: 22, cidade: 25, uf: 26, cc: 29, campanha: 42 };
function colunar(linhas) {
  const dicNomes = ['placa', 'motorista', 'combustivel', 'fornecedor', 'cidade', 'cc', 'tipo_estab', 'cartao', 'reduzido'];
  const dic = Object.fromEntries(dicNomes.map((k) => [k, []])), idx = Object.fromEntries(dicNomes.map((k) => [k, new Map()]));
  const d = (k, v) => { if (!idx[k].has(v)) { idx[k].set(v, dic[k].length); dic[k].push(v); } return idx[k].get(v); };
  const col = Object.fromEntries(['data', 'placa', 'motorista', 'combustivel', 'litros', 'vl_litro', 'hodometro', 'km', 'despesa',
    'fornecedor', 'cidade', 'cc', 'campanha', 'tipo_estab', 'seg', 'cartao', 'reduzido'].map((k) => [k, []]));
  const t = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  const fora = [];
  for (const l of linhas) {
    const r = l.slice(1);   // sem a fonte
    const dt = CORE.excelSerialToDate(r[COL.data]);
    const nn = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
    if (t(r[COL.servico]) && t(r[COL.servico]) !== 'Abastecimento') fora.push(col.data.length);
    col.data.push(Math.floor(dt.getTime() / 864e5));
    col.seg.push(dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60 + dt.getUTCSeconds());
    col.placa.push(d('placa', t(r[COL.placa]).toUpperCase()));
    col.motorista.push(d('motorista', t(r[COL.motorista]).toUpperCase()));
    col.combustivel.push(d('combustivel', t(r[COL.combustivel]).toUpperCase()));
    col.litros.push(Math.round((nn(r[COL.litros]) || 0) * 1e4) / 1e4);
    col.vl_litro.push(nn(r[COL.vl]) === null ? null : Math.round(nn(r[COL.vl]) * 1e4) / 1e4);
    col.hodometro.push(nn(r[COL.hodo]) === null ? null : Math.round(nn(r[COL.hodo])));
    col.km.push(nn(r[COL.km]) === null ? null : Math.round(nn(r[COL.km])));
    col.despesa.push(nn(r[COL.valor]) === null ? null : Math.round(nn(r[COL.valor]) * 1e4) / 1e4);
    col.fornecedor.push(d('fornecedor', t(r[COL.posto])));
    const cid = t(r[COL.cidade]), uf = t(r[COL.uf]);
    col.cidade.push(d('cidade', cid && uf ? cid + ' - ' + uf : cid));
    col.cc.push(d('cc', t(r[COL.cc]).toUpperCase()));
    const camp = t(r[COL.campanha]).toUpperCase();
    col.campanha.push(['SIM', 'S'].includes(camp) ? 1 : ['NÃO', 'NAO', 'N'].includes(camp) ? 0 : null);
    col.tipo_estab.push(d('tipo_estab', t(r[COL.tipo]).toUpperCase()));
    col.cartao.push(d('cartao', l[0] === 'TICKET' ? 'TICKET' : 'TRUCKPAG'));
    col.reduzido.push(d('reduzido', t(r[COL.reduzido]).toUpperCase()));   // empresa (Rateio das NFs)
  }
  return { dic, col, foraAbastecimento: fora, linhas: linhas.length };
}

// chaves (placa|minuto|litros) dos abastecimentos que os painéis já têm (Base.xlsx), e o último dia deles
function chavesDaBase() {
  const b = lerJson(GERADO_BASE, null);
  if (!b) return { chaves: new Set(), ultimoDia: null };
  const chaves = new Set();
  let max = -Infinity;
  for (let i = 0; i < b.linhas; i++) {
    const dia = b.col.data[i];
    if (dia > max) max = dia;
    const min = dia * 1440 + Math.floor((b.col.seg ? b.col.seg[i] || 0 : 0) / 60);
    chaves.add(String(b.dic.placa[b.col.placa[i]] || '').replace(/[^A-Z0-9]/g, '') + '|' + min + '|' + Math.round((b.col.litros[i] || 0) * 100));
  }
  return { chaves, ultimoDia: new Date(max * 864e5).toISOString().slice(0, 10) };
}

let ultimaAssinatura = null;   // do conteúdo em tempo real já enviado
// Uma volta: lê as APIs, grava o dia anterior (D-1) como lote do Consolidador e publica as transações fora da Base.
// api(metodo, rota, corpo) = chamada autenticada ao site; kvPut(chave, arquivo) = envio ao KV; log(msg).
export async function processar({ api, kvPut, log, gerarHistorico }) {
  if (!temConfig()) return;
  const hoje = diaLocal();
  const { chaves: naBase, ultimoDia } = chavesDaBase();
  const inicio = [somarDias(hoje, -JANELA), ultimoDia ? somarDias(ultimoDia, 1) : INICIO_D1].sort().pop();
  // também os dias do D-1 ainda não confirmados e os da revisão (lançamentos atrasados)
  const normal = [inicio, INICIO_D1].sort()[0];
  const primeiro = [normal, somarDias(hoje, -REVISAO)].sort()[0];
  const dias = [];
  for (let d = primeiro; d <= hoje; d = somarDias(d, 1)) dias.push(d);
  const lidos = [];
  for (const d of dias) lidos.push(await transacoesDoDia(d, hoje, log));
  const tardios = new Set(lerJson(TARDIOS, []));
  const novosTardios = lidos.flatMap((l) => l.tardios || []).filter((id) => !tardios.has(id));
  if (novosTardios.length) {
    novosTardios.forEach((id) => tardios.add(id));
    fs.writeFileSync(TARDIOS, JSON.stringify([...tardios]));
    log('APIs dos cartões: ' + novosTardios.length + ' lançamento(s) atrasado(s) nos cartões encontrado(s) na releitura (' + novosTardios.join(', ') + ').');
  }
  const eventos = [];
  // dias só da revisão (antes da janela normal): entram só os atrasados, para o rateio das NFs e o resto seguirem como antes
  const entra = (ev, dia) => dia >= normal || tardios.has(idDe(ev));
  for (const l of lidos) {
    for (const t of l.ticket) { const ev = eventoTicket(t); ev._dia = l.dia; if (entra(ev, l.dia)) eventos.push(ev); }
    for (const t of l.truckpag) { const ev = eventoTruckpag(t); ev._dia = l.dia; if (entra(ev, l.dia)) eventos.push(ev); }
  }
  if (!fs.existsSync(HISTORICO)) { log('APIs dos cartões: gerando o histórico da Base para o primeiro uso…'); gerarHistorico(); }
  const hist = lerJson(HISTORICO, null);
  if (!hist) { log('APIs dos cartões: histórico da Base indisponível; tenta na próxima volta.'); return; }
  const estado = await api('GET', '/api/sync/cartoes-api/estado');
  const enviados = new Set(estado.ids), dec = decisoesDe(estado.postos || []);
  const jaNaBase = new Set(lerJson(path.join(CACHE, 'ja-na-base.json'), []));   // ids que já estavam na Base_copia (planilhas)
  // Rateio das NFs (scripts/bomba_rateio.mjs): preço da nota (e centro de custo validado) nos abastecimentos das bombas internas
  let rateio = null;
  try {
    const m = await import('./bomba_rateio.mjs');
    rateio = await m.preparar({ api, kvPut, log, eventos, aliasExtras: dec.aliasExtras });
  } catch (e) { log('Rateio das NFs: não foi possível calcular (' + String(e.message || e).slice(0, 200) + ').'); }
  const ajustar = (l) => (rateio ? rateio.ajustar(l) : l);

  // ---------- D-1: dias anteriores ainda não mandados para a Base_copia ----------
  if (new Date().getHours() >= HORA_D1) {
    // antes de INICIO_D1 (dias que vieram pelas planilhas) só os atrasados; o consolidar() ainda tira os que já estão na Base
    const candidatos = eventos.filter((ev) => (ev._dia >= INICIO_D1 || tardios.has(idDe(ev))) && ev._dia < hoje && !enviados.has(idDe(ev)) && !jaNaBase.has(idDe(ev)))
      .map((ev) => ({ ...ev }));   // o consolidar() preenche os eventos: cópia, para o tempo real partir do original
    if (candidatos.length) {
      const base = CORE.carregarHistorico(hist);
      for (const [k, serial] of estado.chaves || []) if (!base.existing_keys.has(k)) base.existing_keys.set(k, [CORE.excelSerialToDate(serial)]);
      candidatos.forEach((ev) => completarDoHistorico(base, ev));
      const r = CORE.consolidar({ base, manuais: candidatos, ...dec });
      const duplicados = new Set(r.duplicados.map((x) => x.placa + '|' + x.data.getTime() + '|' + x.hodometro));
      const dup = candidatos.filter((ev) => duplicados.has(ev.PLACA + '|' + ev['DATA TRANSACAO'].getTime() + '|' + ev['HODOMETRO OU HORIMETRO']));
      if (dup.length) { dup.forEach((ev) => jaNaBase.add(idDe(ev))); fs.writeFileSync(path.join(CACHE, 'ja-na-base.json'), JSON.stringify([...jaNaBase])); }
      const porDia = new Map();
      for (const ev of r.eventos) { if (!porDia.has(ev._dia)) porDia.set(ev._dia, []); porDia.get(ev._dia).push(ev); }
      for (const [dia, evs] of [...porDia.entries()].sort()) {
        const linhas = evs.map((ev) => ajustar([ev.fonte, ...CORE.buildRow(ev)]));
        const chaves = evs.filter((ev) => ev['HODOMETRO OU HORIMETRO'] !== null && ev['HODOMETRO OU HORIMETRO'] !== undefined)
          .map((ev) => [[ev.PLACA, ev['HODOMETRO OU HORIMETRO'], ev['TIPO COMBUSTIVEL']].join('§'), CORE.dateToSerial(ev['DATA TRANSACAO'])]);
        const resumo = { n_ticket: evs.filter((e) => e.fonte === 'TICKET').length, n_truckpag: evs.filter((e) => e.fonte === 'TRUCKPAG').length,
          avisos: r.avisos.filter((a) => evs.some((e) => a.includes(e.PLACA))).slice(0, 50) };
        const j = await api('POST', '/api/sync/cartoes-api/lote', { dia, linhas, chaves, ids: evs.map(idDe), resumo });
        evs.forEach((ev) => enviados.add(idDe(ev)));
        log(`APIs dos cartões: ${dia} mandado para a Base_copia (lote ${j.id}: ${resumo.n_ticket} Ticket, ${resumo.n_truckpag} TruckPag).`);
      }
    }
  }

  // ---------- tempo real: transações que a Base.xlsx (painéis) ainda não tem ----------
  const vivos = eventos.filter((ev) => ev._dia >= inicio && !naBase.has(chaveTransacao(ev.PLACA, ev['DATA TRANSACAO'], ev.LITROS)));
  let linhas = [];
  if (vivos.length) {
    const base = CORE.carregarHistorico(hist);
    const copias = vivos.map((ev) => ({ ...ev }));
    for (const ev of copias) {   // tira o próprio abastecimento do histórico (pode já estar na Base_copia) para não virar duplicado
      CORE.tirarDoHistorico(base, { placa: ev.PLACA, combustivel: ev['TIPO COMBUSTIVEL'], quando: quandoDe(ev['DATA TRANSACAO']) });
      completarDoHistorico(base, ev);
    }
    const r = CORE.consolidar({ base, manuais: copias, ...dec });
    linhas = r.eventos.map((ev) => ajustar([ev.fonte, ...CORE.buildRow(ev)]));
  }
  const conteudo = colunar(linhas);
  const ultima = vivos.reduce((m, ev) => (ev['DATA TRANSACAO'] > m ? ev['DATA TRANSACAO'] : m), new Date(0));
  const porCartao = { TICKET: linhas.filter((l) => l[0] === 'TICKET').length, TRUCKPAG: linhas.filter((l) => l[0] === 'TRUCKPAG').length };
  const assinatura = JSON.stringify([conteudo.col, conteudo.dic]);
  if (assinatura === ultimaAssinatura) return;
  const agora = new Date();
  const versao = agora.getFullYear() + p2(agora.getMonth() + 1) + p2(agora.getDate()) + p2(agora.getHours()) + p2(agora.getMinutes()) + p2(agora.getSeconds());
  const saida = { versao, geradoEm: agora.toISOString(), ate: linhas.length ? quandoDe(ultima).replace('T', ' ') : null, porCartao, desde: inicio, ...conteudo };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(TEMPO_REAL, JSON.stringify(saida));
  const arqVersao = path.join(CACHE, 'tempo-real-versao.json');
  fs.writeFileSync(arqVersao, JSON.stringify({ versao, geradoEm: saida.geradoEm, linhas: linhas.length, ate: saida.ate, porCartao }));
  kvPut('tempo-real', TEMPO_REAL);
  kvPut('tempo-real-versao', arqVersao);   // por último: o site só vê a versão nova quando os dados já estão lá
  ultimaAssinatura = assinatura;
  log(`APIs dos cartões: ${linhas.length} transação(ões) em tempo real no site (${porCartao.TICKET} Ticket, ${porCartao.TRUCKPAG} TruckPag, desde ${inicio}${saida.ate ? ', última ' + saida.ate : ''}).`);
}