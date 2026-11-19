// Bomba interna > Rateio das NFs, parte do vigia (scripts/cartoes_api.mjs chama a cada volta das APIs dos cartões):
//  1) junta os abastecimentos das bombas internas: Base_copia (lista publicada pelo vigia) + transações das APIs que a
//     Base_copia ainda não tem (mesmo minuto e litros = mesmo abastecimento);
//  2) publica no KV ("bomba-rateio") a lista de cada tanque para a página (validação e rateio de cada nota);
//  3) nos tanques com início do rateio definido, calcula o rateio (public/gestao/lib/rateio.js, a mesma conta da página)
//     e corrige o VL/LITRO e o VALOR EMISSAO para o preço da nota (e a INFORMAÇÃO ADICIONAL 3 corrigida na validação):
//     na Base_copia pela fila do Editar abastecimentos; nas linhas do D-1 e do tempo real pelo ajustar().
// As regras ficam em lib/nuvem/rateio-bomba.js (passo 4 da migração, 19/11/2026: as mesmas da nuvem); aqui só os arquivos.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { preparar as prepararRegras } from '../lib/nuvem/rateio-bomba.js';

export { chave, precoFechado, travas, mesmoAbastecimento } from '../lib/nuvem/rateio-bomba.js';
const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(PROJETO, '.dados', 'cartoes-api');
const LISTA = path.join(PASTA, 'base-copia.json');             // lista da Base_copia (sincronizar.mjs deixa aqui)
const SAIDA = path.join(PASTA, 'bomba-rateio.json');           // o que vai para o KV
const ENVIADOS = path.join(PASTA, 'rateio-enviados.json');     // correções já pedidas para esta versão da lista
const POSTOS_BOMBA = path.join(PASTA, 'postos-bomba.json');     // para o base_copia_lista.py separar as linhas inteiras
const LINHAS_BOMBA = path.join(PASTA, 'base-copia-bomba.json'); // {linha: [40 colunas]} das bombas internas (CSV do rateio)
const ARQ = { 'rateio-enviados': ENVIADOS, 'bomba-rateio': SAIDA };
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const p2 = (x) => String(x).padStart(2, '0');
const diaLocal = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };

export function preparar({ api, kvPut, log, eventos, aliasExtras }) {
  return prepararRegras({
    api, log, agora: () => Date.now(), diaLocal,
    lista: async () => lerJson(LISTA, null),
    // as linhas inteiras da lista publicada; os postos e a data valem na próxima publicação (base_copia_lista.py lê o arquivo)
    async inteiras(pb) {
      const r = lerJson(LINHAS_BOMBA, {});
      if (JSON.stringify(lerJson(POSTOS_BOMBA, null)) !== JSON.stringify(pb)) { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(POSTOS_BOMBA, JSON.stringify(pb)); }
      return r;
    },
    ler: async (nome, padrao) => lerJson(ARQ[nome], padrao),
    async gravar(nome, valor) { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(ARQ[nome], JSON.stringify(valor)); },
    async publicar(chave) { kvPut(chave, ARQ[chave]); },   // o arquivo já foi gravado (gravar 'bomba-rateio')
  }, { eventos, aliasExtras });
}
