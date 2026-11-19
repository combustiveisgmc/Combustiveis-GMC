// Integração com as APIs dos cartões frota (Ticket Log e TruckPag) no vigia: mostra as transações no site na hora (tempo real) e
// grava o dia anterior na Base_copia (D-1). As regras ficam em lib/nuvem/cartoes.js (passo 4 da migração, 19/11/2026: as mesmas
// que a nuvem usa); aqui só o encaixe com este computador: arquivos em .dados/cartoes-api, KV pelo wrangler e as credenciais.
// Credenciais só neste computador: %LOCALAPPDATA%\GestaoCombustivel\apis-cartoes.json (fora do ownCloud), no formato
//   {"ticket": {"host", "basic", "clientes": [245364, ...]}, "truckpag": {"hosts": ["https://api.prd.truckpag.com.br"], "token"}}
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as L from '../lib/nuvem/cartoes.js';

export const { CORE, eventoTicket, eventoTruckpag, completarDoHistorico, chaveTransacao, semCpf } = L;
const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARQ_CONFIG = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'apis-cartoes.json');
export const temConfig = () => fs.existsSync(ARQ_CONFIG);
const config = () => JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8'));
export const buscarTicket = (dia) => L.buscarTicket(config().ticket, dia);
export const buscarTruckpag = (dia) => L.buscarTruckpag(config().truckpag, dia);

const CACHE = path.join(PROJETO, '.dados', 'cartoes-api');
export const HISTORICO = path.join(CACHE, 'historico.json');     // cópia do histórico do Consolidador (Base + Base_copia)
const GERADO_BASE = path.join(PROJETO, '.dados', 'abastecimentos.json');   // dados dos painéis (só a Base.xlsx)
const TEMPO_REAL = path.join(CACHE, 'tempo-real.json');
const TARDIOS = path.join(CACHE, 'tardios.json');   // ids que apareceram depois de o dia fechar (podem ir ao D-1 mesmo antes de INICIO_D1)
const p2 = (x) => String(x).padStart(2, '0');
const diaLocal = (ms = Date.now()) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const arquivo = (nome) => (nome.startsWith('dia:') ? path.join(CACHE, nome.slice(4) + '.json')
  : { tardios: TARDIOS, 'ja-na-base': path.join(CACHE, 'ja-na-base.json') }[nome]);

// chaves (placa|minuto|litros) dos abastecimentos que os painéis já têm (Base.xlsx), e o último dia deles — só sem o banco
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

const memoria = new Map();   // assinatura do tempo real já enviado (em memória, como sempre foi: o vigia reenvia ao reiniciar)
// Uma volta: api(metodo, rota, corpo) = chamada autenticada ao site; kvPut(chave, arquivo) = envio ao KV; log(msg);
// chavesBanco(desde) = chaves do banco para o tempo real; gerarHistorico() = refaz o histórico da Base.
export async function processar({ api, kvPut, log, gerarHistorico, chavesBanco }) {
  if (!temConfig()) return;
  return L.processar({
    log, api, buscarTicket, buscarTruckpag, chavesBanco,
    chavesBase: async () => chavesDaBase(),
    async ler(nome, padrao) {
      if (nome === 'assinatura-tempo-real') return memoria.has(nome) ? memoria.get(nome) : padrao;
      return lerJson(arquivo(nome), padrao);
    },
    async gravar(nome, valor) {
      if (nome === 'assinatura-tempo-real') { memoria.set(nome, valor); return; }
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(arquivo(nome), JSON.stringify(valor));
    },
    async publicar(chave, objeto) {
      const arq = chave === 'tempo-real' ? TEMPO_REAL : path.join(CACHE, chave + '.json');
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(arq, JSON.stringify(objeto));
      kvPut(chave, arq);
    },
    async historico() {
      if (!fs.existsSync(HISTORICO)) { log('APIs dos cartões: gerando o histórico da Base para o primeiro uso…'); gerarHistorico(); }
      return lerJson(HISTORICO, null);
    },
    async rateio({ eventos, aliasExtras }) {
      return (await import('./bomba_rateio.mjs')).preparar({ api, kvPut, log, eventos, aliasExtras });
    },
    agora: () => Date.now(), diaLocal, horaLocal: () => new Date().getHours(), msLocal: (s) => new Date(s).getTime(),
  });
}
