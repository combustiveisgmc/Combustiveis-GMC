import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia manda aqui o que as APIs dos cartões devolveram para os motoristas do cadastro (código e dados da Ticket, ID da
// TruckPag): entra na mesma fila do Cadastro > Motoristas (alteracoes_cadastros) e o vigia grava na planilha.
// POST {itens: [{cpf, dados: {codigoTicket?, matricula?, cnh?, cnhCategoria?, cnhValidade?, idTruckpag?}}]}
const CAMPOS = { codigoTicket: 'n', idTruckpag: 'n', matricula: 'n', cnh: 't', cnhCategoria: 't', cnhValidade: 'd' };
const ok = (k, v) => (CAMPOS[k] === 'n' ? Number.isInteger(v) && v > 0 && v < 1e12 : CAMPOS[k] === 'd' ? /^\d{2}\/\d{2}\/\d{4}$/.test(v)
  : typeof v === 'string' && v.length > 0 && v.length <= 20);

export async function onRequestPost({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 300).map((it) => ({
    cpf: String(it.cpf || '').replace(/\D/g, ''),
    dados: Object.fromEntries(Object.entries(it.dados || {}).filter(([k, v]) => k in CAMPOS && ok(k, v))),
  })).filter((it) => it.cpf.length === 11 && Object.keys(it.dados).length);
  if (!itens.length) return json({ ok: true, inseridos: 0 });
  const adm = await env.DB.prepare("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND excluido = 0 ORDER BY id LIMIT 1").first();
  if (!adm) return json({ erro: 'Nenhum administrador ativo para registrar a alteração.' }, 500);
  const fmt = (c) => c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9);
  await env.DB.batch(itens.map((it) => env.DB.prepare(
    `INSERT INTO alteracoes_cadastros (usuario_id, usuario_nome, tipo, acao, chave, dados, antes) VALUES (?, ?, 'motoristas', 'editar', ?, ?, '{}')`)
    .bind(adm.id, 'APIs dos cartões (automático)', fmt(it.cpf), JSON.stringify(it.dados))));
  return json({ ok: true, inseridos: itens.length });
}