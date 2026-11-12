import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia publica aqui a lista da aba CARTÕES da planilha CONTROLES\CONTROLE CARTÕES FROTA.xlsx (chave "cartoes" do KV).
export async function onRequestPut({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const texto = await request.text();
  if (texto.length > 1_000_000) return json({ erro: 'Lista grande demais.' }, 413);
  let d;
  try { d = JSON.parse(texto.replace(/^﻿/, '')); } catch { return json({ erro: 'JSON inválido.' }, 400); }
  if (!Array.isArray(d.cartoes) || !d.cartoes.length) return json({ erro: 'Formato inesperado (cartoes).' }, 400);
  await env.DADOS.put('cartoes', JSON.stringify({ atualizadoEm: new Date().toISOString(), cartoes: d.cartoes }));
  return json({ ok: true, cartoes: d.cartoes.length });
}
