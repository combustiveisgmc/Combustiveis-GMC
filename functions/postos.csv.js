// /postos.csv — lista dos motoristas. Vem do Workers KV (publicada pelo vigia a partir da planilha de
// negociações); enquanto não houver nada lá, cai no arquivo estático public/postos.csv.
export async function onRequestGet({ env, next }) {
  const csv = await env.DADOS.get('postos');
  if (!csv) return next();
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
