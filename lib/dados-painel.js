// Dados dos painéis vindos do banco (migração 100% nuvem, etapa 15.2 passo 1, 19/11/2026).
// O banco monta a parte dos abastecimentos (public.dados_painel, refeita pelo pg_cron: migração 20261119100000_gestao_dados_painel.sql)
// e o vigia manda à parte o que ainda vem das planilhas (KV "abastecimentos-extras": negociações, coordenadas, orçamento). Aqui as
// duas viram o mesmo /gestao/dados/abastecimentos.json de antes, guardado no KV por versão (o banco só é lido quando muda).
// Liga/desliga sem publicar o site: KV "abastecimentos-fonte" = "banco" (qualquer outro valor ou vazio = planilha, como antes).
import { rpc, rpcTexto, temBanco } from './supabase.js';

// junta dois objetos JSON em texto sem transformar (5 MB): {..a..} + {..b..} -> {..a.., ..b..}. Chaves de b não podem repetir as de a.
export function juntarJson(a, b) {
  const ta = String(a || '').trim(), tb = String(b || '').trim();
  if (!ta.startsWith('{') || !ta.endsWith('}') || !tb.startsWith('{') || !tb.endsWith('}')) throw new Error('JSON inválido para juntar');
  const corpoB = tb.slice(1, -1).trim();
  return corpoB ? ta.slice(0, -1) + ',' + corpoB + '}' : ta;
}

export async function fonteBanco(env) {
  if (!temBanco(env)) return false;
  return (await env.DADOS.get('abastecimentos-fonte')) === 'banco';
}

// {etag, corpo (stream ou texto)} ou null (sem dados do banco: quem chamou usa o arquivo das planilhas)
export async function abastecimentosDoBanco(env) {
  const [v, extrasInfo] = await Promise.all([rpc(env, 'gestao_dados_painel_versao', {}, { ms: 8000 }), env.DADOS.get('versao', 'json')]);
  if (!v || !v.versao) return null;
  const etag = '"b' + v.versao + '-' + ((extrasInfo && extrasInfo.versao) || '0') + '"';
  const guardado = await env.DADOS.getWithMetadata('abastecimentos-nuvem', 'stream');
  if (guardado && guardado.value && guardado.metadata && guardado.metadata.etag === etag) return { etag, corpo: guardado.value };
  if (guardado && guardado.value && guardado.value.cancel) guardado.value.cancel();
  const [base, extras] = await Promise.all([rpcTexto(env, 'gestao_dados_painel', {}, { ms: 25000 }), env.DADOS.get('abastecimentos-extras')]);
  if (!base || !extras) return null;
  const corpo = juntarJson(base, extras);
  await env.DADOS.put('abastecimentos-nuvem', corpo, { metadata: { etag } });
  return { etag, corpo };
}
