// Banco Supabase (modelo `gestao`, docs/BANCO.md) visto pelas Functions da Cloudflare (17/11/2026: começo da troca das
// planilhas pelo banco). Chama as funções do banco (public.gestao_*) pela API REST do Supabase com a chave secreta, que fica
// só nos segredos do Pages (SUPABASE_URL e SUPABASE_KEY; nunca no código nem no navegador).
// Sem os segredos, ou se o banco não responder no tempo, devolve null e quem chamou usa a lista publicada pela planilha.

export const temBanco = (env) => !!(env && env.SUPABASE_URL && env.SUPABASE_KEY);

// a resposta como texto, sem transformar (arquivos grandes que só passam adiante, como os dados dos painéis); null se falhar
export async function rpcTexto(env, funcao, args = {}, { ms = 20000, fetchFn = fetch } = {}) {
  if (!temBanco(env)) return null;
  if (!/^gestao_[a-z_]+$/.test(funcao)) throw new Error('função do banco inválida: ' + funcao);
  try {
    const r = await fetchFn(String(env.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/rpc/' + funcao, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) { console.error('Supabase ' + funcao + ': HTTP ' + r.status); return null; }
    return await r.text();
  } catch (e) {
    console.error('Supabase ' + funcao + ': ' + (e && e.message));
    return null;
  }
}

export async function rpc(env, funcao, args = {}, { ms = 6000, fetchFn = fetch } = {}) {
  if (!temBanco(env)) return null;
  if (!/^gestao_[a-z_]+$/.test(funcao)) throw new Error('função do banco inválida: ' + funcao);
  try {
    const r = await fetchFn(String(env.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/rpc/' + funcao, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) {
      console.error('Supabase ' + funcao + ': HTTP ' + r.status);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('Supabase ' + funcao + ': ' + (e && e.message));
    return null;
  }
}
