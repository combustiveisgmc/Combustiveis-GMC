// APIs dos cartões na nuvem (passo 4, 19/11/2026; pedido do usuário "Pode começar"): tempo real, D-1 e Rateio das NFs com as
// mesmas regras do vigia (lib/nuvem/cartoes.js e lib/nuvem/rateio-bomba.js, copiados para _shared). Encaixe da nuvem:
//  - estado (leitura de cada dia das APIs, atrasados, já na base, correções enviadas) em public.nuvem_cache ('cartoes-api:...');
//  - histórico do Consolidador e lista da Base_copia do banco (gestao_dados_gerados), linhas das bombas por gestao_linhas_bomba;
//  - tempo real e lista do rateio publicados pelo portal (/api/sync/kv), lotes do D-1 e correções do rateio pelas rotas de sempre;
//  - modo 'simular': nada sai daqui (lotes, correções e publicações só ficam anotados na execução, para comparar com o vigia).
import { rotina, rpc, gerado, portal, env, diaLocal, horaLocal } from '../_shared/nuvem.ts';
import { processar, buscarTicket, buscarTruckpag } from '../_shared/cartoes.js';
import { preparar } from '../_shared/rateio-bomba.js';

const P = 'cartoes-api:';
async function resumoHash(o: unknown) {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(JSON.stringify(o)));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

rotina('cartoes-api', async ({ modo }) => {
  const ligado = modo === 'ligado';
  const cache: Record<string, unknown> = (await rpc('gestao_nuvem_cache_ler', { p_prefixo: P }, 60000)) || {};
  // deno-lint-ignore no-explicit-any
  const enviados: any[] = [], publicados: any[] = [], logs: string[] = [];
  const ler = async (nome: string, padrao: unknown) => (nome in cache ? cache[nome] : padrao);
  const gravar = async (nome: string, valor: unknown) => {
    cache[nome] = valor;
    await rpc('gestao_nuvem_cache_gravar', { p_nome: P + nome, p_valor: valor }, 60000);
  };
  // deno-lint-ignore no-explicit-any
  const anotar = (rota: string, corpo: any, j: any) => (rota.endsWith('/lote')
    ? { rota, dia: corpo.dia, linhas: corpo.linhas.length, ids: corpo.ids, id: j?.id ?? null }
    : { rota, itens: (corpo.itens || []).length, amostra: (corpo.itens || []).slice(0, 3), inseridos: j?.inseridos ?? null });
  // deno-lint-ignore no-explicit-any
  const api = async (metodo: string, rota: string, corpo?: any) => {
    if (metodo === 'GET') return portal(metodo, rota);
    if (ligado) { const j = await portal(metodo, rota, corpo); enviados.push(anotar(rota, corpo, j)); return j; }
    enviados.push(anotar(rota, corpo, null));
    return { id: 'simulado', inseridos: (corpo.itens || corpo.linhas || []).length };
  };
  // deno-lint-ignore no-explicit-any
  const publicar = async (chave: string, valor: any) => {
    publicados.push({ chave, linhas: valor.linhas ?? null, hash: chave === 'tempo-real' ? await resumoHash([valor.col, valor.dic]) : null });
    if (ligado) await portal('POST', '/api/sync/kv', { chave, valor });
    else await gravar('simulado:' + chave, valor);   // para comparar com o que o vigia publicou
  };
  const cfgT = { host: env('TICKET_HOST'), basic: env('TICKET_BASIC'), clientes: JSON.parse(env('TICKET_CLIENTES') || '[]') };
  const cfgP = { hosts: [env('TRUCKPAG_HOST')], token: env('TRUCKPAG_TOKEN') };
  const comum = {
    api, ler, gravar, publicar, log: (m: string) => logs.push(m),
    agora: () => Date.now(), diaLocal, horaLocal: () => horaLocal(), msLocal: (s: string) => Date.parse(s + '-03:00'),
  };
  const r = await processar({
    ...comum,
    buscarTicket: (dia: string) => buscarTicket(cfgT, dia), buscarTruckpag: (dia: string) => buscarTruckpag(cfgP, dia),
    historico: () => gerado('consolidacao'),
    chavesBanco: (desde: string) => rpc('gestao_chaves_tempo_real', { p_desde: desde }, 30000),
    // deno-lint-ignore no-explicit-any
    rateio: ({ eventos, aliasExtras }: any) => preparar({
      ...comum, lista: () => gerado('base-copia'),
      // deno-lint-ignore no-explicit-any
      inteiras: (pb: any) => rpc('gestao_linhas_bomba', { p_postos: pb.postos, p_desde: pb.desde }, 30000),
    }, { eventos, aliasExtras }),
    maxBuscas: 6,   // dias lidos das APIs por volta (tempo limitado da função); os demais ficam com a leitura anterior
  });
  return { resultado: { ...r, enviados, publicados, logs } };
});
