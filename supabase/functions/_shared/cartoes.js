// Integração com as APIs dos cartões frota (Ticket Log e TruckPag): regras do tempo real e do D-1, sem arquivos nem rede próprios
// (passo 4 da migração, 19/11/2026: mudaram de scripts/cartoes_api.mjs para cá sem mudar regra). Quem usa passa um `io` com onde
// ler/gravar e como falar com o mundo: o vigia (scripts/cartoes_api.mjs, arquivos em .dados e KV pelo wrangler) e a nuvem
// (supabase/functions/cartoes-api, banco e portal; cópia em _shared feita por scripts/nuvem_publicar.mjs).
// Cada transação vira o mesmo "evento" que o Consolidador monta a partir das planilhas (public/gestao/lib/consolidador.js).
//
// io = {
//   log(msg), api(metodo, rota, corpo) -> json (portal, token de sincronização),
//   buscarTicket(dia), buscarTruckpag(dia) -> transações cruas do dia,
//   ler(nome, padrao), gravar(nome, valor) -> estado guardado ('dia:AAAA-MM-DD', 'tardios', 'ja-na-base', 'assinatura-tempo-real'),
//   publicar(chave, objeto) -> 'tempo-real' e depois 'tempo-real-versao' (o portal lê do KV),
//   historico() -> histórico do Consolidador (Base + Base_copia) ou null,
//   chavesBanco(desde)? -> {chaves} do banco (gestao_chaves_tempo_real); sem ele, chavesBase() -> {chaves, ultimoDia} (Base.xlsx),
//   rateio({eventos, aliasExtras})? -> {ajustar(linha)} (Rateio das NFs),
//   agora() -> ms, diaLocal(ms) -> 'AAAA-MM-DD', horaLocal() -> 0..23, msLocal('AAAA-MM-DDTHH:MM:SS') -> ms (hora do Brasil),
//   maxBuscas? -> quantos dias ler das APIs por volta (o resto fica com a leitura anterior; a nuvem tem tempo limitado)
// }
/* global AbortController */
import * as CORE from './consolidador.js';
export { CORE };

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
// cfg = {host, basic, clientes: [...]} (apis-cartoes.json > ticket)
export async function buscarTicket(cfg, dia) {
  const c = cfg, todas = [];
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
// cfg = {hosts: [...], token} (apis-cartoes.json > truckpag)
export async function buscarTruckpag(cfg, dia) {
  const c = cfg;
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

// as APIs mandam o CPF do motorista em cada transação (cpfMotorista na Ticket, motorista_cpf na TruckPag): sai antes de
// guardar, ninguém usa (desde 12/11/2026 o portal não guarda CPF de motorista)
export const semCpf = (ls) => (Array.isArray(ls) ? ls.map((t) => Object.fromEntries(Object.entries(t || {}).filter(([k]) => !/cpf/i.test(k)))) : ls);

// ===================== uma volta (o vigia chama a cada 5 min; a nuvem pelo agendador) =====================
export const INICIO_D1 = '2026-10-23';      // primeiro dia gravado na Base_copia pela API (até 22/10 veio pelas planilhas)
export const HORA_D1 = 6;                   // o dia anterior é gravado a partir das 6h
export const JANELA = 15;                   // dias para trás que podem aparecer em tempo real
export const REVISAO = 40;                  // dias fechados relidos uma vez por dia, atrás de lançamentos atrasados nos portais dos cartões
const p2 = (x) => String(x).padStart(2, '0');
export const somarDias = (dia, k) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const quandoDe = (d) => d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
export const idDe = (ev) => ev._api + ':' + ev._id;

// transações de um dia, guardadas em io ('dia:AAAA-MM-DD'); busca de novo conforme a idade do dia
async function transacoesDoDia(io, dia, hoje, cont) {
  const c = await io.ler('dia:' + dia, null);
  const idade = c ? io.agora() - c.em : Infinity;
  const recente = dia >= somarDias(hoje, -1), ultimos = dia >= somarDias(hoje, -3);
  // lido com o dia ainda em andamento (antes das 6h do dia seguinte): não vale como leitura final, por mais antigo que o dia seja.
  // Em 30/10/2026 o vigia parou às 15:59 e só voltou em 03/11: o arquivo de 30/10 (meio dia) foi para o D-1 e 23 transações ficaram de fora.
  const fechado = c && c.em >= io.msLocal(somarDias(dia, 1) + 'T' + p2(HORA_D1) + ':00:00');
  // mais antigos e lidos depois do fim do dia: relê uma vez por dia até REVISAO dias (lançamento atrasado no portal do cartão:
  // em 10/11/2026 um abastecimento de 19/10 foi lançado na Ticket e nunca chegou, porque o dia já estava lido e fechado)
  const validade = recente || !fechado ? 5 * 60e3 : ultimos ? 60 * 60e3 : dia >= somarDias(hoje, -REVISAO) ? 24 * 3600e3 : Infinity;
  if (c && idade < validade) return { ...c, buscou: false, tardios: [] };
  // limite de leituras por volta (nuvem): o que passar fica com a leitura anterior e vai na próxima volta
  if (c && io.maxBuscas !== undefined && cont.buscas >= io.maxBuscas) return { ...c, buscou: false, tardios: [] };
  cont.buscas++;
  try {
    const [ticket, truckpag] = (await Promise.all([io.buscarTicket(dia), io.buscarTruckpag(dia)])).map(semCpf);
    const novo = { dia, em: io.agora(), ticket, truckpag };
    await io.gravar('dia:' + dia, novo);
    // tardios: transações que não estavam na leitura anterior, já feita com o dia fechado (só nesse caso: sem leitura fechada
    // antes não há como saber o que é atrasado)
    let tardios = [];
    if (c && fechado) {
      const antes = new Set([...c.ticket.map((t) => 'ticket:' + t.codigoTransacao), ...c.truckpag.map((t) => 'truckpag:' + t.id_transacao)]);
      tardios = [...ticket.map((t) => 'ticket:' + t.codigoTransacao), ...truckpag.map((t) => 'truckpag:' + t.id_transacao)].filter((id) => !antes.has(id));
    }
    return { ...novo, buscou: true, tardios, mudou: !c || c.ticket.length !== ticket.length || c.truckpag.length !== truckpag.length };
  } catch (e) {
    io.log('APIs dos cartões: não foi possível ler ' + dia + ' (' + String(e.message || e).slice(0, 160) + ')' + (c ? '; fica a leitura anterior.' : '.'));
    return c ? { ...c, buscou: false, tardios: [] } : { dia, em: 0, ticket: [], truckpag: [], buscou: false, tardios: [] };
  }
}

// decisões de postos do Consolidador no formato do consolidar()
export function decisoesDe(postos) {
  return {
    aliasExtras: postos.filter((p) => p.decisao === 'mesmo' && p.canonico).map((p) => [p.nome, p.canonico]),
    postosNovos: postos.filter((p) => p.decisao === 'novo').map((p) => ({ nome_cru: p.nome, endereco: p.endereco, cidade: p.cidade, uf: p.uf })),
    postosIgnorados: postos.filter((p) => p.decisao === 'ignorar').map((p) => p.nome),
  };
}

// linhas (48 colunas) -> formato colunar dos painéis (mesmas regras do scripts/importar_base.py)
const COL = { forma: 1, reduzido: 3, data: 4, placa: 5, motorista: 11, servico: 12, combustivel: 13, litros: 14, vl: 15, hodo: 16, km: 17,
  valor: 19, posto: 21, tipo: 22, cidade: 25, uf: 26, cc: 29, campanha: 42 };
export function colunar(linhas) {
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

// Uma volta: lê as APIs, grava o dia anterior (D-1) como lote do Consolidador e publica as transações fora da base.
// Devolve um resumo {lotes: [{dia, n}], tempoReal: n|null} (a nuvem anota na execução).
export async function processar(io) {
  const resumo = { lotes: [], tempoReal: null };
  const hoje = io.diaLocal(io.agora());
  // 19/11/2026: os painéis leem do banco (que recebe o D-1), então o tempo real é o que o banco ainda não tem: chaves do banco nos
  // últimos JANELA dias, sem corte pela última data (um lançamento de hoje pelo Consolidador esconderia o dia todo). Sem banco,
  // como antes: o que a Base.xlsx (painéis) ainda não tem.
  const doBanco = io.chavesBanco ? await io.chavesBanco(somarDias(hoje, -(JANELA + 1))).catch(() => null) : null;
  const { chaves: naBase, ultimoDia } = doBanco && Array.isArray(doBanco.chaves) ? { chaves: new Set(doBanco.chaves), ultimoDia: null }
    : io.chavesBase ? await io.chavesBase() : { chaves: new Set(), ultimoDia: null };
  const inicio = doBanco ? somarDias(hoje, -JANELA) : [somarDias(hoje, -JANELA), ultimoDia ? somarDias(ultimoDia, 1) : INICIO_D1].sort().pop();
  // também os dias do D-1 ainda não confirmados e os da revisão (lançamentos atrasados)
  const normal = [inicio, INICIO_D1].sort()[0];
  const primeiro = [normal, somarDias(hoje, -REVISAO)].sort()[0];
  const dias = [];
  for (let d = primeiro; d <= hoje; d = somarDias(d, 1)) dias.push(d);
  // do mais novo para o mais velho: com limite de leituras por volta, os dias recentes são lidos primeiro
  const cont = { buscas: 0 };
  const lidos = [];
  for (const d of [...dias].reverse()) lidos.unshift(await transacoesDoDia(io, d, hoje, cont));
  const tardios = new Set(await io.ler('tardios', []));
  const novosTardios = lidos.flatMap((l) => l.tardios || []).filter((id) => !tardios.has(id));
  if (novosTardios.length) {
    novosTardios.forEach((id) => tardios.add(id));
    await io.gravar('tardios', [...tardios]);
    io.log('APIs dos cartões: ' + novosTardios.length + ' lançamento(s) atrasado(s) nos cartões encontrado(s) na releitura (' + novosTardios.join(', ') + ').');
  }
  const eventos = [];
  // dias só da revisão (antes da janela normal): entram só os atrasados, para o rateio das NFs e o resto seguirem como antes
  const entra = (ev, dia) => dia >= normal || tardios.has(idDe(ev));
  for (const l of lidos) {
    for (const t of l.ticket) { const ev = eventoTicket(t); ev._dia = l.dia; if (entra(ev, l.dia)) eventos.push(ev); }
    for (const t of l.truckpag) { const ev = eventoTruckpag(t); ev._dia = l.dia; if (entra(ev, l.dia)) eventos.push(ev); }
  }
  const hist = await io.historico();
  if (!hist) { io.log('APIs dos cartões: histórico da Base indisponível; tenta na próxima volta.'); return resumo; }
  const estado = await io.api('GET', '/api/sync/cartoes-api/estado');
  const enviados = new Set(estado.ids), dec = decisoesDe(estado.postos || []);
  const jaNaBase = new Set(await io.ler('ja-na-base', []));   // ids que já estavam na Base_copia (planilhas)
  // Rateio das NFs (lib/nuvem/rateio-bomba.js): preço da nota (e centro de custo validado) nos abastecimentos das bombas internas
  let rateio = null;
  if (io.rateio) {
    try { rateio = await io.rateio({ eventos, aliasExtras: dec.aliasExtras }); }
    catch (e) { io.log('Rateio das NFs: não foi possível calcular (' + String(e.message || e).slice(0, 200) + ').'); }
  }
  const ajustar = (l) => (rateio ? rateio.ajustar(l) : l);

  // ---------- D-1: dias anteriores ainda não mandados para a Base_copia ----------
  if (io.horaLocal() >= HORA_D1) {
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
      if (dup.length) { dup.forEach((ev) => jaNaBase.add(idDe(ev))); await io.gravar('ja-na-base', [...jaNaBase]); }
      const porDia = new Map();
      for (const ev of r.eventos) { if (!porDia.has(ev._dia)) porDia.set(ev._dia, []); porDia.get(ev._dia).push(ev); }
      for (const [dia, evs] of [...porDia.entries()].sort()) {
        const linhas = evs.map((ev) => ajustar([ev.fonte, ...CORE.buildRow(ev)]));
        const chaves = evs.filter((ev) => ev['HODOMETRO OU HORIMETRO'] !== null && ev['HODOMETRO OU HORIMETRO'] !== undefined)
          .map((ev) => [[ev.PLACA, ev['HODOMETRO OU HORIMETRO'], ev['TIPO COMBUSTIVEL']].join('§'), CORE.dateToSerial(ev['DATA TRANSACAO'])]);
        const res = { n_ticket: evs.filter((e) => e.fonte === 'TICKET').length, n_truckpag: evs.filter((e) => e.fonte === 'TRUCKPAG').length,
          avisos: r.avisos.filter((a) => evs.some((e) => a.includes(e.PLACA))).slice(0, 50) };
        const j = await io.api('POST', '/api/sync/cartoes-api/lote', { dia, linhas, chaves, ids: evs.map(idDe), resumo: res });
        evs.forEach((ev) => enviados.add(idDe(ev)));
        resumo.lotes.push({ dia, n: evs.length, id: j.id ?? null });
        io.log(`APIs dos cartões: ${dia} mandado para a Base_copia (lote ${j.id}: ${res.n_ticket} Ticket, ${res.n_truckpag} TruckPag).`);
      }
    }
  }

  // ---------- tempo real: transações que a base (banco) ainda não tem ----------
  // com o banco: também fora o que o D-1 já mandou ou julgou repetido (o banco tem, mesmo se a placa/hora foi corrigida depois)
  const vivos = eventos.filter((ev) => ev._dia >= inicio && !naBase.has(chaveTransacao(ev.PLACA, ev['DATA TRANSACAO'], ev.LITROS)) &&
    !(doBanco && (enviados.has(idDe(ev)) || jaNaBase.has(idDe(ev)))));
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
  resumo.tempoReal = linhas.length;
  const assinatura = JSON.stringify([conteudo.col, conteudo.dic]);
  if (assinatura === (await io.ler('assinatura-tempo-real', null))) return resumo;
  const agora = new Date(io.agora());
  const versao = io.diaLocal(io.agora()).replace(/-/g, '') + p2(io.horaLocal()) + p2(agora.getUTCMinutes()) + p2(agora.getUTCSeconds());
  const saida = { versao, geradoEm: agora.toISOString(), ate: linhas.length ? quandoDe(ultima).replace('T', ' ') : null, porCartao, desde: inicio, ...conteudo };
  await io.publicar('tempo-real', saida);
  // por último: o site só vê a versão nova quando os dados já estão lá
  await io.publicar('tempo-real-versao', { versao, geradoEm: saida.geradoEm, linhas: linhas.length, ate: saida.ate, porCartao });
  await io.gravar('assinatura-tempo-real', assinatura);
  io.log(`APIs dos cartões: ${linhas.length} transação(ões) em tempo real no site (${porCartao.TICKET} Ticket, ${porCartao.TRUCKPAG} TruckPag, desde ${inicio}${saida.ate ? ', última ' + saida.ate : ''}).`);
  return resumo;
}
