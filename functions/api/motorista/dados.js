import { json } from '../../../lib/auth.js';
import { motoristaDaSessao, motoristaDoCadastro, chaveNome, ESPELHO_TESTE } from '../../../lib/motoristas.js';
import { rpc, temBanco } from '../../../lib/supabase.js';
import { chaveLinha } from '../../../public/gestao/lib/tempo-real.js';

// Área do motorista: os abastecimentos de quem entrou (e só os dele). A parte da Base vem do vigia já separada por nome
// (KV "painel-motoristas:<grupo>", scripts/painel_motoristas.mjs); as transações das APIs dos cartões que a Base ainda não
// tem vêm do "tempo-real", filtradas aqui pelo mesmo nome.
// GET /api/motorista/dados -> {nome, unidade, usuario, senhaPropria, senhas: {ticket, truckpag, veloe}, geradoEm, linhas: [{dia, seg, placa, combustivel, posto, cidade, litros, km,
//                              hodometro, abastecimento, tempoReal}], veiculos: {placa: {categoria, modelo, meta}},
//                              prime: {avisos: {placa|dia|hodômetro: {motivo, aviso}}, parciais: [placa|dia|hodômetro],
//                                      notas: [{mes, nota, estrelas}]}}
const GRUPOS = 32;
function grupoDe(chave) {   // igual ao scripts/painel_motoristas.mjs
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) { h ^= chave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % GRUPOS;
}

export async function onRequestGet({ request, env }) {
  const s = await motoristaDaSessao(env.DB, request);
  if (!s) return json({ erro: 'Entre de novo com o seu usuário.' }, 401);
  const cad = await motoristaDoCadastro(env, s.usuario);
  if (!cad || cad.situacao === 'DESLIGADO') return json({ erro: 'Seu acesso não está liberado. Fale com a gestão de combustível.' }, 403);
  const espelhoDe = ESPELHO_TESTE[s.usuario] || null;   // motorista de teste: abastecimentos de um motorista real, só na tela
  const nomeBusca = espelhoDe || cad.nome || s.nome;
  const k = chaveNome(nomeBusca);
  // 15.2 passo 1b (19/11/2026): com a chave KV "motorista-fonte" = "banco", os abastecimentos vêm do banco
  // (gestao_painel_motorista: mesmos números dos painéis, até o último dia que o banco tem); sem resposta, volta ao KV do vigia
  const doBanco = temBanco(env) && (await env.DADOS.get('motorista-fonte').catch(() => null)) === 'banco';
  const [banco, tr] = await Promise.all([
    doBanco ? rpc(env, 'gestao_painel_motorista', { p_nome: nomeBusca }, { ms: 10000 }) : null,
    env.DADOS.get('tempo-real', 'json').catch(() => null),
  ]);
  let grupo = null, veic = null;
  if (!banco || !Array.isArray(banco.linhas)) {
    [grupo, veic] = await Promise.all([
      env.DADOS.get('painel-motoristas:' + grupoDe(k), 'json').catch(() => null),
      env.DADOS.get('painel-veiculos', 'json').catch(() => null),
    ]);
  }
  const brutas = banco && Array.isArray(banco.linhas) ? banco.linhas : (grupo && grupo.motoristas && grupo.motoristas[k]) || [];
  const linhas = brutas.map((r) => ({
    dia: r[0], seg: r[1], placa: r[2], combustivel: r[3], posto: r[4], cidade: r[5], litros: r[6], km: r[7], hodometro: r[8], abastecimento: r[9] === 1, tempoReal: false,
  }));
  if (tr && tr.dic && tr.col) {
    const fora = new Set(tr.foraAbastecimento || []);
    // tempo real que já está na lista (mesma placa, minuto e litros) não entra de novo
    const ja = new Set(linhas.map((l) => chaveLinha(l.placa, l.dia, l.seg, l.litros)));
    for (let i = 0; i < tr.linhas; i++) {
      if (chaveNome(tr.dic.motorista[tr.col.motorista[i]]) !== k) continue;
      if (ja.has(chaveLinha(tr.dic.placa[tr.col.placa[i]], tr.col.data[i], tr.col.seg ? tr.col.seg[i] : null, tr.col.litros[i]))) continue;
      linhas.push({ dia: tr.col.data[i], seg: tr.col.seg ? tr.col.seg[i] : null, placa: tr.dic.placa[tr.col.placa[i]], combustivel: tr.dic.combustivel[tr.col.combustivel[i]],
        posto: tr.dic.fornecedor[tr.col.fornecedor[i]], cidade: tr.dic.cidade[tr.col.cidade[i]], litros: tr.col.litros[i] || 0, km: tr.col.km[i] || 0,
        hodometro: tr.col.hodometro[i], abastecimento: !fora.has(i), tempoReal: true });
    }
  }
  const todos = (banco && banco.veiculos) || (veic && veic.veiculos) || {};
  const veiculos = {};
  for (const l of linhas) if (todos[l.placa]) veiculos[l.placa] = todos[l.placa];
  // Programa PRIME: avisos dos abastecimentos que a gestão tirou do PRIME e a nota/estrelas dos meses já fechados
  const prime = { avisos: {}, parciais: [], notas: [] };
  try {
    const [av, ms] = await Promise.all([
      env.DB.prepare('SELECT chave, motivo, aviso FROM prime_abastecimentos WHERE entra = 0').all(),
      env.DB.prepare("SELECT mes, resultado FROM prime_meses WHERE situacao = 'fechado' ORDER BY mes DESC LIMIT 6").all(),
    ]);
    // avisos dos abastecimentos que estão no acesso dele (também os trocados para ele) e os parciais das placas dele: o
    // 1º abastecimento do mês seguinte a um parcial no fim do mês também fica fora (a página descobre qual é pelo hodômetro)
    const chaves = new Set(linhas.map((l) => l.placa + '|' + l.dia + '|' + Math.round(l.hodometro || 0)));
    const placas = new Set(linhas.map((l) => l.placa));
    for (const a of av.results) {
      if (chaves.has(a.chave)) prime.avisos[a.chave] = { motivo: a.motivo, aviso: a.aviso };
      if (a.motivo === 'Abastecimento parcial' && placas.has(a.chave.split('|')[0])) prime.parciais.push(a.chave);
    }
    for (const m of ms.results) {
      let r = null;
      try { r = (JSON.parse(m.resultado) || []).find((x) => x.chave === k); } catch {}
      if (r) prime.notas.push({ mes: m.mes, nota: r.nota, estrelas: r.estrelas });
    }
  } catch {}   // tabelas do PRIME ainda não criadas: a área do motorista segue sem elas
  // acesso a este portal (aba Senhas): o usuário e se ainda usa a senha inicial
  const ac = await env.DB.prepare('SELECT senha_hash IS NOT NULL AS propria FROM motoristas_acesso WHERE usuario = ?').bind(s.usuario).first().catch(() => null);
  return json({ nome: cad.nome, unidade: cad.unidade, usuario: s.usuario, senhaPropria: !!(ac && ac.propria), espelhoDe, senhas: cad.senhas || {}, geradoEm: banco && banco.linhas ? banco.geradoEm : grupo ? grupo.geradoEm : null, tempoRealEm: tr ? tr.geradoEm : null, linhas, veiculos, prime });
}