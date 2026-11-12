import { usuarioDaSessao, json } from '../../../lib/auth.js';

// Versão dos dados dos dashboards: o site consulta de tempos em tempos para saber se há carga nova.
export async function onRequestGet({ request, env }) {
  const u = await usuarioDaSessao(env.DB, request);
  if (!u) return json({ erro: 'Não conectado.' }, 401);
  const [info, status, plantao, tempoReal] = await Promise.all([env.DADOS.get('versao', 'json'), env.DADOS.get('status', 'json'),
    // qual computador está sincronizando agora (revezamento principal/reserva); sem a tabela ainda, fica nulo
    env.DB.prepare('SELECT p.maquina, p.desde, p.renovado, v.prioridade FROM plantao p LEFT JOIN vigias v ON v.maquina = p.maquina WHERE p.id = 1').first().catch(() => null),
    env.DADOS.get('tempo-real-versao', 'json')]);   // transações das APIs dos cartões ainda fora da Base
  // status: andamento do sincronizador (processando / ok / erro), para o botão Atualizar explicar o que está acontecendo
  // a versão do site junta a da Base e a das transações em tempo real (lib/dados.js monta a mesma combinação)
  const versao = info && info.versao ? info.versao + (tempoReal && tempoReal.versao ? '+' + tempoReal.versao : '') : null;
  return json({ ...(info || {}), versao, tempoReal: tempoReal || null, status: status || null, plantao: plantao && plantao.maquina ? plantao : null });
}
