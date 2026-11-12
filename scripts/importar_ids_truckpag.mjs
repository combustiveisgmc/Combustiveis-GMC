// Importa o ID TruckPag dos motoristas a partir da exportação "Motoristas.csv" do portal da TruckPag (colunas ID;Nome;CPF;...).
// Liga pelo CPF aos motoristas do cadastro (chave "cadastros" do KV) e põe na fila do Cadastro > Motoristas só quem está com
// o ID TRUCKPAG vazio; o vigia grava na planilha. Só o ID é importado (as datas de nascimento da exportação têm muitos
// valores de preenchimento, como 02/02/2002 e datas seguidas de 1995).
//   node scripts/importar_ids_truckpag.mjs "<arquivo.csv>" [--enviar]      sem --enviar só mostra o resumo
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(process.env.LOCALAPPDATA || PROJETO, 'GestaoCombustivel');
const SITE = process.env.SITE_URL || 'https://gestao-combustivel.pages.dev';
const [arq] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const enviar = process.argv.includes('--enviar');
const so = (v) => String(v ?? '').replace(/\D/g, '');

const linhas = fs.readFileSync(arq, 'latin1').split(/\r?\n/).filter((l) => l.trim());
const cab = linhas[0].split(';').map((s) => s.trim().toUpperCase());
const iId = cab.indexOf('ID'), iCpf = cab.indexOf('CPF');
if (iId < 0 || iCpf < 0) throw new Error('O arquivo precisa das colunas ID e CPF.');
// datas de nascimento que a TruckPag tem: a edição pelo portal precisa reenviar (fica fora do ownCloud, por hash do CPF)
const iNasc = cab.indexOf('DATA DE NASCIMENTO');
const { hash, DATAS_TRUCKPAG } = await import('./motoristas_cartoes.mjs');
if (iNasc >= 0) {
  const datas = {};
  for (const c of linhas.slice(1).map((l) => l.split(';'))) {
    const m = String(c[iNasc] || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m && so(c[iCpf]).length) datas[hash(so(c[iCpf]).padStart(11, '0'))] = m[3] + '-' + m[2] + '-' + m[1];
  }
  fs.mkdirSync(path.dirname(DATAS_TRUCKPAG), { recursive: true });
  fs.writeFileSync(DATAS_TRUCKPAG, JSON.stringify(datas));
  console.log(Object.keys(datas).length + ' data(s) de nascimento da TruckPag guardadas para as edições.');
}
const truckpag = new Map(linhas.slice(1).map((l) => l.split(';')).map((c) => [so(c[iCpf]).padStart(11, '0'), Number(so(c[iId]))]).filter(([c, id]) => c.length === 11 && id > 0));

const kv = spawnSync('npx', ['--yes', 'wrangler@4', 'kv', 'key', 'get', 'cadastros', '--binding', 'DADOS', '--remote'],
  { cwd: PROJETO, encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true, maxBuffer: 50 * 1024 * 1024 });
if (kv.status !== 0 || !kv.stdout.includes('{')) throw new Error('Não consegui ler o cadastro do site (wrangler kv key get cadastros): ' + String(kv.error || kv.stderr || '').slice(-300));
const cad = JSON.parse(kv.stdout.slice(kv.stdout.indexOf('{')));
const itens = [];
let semNoCadastro = 0, jaTem = 0;
const noCadastro = new Set();
for (const m of cad.motoristas) {
  const cpf = so(m.cpf); noCadastro.add(cpf);
  const id = truckpag.get(cpf);
  if (!id) continue;
  if (m.idTruckpag) { jaTem++; continue; }
  itens.push({ cpf, dados: { idTruckpag: id } });
}
for (const cpf of truckpag.keys()) if (!noCadastro.has(cpf)) semNoCadastro++;
const ativosSem = cad.motoristas.filter((m) => m.situacao !== 'DESLIGADO' && !truckpag.has(so(m.cpf))).length;
console.log(`TruckPag: ${truckpag.size} motoristas | casam com o cadastro: ${itens.length + jaTem} (a preencher ${itens.length}, já com ID ${jaTem}) | ` +
  `na TruckPag e fora do cadastro: ${semNoCadastro} | ativos do cadastro sem ID na TruckPag: ${ativosSem}`);
if (enviar && itens.length) {
  const token = (process.env.SYNC_TOKEN || fs.readFileSync(path.join(PASTA, 'sync-token.txt'), 'utf8')).trim();
  let n = 0;
  for (let i = 0; i < itens.length; i += 300) {
    const r = await fetch(SITE + '/api/sync/cadastros/cartoes', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: itens.slice(i, i + 300) }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'HTTP ' + r.status);
    n += j.inseridos;
  }
  console.log(`${n} ID(s) TruckPag na fila do cadastro; o vigia grava na planilha em seguida.`);
}