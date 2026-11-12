import { tokenSyncValido, json } from '../../../lib/auth.js';

// O vigia publica aqui a lista dos motoristas (CSV no formato do postos.csv), gerada da planilha de negociações.
export async function onRequestPut({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  const csv = (await request.text()).replace(/^﻿/, '');
  if (csv.length > 2_000_000) return json({ erro: 'Lista grande demais.' }, 413);
  const linhas = csv.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!/^Unidade;Posto;Cidade;Status;Cartao;Latitude;Longitude;Aviso/.test(linhas[0] || '') || linhas.length < 2) {
    return json({ erro: 'Formato inesperado da lista de postos.' }, 400);
  }
  await env.DADOS.put('postos', csv);
  await env.DADOS.put('postos-info', JSON.stringify({ atualizadoEm: new Date().toISOString(), postos: linhas.length - 1 }));
  return json({ ok: true, postos: linhas.length - 1 });
}
