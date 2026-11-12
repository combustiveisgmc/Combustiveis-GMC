// Estornos da TruckPag depois do D-1. O relatório que o vigia usa (relatorios/analitico-abastecimentos) só traz as
// transações válidas: o estorno feito antes das 6h do dia seguinte nunca chega à Base_copia. Feito depois, o abastecimento
// já está lá e continuava. Aqui, a cada 6 horas, o relatório relatorios/analitico-transacao (traz tudo: COMPRA/MANUAL/
// ESTORNO e APROVADA/ESTORNADA/RECUSADA) dos últimos 35 dias é conferido; cada transação ESTORNADA que estiver na
// Base_copia (forma TRUCKPAG; mesmo minuto ±1, mesma litragem e mesmo hodômetro ou mesma placa — a placa pode ter sido
// corrigida à mão) vira exclusão na fila do Editar abastecimentos ("Estorno TruckPag (automático)"), com o km do
// abastecimento seguinte refeito (km_recalcular.itensExclusao). Achada mais de uma linha: só avisa no log.
// Estado em .dados/cartoes-api/estornos.json: {ultima (ms), processados: [transacao_id]}.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { itensExclusao } from './km_recalcular.mjs';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'apis-cartoes.json');
const ESTADO = path.join(PROJETO, '.dados', 'cartoes-api', 'estornos.json');
const LISTA = path.join(PROJETO, '.dados', 'cartoes-api', 'base-copia.json');
const INTERVALO = 6 * 3600e3, DIAS = 35;
const lerJson = (a, p) => { try { return JSON.parse(fs.readFileSync(a, 'utf8')); } catch { return p; } };
const p2 = (x) => String(x).padStart(2, '0');
const diaLocal = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const placaK = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// "AAAA-MM-DD HH:MM:SS(.mmm)" (hora local) -> número serial do Excel, como a coluna E da Base_copia
function serial(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 864e5 + 25569 : null;
}

async function relatorio(ini, fim) {
  const c = lerJson(CONFIG, {}).truckpag;
  const r = await fetch(c.hosts[0] + '/api/integracao-clientes/relatorios/analitico-transacao', { method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data_inicial: ini, data_final: fim }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return Array.isArray(j.data) ? j.data : [];
}

// lista = base-copia.json; estornadas = transações ESTORNADA; aprovadas = as válidas (COMPRA/MANUAL APROVADA) do mesmo
// período -> {indices, ambiguos: [transação], semLinha: [transação]}.
// O posto costuma desfazer e refazer na hora (mesma litragem e hodômetro, segundos depois): a linha é achada pelo segundo
// exato (±5 s); sem ela, até 1,5 min, mas nunca uma linha que bate (±5 s) com uma transação aprovada.
export function acharNaBase(lista, estornadas, aprovadas = []) {
  const { col, dic } = lista;
  const SEG = 5 / 86400, MIN = 1.5 / 1440;
  const indices = [], ambiguos = [], semLinha = [];
  const candidatas = (t, janela) => {
    const dt = serial(t.transacao_data), litros = Number(t.litragem), km = Number(t.quilometragem);
    if (dt === null || !(litros > 0)) return [];
    const r = [];
    for (let i = 0; i < col.linha.length; i++) {
      if (Math.abs(col.dt[i] - dt) > janela || Math.abs((col.litros[i] || 0) - litros) > 0.011) continue;
      if (String(dic.forma[col.forma[i]] || '').toUpperCase() !== 'TRUCKPAG') continue;
      if (col.hodo[i] !== km && placaK(dic.placa[col.placa[i]]) !== placaK(t.veiculo_placa)) continue;
      r.push(i);
    }
    return r;
  };
  const deAprovada = new Set(aprovadas.flatMap((a) => candidatas(a, SEG)));
  for (const t of estornadas) {
    let achadas = candidatas(t, SEG).filter((i) => !deAprovada.has(i));
    if (!achadas.length) achadas = candidatas(t, MIN).filter((i) => !deAprovada.has(i));
    if (achadas.length === 1) indices.push(achadas[0]);
    else if (achadas.length > 1) ambiguos.push(t);
    else semLinha.push(t);
  }
  return { indices: [...new Set(indices)], ambiguos, semLinha };
}

export async function processar({ api, log, forcar = false }) {
  if (!fs.existsSync(CONFIG) || !lerJson(CONFIG, {}).truckpag) return;
  const est = lerJson(ESTADO, { ultima: 0, processados: [] });
  if (!forcar && Date.now() - est.ultima < INTERVALO) return;
  const lista = lerJson(LISTA, null);
  if (!lista || !lista.col) return;
  const feitos = new Set(est.processados.map(String));
  const todas = await relatorio(diaLocal(Date.now() - DIAS * 864e5), diaLocal(Date.now()));
  const estornadas = todas.filter((t) => t.transacao_status === 'ESTORNADA' && t.transacao_tipo !== 'ESTORNO' && !feitos.has(String(t.transacao_id)));
  const aprovadas = todas.filter((t) => t.transacao_status === 'APROVADA' && t.transacao_tipo !== 'ESTORNO');
  const { indices, ambiguos, semLinha } = acharNaBase(lista, estornadas, aprovadas);
  if (indices.length) {
    const itens = itensExclusao(lista, indices);
    const j = await api('POST', '/api/sync/base-copia/automaticas', { quem: 'Estorno TruckPag (automático)', itens });
    log(`Estornos TruckPag: ${indices.length} abastecimento(s) estornado(s) na TruckPag excluído(s) da Base_copia (` +
      indices.map((i) => lista.dic.placa[lista.col.placa[i]] + ' linha ' + lista.col.linha[i]).join(', ') + `; ${j.inseridos} item(ns) na fila do Editar abastecimentos).`);
  }
  for (const t of ambiguos) log(`Estornos TruckPag: ${t.veiculo_placa} ${t.transacao_data} ${t.litragem} L estornado, mas há mais de uma linha igual na Base_copia; confira no Editar abastecimentos.`);
  // processadas: as excluídas, as ambíguas (já avisadas) e as sem linha com mais de 2 dias e meio (nunca entraram: o D-1
  // não manda estornada); as sem linha mais novas são conferidas de novo na próxima volta
  const velha = (t) => Date.now() - (serial(t.transacao_data) - 25569) * 864e5 > 2.5 * 864e5;
  const novos = estornadas.filter((t) => !semLinha.includes(t) || velha(t)).map((t) => String(t.transacao_id));
  const naJanela = new Set(todas.map((t) => String(t.transacao_id)));   // guarda só os ids que ainda estão na janela
  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify({ ultima: Date.now(), processados: [...est.processados.map(String).filter((x) => naJanela.has(x)), ...novos] }));
}
