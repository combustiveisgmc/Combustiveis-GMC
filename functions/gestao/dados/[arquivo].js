// /gestao/dados/abastecimentos.json e /gestao/dados/anp.json — lidos do Workers KV (binding DADOS), gravados pelo
// sincronizador. O login (e a permissão de abrir os dashboards) já foi conferido pelo _middleware.js de /gestao;
// aqui cada arquivo só vai para quem pode abrir uma tela que usa ele (perms; sem perms = qualquer tela de dashboard).
import { pode } from '../../../lib/permissoes.js';
const ARQUIVOS = {
  'abastecimentos.json': { dados: 'abastecimentos', versao: 'versao', falta: 'Ainda não há dados enviados. Rode a sincronização da Base.' },
  'anp.json': { perms: ['preco-anp', 'contratos-anp'], dados: 'anp', versao: 'anp-versao', falta: 'Os preços da ANP ainda não foram enviados. O computador da sincronização envia na próxima conferência.' },
  // preços da Petrobras às distribuidoras por ponto de entrega (scripts/petrobras_precos.py) para "Preço x Refinaria"
  'petrobras.json': { perms: ['preco-refinaria'], dados: 'petrobras', versao: 'petrobras-versao', falta: 'Os preços da Petrobras ainda não foram enviados. O computador da sincronização envia na próxima conferência.' },
  'reajustes.json': { perms: ['contratos-anp'], dados: 'reajustes', versao: 'reajustes-versao', falta: 'A planilha de reajustes ainda não foi enviada. O computador da sincronização envia em instantes.' },
  // histórico da Base para o Consolidador (Base.xlsx + CONTROLES\Base_copia.xlsx; scripts/consolidador_historico.py)
  'consolidacao.json': { perms: ['consolidador', 'bomba-abastecimento'], dados: 'consolidacao', versao: 'consolidacao-versao', falta: 'O histórico da Base para o consolidador ainda não foi enviado. O computador da sincronização envia em instantes.' },
  // abastecimentos da CONTROLES\Base_copia.xlsx para Operacional > Editar abastecimentos (scripts/base_copia_lista.py)
  'base-copia.json': { perms: ['abastecimentos', 'bomba-abastecimento', 'bomba-estoque'], dados: 'base-copia', versao: 'base-copia-versao', falta: 'A lista da Base_copia ainda não foi enviada. O computador da sincronização envia em instantes.' },
  // transações das APIs dos cartões (Ticket Log e TruckPag) que ainda não estão na Base (scripts/cartoes_api.mjs): os painéis somam na hora
  'tempo-real.json': { dados: 'tempo-real', versao: 'tempo-real-versao', falta: 'Ainda não há transações em tempo real.' },
};

export async function onRequestGet({ request, env, params, data }) {
  const a = ARQUIVOS[params.arquivo];
  if (!a) return new Response('Não encontrado.', { status: 404 });
  if (a.perms && !pode(data.usuario, ...a.perms)) {
    return new Response(JSON.stringify({ erro: 'Seu acesso não inclui estes dados.' }), {
      status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const info = await env.DADOS.get(a.versao, 'json');
  if (!info) {
    return new Response(JSON.stringify({ erro: a.falta }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  const etag = '"' + info.versao + '"';
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  const corpo = await env.DADOS.get(a.dados, 'stream');
  if (!corpo) return new Response('Dados indisponíveis.', { status: 503 });
  return new Response(corpo, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ETag: etag },
  });
}
