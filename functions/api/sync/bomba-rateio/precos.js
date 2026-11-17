import { tokenSyncValido, json } from '../../../../lib/auth.js';

// O vigia manda aqui as correções dos abastecimentos das bombas internas que já estão na Base_copia: preço da nota pelo
// Rateio das NFs e centro de custo corrigido na validação. Entram na mesma fila do Editar abastecimentos
// (alteracoes_base_copia), e o próprio vigia grava.
// POST {itens: [{linha, placa, data, tanque, celulas: {P: vl/litro, T: valor} e/ou {AD: inf. adicional 3}, antes}]}
// Desde 17/11/2026 o vigia só manda o preço quando a nota do abastecimento fechou, uma vez só ("Rateio das NFs (nota fechada)");
// o tanque (diesel/arla) faz o vigia gravar na linha do combustível certo.
export async function onRequestPost({ request, env }) {
  if (!tokenSyncValido(request, env)) return json({ erro: 'Não autorizado.' }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const itens = Array.isArray(d.itens) ? d.itens.slice(0, 300) : [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e7;
  const celulasOk = (c) => {
    if (!c || typeof c !== 'object') return false;
    const cols = Object.keys(c);
    const preco = cols.includes('P') || cols.includes('T');
    return cols.length > 0 && cols.every((k) => ['P', 'T', 'AD'].includes(k)) && (!preco || (num(c.P) && num(c.T))) &&
      (!cols.includes('AD') || (typeof c.AD === 'string' && c.AD.trim().length > 0 && c.AD.length <= 200));
  };
  const validos = itens.filter((it) => Number.isInteger(it.linha) && it.linha >= 2 && typeof it.placa === 'string' && it.placa &&
    typeof it.data === 'number' && celulasOk(it.celulas));
  if (!validos.length) return json({ ok: true, inseridos: 0 });
  const adm = await env.DB.prepare("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND excluido = 0 ORDER BY id LIMIT 1").first();
  if (!adm) return json({ erro: 'Nenhum administrador ativo para registrar a correção.' }, 500);
  await env.DB.batch(validos.map((it) => env.DB.prepare(
    `INSERT INTO alteracoes_base_copia (usuario_id, usuario_nome, linha, placa, data, acao, celulas, antes, tanque) VALUES (?, ?, ?, ?, ?, 'editar', ?, ?, ?)`)
    .bind(adm.id, 'Rateio das NFs (nota fechada)', it.linha, it.placa, it.data, JSON.stringify(it.celulas), JSON.stringify(it.antes || {}),
      ['diesel', 'arla'].includes(it.tanque) ? it.tanque : null)));
  return json({ ok: true, inseridos: validos.length });
}