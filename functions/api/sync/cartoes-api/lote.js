import { tokenSyncValido, json } from '../../../../lib/auth.js';
import { aplicarDepois } from '../../../../lib/aplicar-banco.js';

// O vigia manda aqui as transações de um dia das APIs dos cartões (Ticket Log e TruckPag), já montadas com o motor do
// Consolidador: viram um lote como os da tela do Consolidador e o próprio vigia grava na Base_copia (processarConsolidador).
// POST {dia: 'AAAA-MM-DD', linhas: [[fonte, ...48 colunas]], chaves: [[placa§hodômetro§combustível, serial]], ids: ['ticket:123', ...],
//       resumo: {n_ticket, n_truckpag, avisos...}}
export async function onRequestPost({ request, env, waitUntil }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const linhas = Array.isArray(d.linhas) ? d.linhas : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.dia || '')) || !linhas.length || linhas.length > 3000 ||
      !linhas.every((l) => Array.isArray(l) && l.length === 49 && ['TICKET', 'TRUCKPAG'].includes(l[0]))) {
    return json({ erro: 'Lote fora do formato.' }, 400);
  }
  const ids = (Array.isArray(d.ids) ? d.ids : []).map(String).slice(0, 3000);
  const chaves = Array.isArray(d.chaves) ? d.chaves : [];
  const r = d.resumo && typeof d.resumo === 'object' ? d.resumo : {};
  const resumo = { ...r, origem: 'api', dia: d.dia, ids, total: linhas.length, arquivos: ['API ' + d.dia] };
  // o lote precisa de um usuário: o primeiro administrador ativo; o nome mostra que veio da integração
  const adm = await env.DB.prepare("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND excluido = 0 ORDER BY id LIMIT 1").first();
  if (!adm) return json({ erro: 'Nenhum administrador ativo para registrar o lote.' }, 500);
  const lote = await env.DB.prepare(
    'INSERT INTO consolidador_lotes (usuario_id, usuario_nome, resumo, linhas, chaves) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(adm.id, 'Integração Ticket/TruckPag (API)', JSON.stringify(resumo), JSON.stringify(linhas), JSON.stringify(chaves)).first();
  aplicarDepois({ env, waitUntil });   // aplica também direto no banco (15.2 passo 3)
  return json({ ok: true, id: lote.id }, 201);
}