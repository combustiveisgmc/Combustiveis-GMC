// Área do motorista (/motorista/): os abastecimentos de cada motorista, separados por nome, para o site entregar a cada um
// só os dele (nunca a base inteira). Chamado pelo vigia (sincronizar.mjs) depois de publicar a Base.
// KV: "painel-motoristas:<0..31>" = {geradoEm, motoristas: {NOME_NORMALIZADO: [[dia, seg, placa, combustivel, posto,
// cidade, litros, km, hodometro, abastecimento(1/0)], ...]}} (o motorista cai num dos 32 grupos pelo nome) e
// "painel-veiculos" = veículos da aba Metas (categoria, modelo, meta), para a média contra a meta.
import fs from 'fs';
import path from 'path';

export const GRUPOS = 32;
export const MESES = 13;   // o motorista vê o mês atual e os 12 anteriores
// mesmo critério do chaveNome (public/gestao/lib/dados.js) e do functions/api/motorista
export const chaveNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export function grupoDe(chave) {   // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) { h ^= chave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % GRUPOS;
}

// .dados/abastecimentos.json -> arquivo para "wrangler kv bulk put" ([{key, value}]); devolve {arquivo, motoristas, linhas}
export function gerar(arqDados, saida) {
  const d = JSON.parse(fs.readFileSync(arqDados, 'utf8'));
  const { dic, col } = d;
  let max = -Infinity;
  for (const x of col.data) if (x > max) max = x;
  const dt = new Date(max * 864e5);
  const desde = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() - (MESES - 1), 1) / 864e5);
  const fora = new Set(d.foraAbastecimento || []);
  const grupos = Array.from({ length: GRUPOS }, () => ({}));
  let n = 0;
  for (let i = 0; i < d.linhas; i++) {
    if (col.data[i] < desde) continue;
    const nome = dic.motorista[col.motorista[i]];
    const k = chaveNome(nome);
    if (!k) continue;
    const g = grupos[grupoDe(k)];
    (g[k] || (g[k] = [])).push([col.data[i], col.seg ? col.seg[i] : null, dic.placa[col.placa[i]], dic.combustivel[col.combustivel[i]],
      dic.fornecedor[col.fornecedor[i]], dic.cidade[col.cidade[i]], col.litros[i] || 0, col.km[i] || 0, col.hodometro[i], fora.has(i) ? 0 : 1]);
    n++;
  }
  const geradoEm = d.geradoEm;
  const veiculos = Object.fromEntries(Object.entries(d.veiculos || {}).map(([p, v]) => [p, { categoria: v.categoria, modelo: v.modelo, meta: v.meta }]));
  const itens = grupos.map((motoristas, i) => ({ key: 'painel-motoristas:' + i, value: JSON.stringify({ geradoEm, motoristas }) }));
  itens.push({ key: 'painel-veiculos', value: JSON.stringify({ geradoEm, veiculos }) });
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, JSON.stringify(itens));
  return { arquivo: saida, motoristas: grupos.reduce((s, g) => s + Object.keys(g).length, 0), linhas: n };
}