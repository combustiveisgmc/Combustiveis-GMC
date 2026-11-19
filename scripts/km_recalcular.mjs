// Recálculo do KM rodado do abastecimento SEGUINTE quando um abastecimento entra no meio da cadeia da placa.
// Caso: o abastecimento da API de hoje já foi gravado na Base_copia (D-1) com o km contado a partir do último que o vigia
// conhecia; depois o usuário lança pelo Consolidador um abastecimento de outro cartão feito antes dele. O lançado entra
// com o km certo, mas o seguinte continuava contando o mesmo trecho (km em dobro, ou negativo se a ordem inverter).
//  1) anotar(linhas): o vigia chama quando um lote do Consolidador (manual ou D-1 da API) é gravado na Base_copia;
//     guarda placa, data, hodômetro e combustível de cada linha em .dados/km-recalcular.json.
//  2) recalcular({api, log}): depois que a lista da Base_copia é publicada (já com as linhas novas), acha na mesma placa e
//     na mesma cadeia de combustível (diesel junto, arla à parte, como no Consolidador) o abastecimento seguinte e, se o
//     km dele ainda for o antigo (hodômetro dele − hodômetro do anterior ao inserido), cria a correção de KM rodado e
//     km/L na fila da página Editar abastecimentos ("Recálculo do KM (automático)"); o vigia grava na rodada seguinte.
//     Km já mexido à mão (diferente do antigo) não é tocado. Só a Base_copia muda (a Base.xlsx nunca).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { itensExclusao, cadeia, placaK } from '../lib/nuvem/estornos.js';
export { itensExclusao };

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PENDENTES = path.join(PROJETO, '.dados', 'km-recalcular.json');
const LISTA = path.join(PROJETO, '.dados', 'cartoes-api', 'base-copia.json');   // lista da Base_copia (base_copia_lista.py)
const VALIDADE = 3 * 864e5;            // linha anotada que não aparece na lista em 3 dias é esquecida
const MINUTO = 1 / 1440;               // datas em número serial do Excel (dias)
// colunas buildRow (48) da linha do lote, depois da fonte: data E (4), placa F (5), combustível N (13), hodômetro Q (16)
const IDX = { data: 4, placa: 5, fuel: 13, hodo: 16 };

const lerJson = (a, p) => { try { return JSON.parse(fs.readFileSync(a, 'utf8')); } catch { return p; } };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function anotar(linhas) {
  const novos = [];
  for (const l of linhas || []) {
    const r = l.slice(1);   // sem a fonte
    const dt = num(r[IDX.data]), hodo = num(r[IDX.hodo]), placa = placaK(r[IDX.placa]);
    if (dt === null || hodo === null || !placa) continue;
    novos.push({ placa, dt, hodo, fuel: cadeia(r[IDX.fuel]), em: Date.now() });
  }
  if (!novos.length) return;
  fs.mkdirSync(path.dirname(PENDENTES), { recursive: true });
  fs.writeFileSync(PENDENTES, JSON.stringify(lerJson(PENDENTES, []).concat(novos)));
}

export async function recalcular({ api, log }) {
  const pend = lerJson(PENDENTES, []);
  if (!pend.length) return;
  const lista = lerJson(LISTA, null);
  if (!lista || !lista.col) return;
  const geradoEm = Date.parse(lista.geradoEm || '') || 0;
  const { col, dic } = lista;
  // cadeias da Base_copia: placa§combustível -> linhas com hodômetro, em ordem de data
  const cadeias = new Map();
  for (let i = 0; i < col.linha.length; i++) {
    const dt = num(col.dt[i]), hodo = num(col.hodo[i]);
    if (dt === null || hodo === null) continue;
    const k = placaK(dic.placa[col.placa[i]]) + '§' + cadeia(dic.fuel[col.fuel[i]]);
    if (!cadeias.has(k)) cadeias.set(k, []);
    cadeias.get(k).push({ i, dt, hodo });
  }
  for (const c of cadeias.values()) c.sort((a, b) => a.dt - b.dt || a.hodo - b.hodo);

  const itens = [], ficam = [], vistos = new Set();
  for (const p of pend) {
    if (p.em > geradoEm) { if (Date.now() - p.em < VALIDADE) ficam.push(p); continue; }   // a lista ainda não tem a linha
    const c = cadeias.get(p.placa + '§' + p.fuel) || [];
    const pos = c.findIndex((x) => Math.abs(x.dt - p.dt) < MINUTO && Math.abs(x.hodo - p.hodo) < 1);
    if (pos < 0) { if (Date.now() - p.em < VALIDADE) ficam.push(p); continue; }
    const ant = c[pos - 1], seg = c[pos + 1];
    if (!seg || vistos.has(seg.i)) continue;
    const kmAtual = num(col.km[seg.i]), litros = num(col.litros[seg.i]);
    const kmNovo = Math.round((seg.hodo - p.hodo) * 100) / 100;
    if (kmNovo < 0) { log(`Recálculo do KM: ${p.placa} linha ${col.linha[seg.i]} ficaria negativo (hodômetro menor que o do abastecimento inserido); não mexi.`); continue; }
    // só troca o km que ainda é o antigo (contado do anterior ao inserido) ou vazio: correção feita à mão fica como está
    const kmAntigo = ant ? Math.round((seg.hodo - ant.hodo) * 100) / 100 : null;
    if (kmAtual !== null && Math.abs(kmAtual - kmNovo) < 0.5) continue;
    if (kmAtual !== null && (kmAntigo === null || Math.abs(kmAtual - kmAntigo) >= 0.5)) continue;
    vistos.add(seg.i);
    const kml = litros ? Math.round(kmNovo / litros * 10000) / 10000 : null;
    itens.push({ linha: col.linha[seg.i], placa: dic.placa[col.placa[seg.i]], data: seg.dt,
      celulas: { R: kmNovo, S: kml }, antes: { R: kmAtual, S: num(col.kml[seg.i]) } });
  }
  if (itens.length) {
    const j = await api('POST', '/api/sync/base-copia/automaticas', { itens });
    log(`Recálculo do KM: ${j.inseridos} abastecimento(s) seguinte(s) corrigido(s) (km contado a partir do abastecimento inserido): ` +
      itens.slice(0, 5).map((x) => x.placa + ' ' + (x.antes.R ?? 'vazio') + ' → ' + x.celulas.R + ' km').join(', ') + (itens.length > 5 ? '…' : '') + '.');
  }
  fs.writeFileSync(PENDENTES, JSON.stringify(ficam));
}
