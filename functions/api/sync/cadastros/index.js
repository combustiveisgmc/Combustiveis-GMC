import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia publica aqui a lista de placas e motoristas lida da planilha CONTROLES\Controle_motoristas_e_placas.xlsx.
export async function onRequestPut({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const texto = await request.text();
  if (texto.length > 3_000_000) return json({ erro: 'Lista grande demais.' }, 413);
  let d;
  try { d = JSON.parse(texto.replace(/^﻿/, '')); } catch { return json({ erro: 'JSON inválido.' }, 400); }
  if (!Array.isArray(d.placas) || !Array.isArray(d.motoristas) || !d.placas.length || !d.motoristas.length) {
    return json({ erro: 'Formato inesperado (placas e motoristas).' }, 400);
  }
  const conteudo = { atualizadoEm: new Date().toISOString(), placas: d.placas, motoristas: d.motoristas };
  await env.DADOS.put('cadastros', JSON.stringify(conteudo));
  return json({ ok: true, placas: d.placas.length, motoristas: d.motoristas.length });
}
