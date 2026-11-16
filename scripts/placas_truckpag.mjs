// Cadastro de placas x TruckPag (16/11/2026, pedido do usuário): a unidade da placa no portal vira o centro de custo do
// veículo na TruckPag (PUT /api/integracao-clientes/veiculo/{id} {centro_custo_id}; só esse campo muda).
//  - processar(): chamado pelo vigia (só no computador com as credenciais). Placa editada ou adicionada no Cadastro >
//    Placas com unidade: depois de gravada na planilha, a unidade vai para a TruckPag. Liga com "placasUnidade": true em
//    %LOCALAPPDATA%\GestaoCombustivel\motoristas-cartoes.json; a primeira vez ligado vale só daqui em diante.
//  - linha de comando: `node scripts/placas_truckpag.mjs conferir` lista as placas com centro de custo diferente da
//    unidade do cadastro; `... alinhar [PLACA ...] --gravar` grava (sem --gravar só mostra o que faria).
// Unidade sem centro de custo com o mesmo nome na TruckPag (ex.: VENDA) e placa que não está na TruckPag: só avisa.
// A Ticket não tem (na documentação que temos) como alterar veículo pela API; a Veloe não tem API.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel');
const CONFIG = path.join(PASTA, 'apis-cartoes.json');
const CHAVES = path.join(PASTA, 'motoristas-cartoes.json');
const ESTADO = path.join(PASTA, 'placas-truckpag.json');   // {desde}: última edição processada
const EMPRESA_TRUCKPAG = 25298;
const lerJson = (a, p) => { try { return JSON.parse(fs.readFileSync(a, 'utf8')); } catch { return p; } };
const chave = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const soPlaca = (s) => chave(s).replace(/[^A-Z0-9]/g, '');

function truckpag() {
  const c = lerJson(CONFIG, {}).truckpag;
  const host = c.hosts.find((h) => /prd/.test(h)) || c.hosts[0];
  const req = async (metodo, p, corpo) => {
    const r = await fetch(host + p, { method: metodo, signal: AbortSignal.timeout(60_000),
      headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  const lista = (j) => (Array.isArray(j) ? j : (j && j.data) || []);
  return {
    async centros() {
      const { status, j } = await req('GET', '/api/integracao-clientes/veiculo/centro-de-custo?empresa_id=' + EMPRESA_TRUCKPAG);
      if (status !== 200) throw new Error('TruckPag: centros de custo HTTP ' + status);
      return new Map(lista(j).map((x) => [chave(x.nome), { id: x.id ?? x.centro_de_custo_id, nome: x.nome }]));
    },
    async veiculos() {
      const { status, j } = await req('GET', '/api/integracao-clientes/veiculo');
      if (status !== 200) throw new Error('TruckPag: veículos HTTP ' + status);
      return new Map(lista(j).map((v) => [soPlaca(v.placa), v]));
    },
    async trocarCentro(veiculoId, centroId) {
      const { status, j } = await req('PUT', '/api/integracao-clientes/veiculo/' + veiculoId, { centro_custo_id: centroId });
      const v = j && (j.data || j);
      if (status >= 200 && status < 300 && v && v.centro_de_custo_id === centroId) return { ok: true };
      const erros = j && j.errors ? Object.values(j.errors).flat().join(' ') : (j && j.message) || 'HTTP ' + status;
      return { ok: false, erro: String(erros).slice(0, 250) };
    },
  };
}

// uma placa: unidade do cadastro -> centro de custo da TruckPag
async function aplicar(T, centros, veiculos, placa, unidade, gravar) {
  const v = veiculos.get(soPlaca(placa)), cc = centros.get(chave(unidade));
  if (!v) return { placa, msg: 'não está na TruckPag', pulou: true };
  if (!cc) return { placa, msg: `a unidade ${unidade} não existe como centro de custo na TruckPag`, pulou: true };
  if (v.centro_de_custo_id === cc.id) return { placa, msg: 'já está com ' + cc.nome, igual: true };
  const de = v.centro_de_custo_nome || '(vazio)';
  if (!gravar) return { placa, msg: `${de} -> ${cc.nome} (não gravado)` };
  const r = await T.trocarCentro(v.veiculo_id, cc.id);
  if (r.ok) { v.centro_de_custo_id = cc.id; v.centro_de_custo_nome = cc.nome; }
  return { placa, ok: r.ok, msg: r.ok ? `${de} -> ${cc.nome}` : 'TruckPag não aceitou: ' + r.erro };
}

// ---------- vigia ----------
export async function processar({ api, log }) {
  const chaves = lerJson(CHAVES, {});
  if (!fs.existsSync(CONFIG) || !chaves.placasUnidade) return;
  const est = lerJson(ESTADO, {});
  if (!est.desde) {   // primeira vez ligado: vale só para edições daqui em diante
    fs.writeFileSync(ESTADO, JSON.stringify({ desde: new Date().toISOString().slice(0, 19) + 'Z' }));
    return;
  }
  const { edicoes } = await api('GET', '/api/sync/cadastros/editados-placas?desde=' + encodeURIComponent(est.desde));
  const comUnidade = edicoes.filter((e) => e.dados && e.dados.unidade);
  if (comUnidade.length) {
    const T = truckpag();
    const [centros, veiculos] = await Promise.all([T.centros(), T.veiculos()]);
    for (const e of comUnidade) {
      const r = await aplicar(T, centros, veiculos, e.dados.placa || e.chave, e.dados.unidade, true);
      if (!r.igual) log(`Placas x TruckPag: ${r.placa}: ${r.msg}.`);
    }
  }
  if (edicoes.length) {   // processadas (deram certo ou não): não repete
    est.desde = edicoes[edicoes.length - 1].aplicada_em;
    fs.writeFileSync(ESTADO, JSON.stringify(est));
  }
}

// ---------- linha de comando: conferir / alinhar ----------
function placasDoCadastro() {
  const r = spawnSync('py', ['scripts/planilha_cadastros.py', 'gerar'], { cwd: PROJETO, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 5 * 60 * 1000 });
  const arq = path.join(PROJETO, '.dados', 'cadastros.json');
  try {
    if (r.status !== 0) throw new Error('planilha_cadastros.py gerar falhou');
    return JSON.parse(fs.readFileSync(arq, 'utf8')).placas || [];
  } finally { try { fs.unlinkSync(arq); } catch {} }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [cmd, ...resto] = process.argv.slice(2);
  const gravar = resto.includes('--gravar'), so = new Set(resto.filter((x) => !x.startsWith('--')).map(soPlaca));
  if (!['conferir', 'alinhar'].includes(cmd)) { console.log('Uso: node scripts/placas_truckpag.mjs conferir | alinhar [PLACA ...] [--gravar]'); process.exit(1); }
  const T = truckpag();
  const [centros, veiculos] = await Promise.all([T.centros(), T.veiculos()]);
  const placas = placasDoCadastro().filter((p) => !so.size || so.has(soPlaca(p.placa)));
  let n = 0;
  for (const p of placas) {
    const r = await aplicar(T, centros, veiculos, p.placa, p.unidade, cmd === 'alinhar' && gravar);
    if (r.igual || (r.pulou && r.msg === 'não está na TruckPag')) continue;
    n++;
    console.log(`${r.placa} (${p.unidade}): ${r.msg}`);
  }
  console.log(n + ' placa(s) ' + (cmd === 'alinhar' && gravar ? 'processada(s).' : 'diferente(s).'));
}
