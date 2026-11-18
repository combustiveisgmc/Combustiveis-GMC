// Quem recebe cada notificação (18/11/2026): padrão do tipo, "quem tem acesso a estas telas" e "só estes usuários".
// Caso relatado: quem só tem a Consulta de KM recebia o aviso de preço alto. Dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recebe, limparDestinatarios, TELAS_PADRAO } from '../../public/gestao/lib/destino-notificacao.js';
import { USAM_DADOS } from '../../lib/permissoes.js';
import { onRequestGet, onRequestPost } from '../../functions/api/notificacoes/index.js';

const precoAlto = (destinatarios = { modo: 'todos' }) => ({ id: 1, tipo: 'preco-alto', ativa: true, destinatarios });

test('preço alto no padrão: só quem tem painel de preço (a Consulta de KM sozinha não recebe)', () => {
  assert.equal(recebe(['consulta-km'], 5, precoAlto(), USAM_DADOS), false);
  assert.equal(recebe(['preco-postos'], 5, precoAlto(), USAM_DADOS), true);
  assert.equal(recebe(['mapa-calor', 'consulta-km'], 5, precoAlto(), USAM_DADOS), true);
  assert.ok(!TELAS_PADRAO['preco-alto'].includes('consulta-km'));
});

test('quem tem acesso a estas telas: vale a lista escolhida (alguma delas)', () => {
  const r = precoAlto({ modo: 'telas', telas: ['despesas', 'operacao-motorista'] });
  assert.equal(recebe(['despesas'], 5, r, USAM_DADOS), true);
  assert.equal(recebe(['preco-postos'], 5, r, USAM_DADOS), false);   // painel de preço, mas não está na lista
  assert.equal(recebe(['consulta-km'], 5, r, USAM_DADOS), false);
});

test('a pessoa também precisa conseguir verificar o aviso (estoque, cartões, dados)', () => {
  const estoque = { id: 2, tipo: 'estoque-baixo', destinatarios: { modo: 'telas', telas: ['despesas'] } };
  assert.equal(recebe(['despesas'], 5, estoque, USAM_DADOS), false);              // sem o Estoque não há o que verificar
  assert.equal(recebe(['despesas', 'bomba-estoque'], 5, estoque, USAM_DADOS), true);
  const usuarios = { id: 3, tipo: 'falta-cartao', destinatarios: { modo: 'usuarios', ids: [5] } };
  assert.equal(recebe(['cartoes-frota'], 5, usuarios, USAM_DADOS), true);
  assert.equal(recebe(['cartoes-frota'], 6, usuarios, USAM_DADOS), false);
  assert.equal(recebe([], 5, usuarios, USAM_DADOS), false);
  const comunicado = { id: 4, tipo: 'comunicado', destinatarios: { modo: 'todos' } };
  assert.equal(recebe([], 9, comunicado, USAM_DADOS), true);                       // comunicado: todos os logins
});

test('limparDestinatarios: telas desconhecidas saem; lista vazia é erro', () => {
  assert.deepEqual(limparDestinatarios({ modo: 'telas', telas: ['despesas', 'xyz', 'despesas'] }, ['despesas']).valor, { modo: 'telas', telas: ['despesas'] });
  assert.ok(limparDestinatarios({ modo: 'telas', telas: ['xyz'] }, ['despesas']).erro);
  assert.ok(limparDestinatarios({ modo: 'usuarios', ids: [] }, []).erro);
  assert.deepEqual(limparDestinatarios({ modo: 'outro' }, []).valor, { modo: 'todos' });
});

// API: D1 falso com a sessão (lib/auth.js) e a tabela notificacoes
function envFalso(usuario, regras) {
  const linhas = regras.map((r) => ({ id: r.id, nome: 'R' + r.id, tipo: r.tipo, ativa: 1, condicao: '{}', mensagem: 'x', nivel: 'alerta',
    destinatarios: JSON.stringify(r.destinatarios), repetir: 'diaria' }));
  let gravado = null;
  return {
    gravado: () => gravado,
    DADOS: { get: async () => null },
    DB: { prepare(sql) {
      const st = { args: [], bind(...a) { st.args = a; return st; } };
      st.first = async () => {
        if (sql.includes('FROM sessoes')) return usuario;
        if (sql.startsWith('INSERT')) { gravado = st.args; return { id: 9, nome: st.args[0], tipo: st.args[1], ativa: 1, condicao: st.args[3], mensagem: st.args[4], nivel: st.args[5], destinatarios: st.args[6], repetir: st.args[7] }; }
        return null;
      };
      st.all = async () => ({ results: sql.includes('FROM notificacoes') ? linhas : [] });
      st.run = async () => ({});
      return st;
    } },
  };
}
const pedido = (url, corpo) => new Request('https://exemplo.test/api/notificacoes' + url, { method: corpo ? 'POST' : 'GET',
  headers: { cookie: 'sessao=abc', 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
const login = (perms, papel = 'gestor') => ({ id: 5, usuario: 'teste', nome: 'Teste', papel, trocar_senha: 0, permissoes: JSON.stringify(perms), funcao_id: null, funcao_permissoes: null });

test('API ?minhas=1: login só com a Consulta de KM não recebe o preço alto; com Preço postos recebe', async () => {
  const regras = [{ id: 1, tipo: 'preco-alto', destinatarios: { modo: 'todos' } }, { id: 2, tipo: 'comunicado', destinatarios: { modo: 'todos' } }];
  const so = await (await onRequestGet({ request: pedido('?minhas=1'), env: envFalso(login(['consulta-km']), regras) })).json();
  assert.deepEqual(so.regras.map((r) => r.id), [2]);
  const preco = await (await onRequestGet({ request: pedido('?minhas=1'), env: envFalso(login(['preco-postos']), regras) })).json();
  assert.deepEqual(preco.regras.map((r) => r.id), [1, 2]);
});

test('API salvar: grava "quem tem acesso a estas telas" e recusa tela desconhecida', async () => {
  const env = envFalso(login([], 'admin'), []);
  const base = { acao: 'salvar', nome: 'Preço alto', tipo: 'preco-alto', condicao: { combustivel: 'diesel', modo: 'reais', limite: 7, dias: 1 }, mensagem: 'm', nivel: 'alerta', repetir: 'diaria' };
  const ok = await onRequestPost({ request: pedido('', { ...base, destinatarios: { modo: 'telas', telas: ['preco-postos', 'mapa-calor'] } }), env });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(env.gravado()[6]), { modo: 'telas', telas: ['preco-postos', 'mapa-calor'] });
  const ruim = await onRequestPost({ request: pedido('', { ...base, destinatarios: { modo: 'telas', telas: ['inventada'] } }), env });
  assert.equal(ruim.status, 400);
});
