import { json, sha256 } from '../../lib/auth.js';
import { IDS, normPlaca, placaValida } from '../../lib/cartoes.js';

// POST /api/alerta-cartao   aviso do motorista (página dos postos, sem login): falta cartão no caminhão.
// {placa, cartoes: ['ticket'|'truckpag'|'veloe'], motorista, telefone?, observacao?, site?}
// Vai para a página Operacional > Cartões frota da gestão. Sem login, então: só do próprio site, campos curtos,
// campo-isca "site" (robôs preenchem) e no máximo 5 avisos por aparelho por hora (hash do IP com segredo; o IP não fica salvo).
const POR_HORA = 5;
const POR_DIA_TOTAL = 300;
const so = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (!origem || origem !== new URL(request.url).origin) return json({ erro: 'Origem não permitida.' }, 403);
  let d;
  try { d = await request.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  if (so(d.site, 50)) return json({ ok: true }, 201);   // campo-isca preenchido: finge que deu certo e não grava

  const placa = normPlaca(d.placa);
  const cartoes = [...new Set((Array.isArray(d.cartoes) ? d.cartoes : []).map(String))].filter((c) => IDS.includes(c));
  const motorista = so(d.motorista, 80).toUpperCase();
  const telefone = so(d.telefone, 20).replace(/[^\d()+\- ]/g, '') || null;
  const observacao = so(d.observacao, 300) || null;
  const erros = [];
  if (!placaValida(placa)) erros.push('Confira a placa (ex.: ABC1D23 ou ABC1234).');
  if (!cartoes.length) erros.push('Marque qual cartão está faltando.');
  if (motorista.length < 3) erros.push('Escreva o seu nome.');
  if (erros.length) return json({ erro: erros.join(' ') }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const origemHash = ip ? (await sha256('alerta-cartao|' + (env.SYNC_TOKEN || '') + '|' + ip)).slice(0, 32) : null;
  const [doAparelho, doDia] = await Promise.all([
    origemHash
      ? env.DB.prepare(`SELECT COUNT(*) AS n FROM alertas_cartoes WHERE origem = ? AND criado_em >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')`).bind(origemHash).first()
      : { n: 0 },
    env.DB.prepare(`SELECT COUNT(*) AS n FROM alertas_cartoes WHERE criado_em >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`).first(),
  ]);
  if (doAparelho.n >= POR_HORA || doDia.n >= POR_DIA_TOTAL) {
    return json({ erro: 'Muitos avisos enviados agora. Espere um pouco ou fale com a sua unidade.' }, 429);
  }
  // o mesmo aviso (placa + cartões) ainda em aberto não é duplicado: só atualiza quem avisou e a observação
  const igual = await env.DB.prepare(`SELECT id FROM alertas_cartoes WHERE estado = 'aberto' AND placa = ? AND cartoes = ? LIMIT 1`)
    .bind(placa, JSON.stringify(cartoes)).first();
  if (igual) {
    await env.DB.prepare(`UPDATE alertas_cartoes SET motorista = ?, telefone = COALESCE(?, telefone), observacao = COALESCE(?, observacao),
        criado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), origem = ? WHERE id = ?`).bind(motorista, telefone, observacao, origemHash, igual.id).run();
    return json({ ok: true, repetido: true }, 200);
  }
  await env.DB.prepare(`INSERT INTO alertas_cartoes (placa, cartoes, motorista, telefone, observacao, origem) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(placa, JSON.stringify(cartoes), motorista, telefone, observacao, origemHash).run();
  return json({ ok: true }, 201);
}
