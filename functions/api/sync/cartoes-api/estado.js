import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia busca aqui o que precisa para gravar as transações das APIs dos cartões (Ticket Log e TruckPag) na Base_copia:
//   postos: decisões do Consolidador sobre postos (relacionar, posto novo, deixar em branco), as mesmas da tela;
//   ids:    transações das APIs já mandadas em lotes (não manda de novo, mesmo que o hodômetro tenha sido corrigido depois);
//   chaves: placa§hodômetro§combustível dos lotes dos últimos 60 dias (o histórico pode ainda não trazer os mais novos).
export async function onRequestGet({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const [postos, lotes] = await Promise.all([
    env.DB.prepare('SELECT nome, decisao, canonico, endereco, cidade, uf FROM consolidador_postos').all(),
    env.DB.prepare(`SELECT resumo, chaves FROM consolidador_lotes
      WHERE estado <> 'erro' AND criado_em >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 days')`).all(),
  ]);
  const ids = [], chaves = [];
  for (const l of lotes.results) {
    let r = {};
    try { r = JSON.parse(l.resumo); } catch {}
    if (r.origem === 'api' && Array.isArray(r.ids)) ids.push(...r.ids);
    try { for (const c of JSON.parse(l.chaves)) chaves.push(c); } catch {}
  }
  return json({ postos: postos.results, ids, chaves });
}