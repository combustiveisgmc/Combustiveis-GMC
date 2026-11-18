// Exportar do Editar abastecimentos (18/11/2026): linhas da Base_copia, com todas as colunas, para a planilha que o usuário usa
// para atualizar a Base.xlsx à mão (a planilha em si é montada no navegador: public/gestao/lib/exportar-base.js).
// POST {linhas: [números de linha da Base_copia]} (no máximo LOTE por chamada) -> {linhas: [[A..AN, campanha, linha], ...]}
// Lê public.base_transacoes no Supabase (função gestao_exportar_base). Permissão: "abastecimentos" (Editar abastecimentos).
import { usuarioDaSessao, json } from '../../../lib/auth.js';
import { pode } from '../../../lib/permissoes.js';
import { rpc, temBanco } from '../../../lib/supabase.js';

export const LOTE = 5000;

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
  if (!pode(u, 'abastecimentos')) return json({ erro: 'Seu acesso não inclui o Editar abastecimentos.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const linhas = Array.isArray(d.linhas) ? [...new Set(d.linhas.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (!linhas.length) return json({ erro: 'Nenhum abastecimento para exportar.' }, 400);
  if (linhas.length > LOTE) return json({ erro: 'No máximo ' + LOTE + ' linhas por vez.' }, 400);
  if (!temBanco(env)) return json({ erro: 'O banco de dados não está configurado no portal.' }, 503);
  const r = await rpc(env, 'gestao_exportar_base', { p_linhas: linhas }, { ms: 25000 });
  if (!Array.isArray(r)) return json({ erro: 'O banco de dados não respondeu. Tente de novo em instantes.' }, 502);
  return json({ linhas: r });
}
