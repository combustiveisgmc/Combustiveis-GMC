// Cadastros auxiliares da engrenagem dos formulários (18/11/2026). Desde a migração 20261118210000_gestao_cadastro_tabelas.sql são
// TABELAS no banco (Supabase, esquema `cadastro`): unidades, categorias de veículo, marcas, avisos de posto e produtos de contrato.
// Aqui: em que telas a engrenagem aparece, quais cadastros cada uma mexe e quem pode mudar. Campos que entram nas contas do site
// (situação, plataforma, combustível, tipo mínimo/polo) continuam fixos (só consulta na engrenagem: public/gestao/lib/opcoes.js).
// A unidade é a mesma em todo o portal: placa, motorista, contrato e fornecedor apontam para o mesmo cadastro.
export const TELAS = {
  'cadastro-placas': { ver: ['cadastro-placas'], editar: 'cadastro-placas-editar', campos: ['categoria', 'unidade', 'marca'] },
  'cadastro-motoristas': { ver: ['cadastro-motoristas'], editar: 'cadastro-motoristas-editar', campos: ['unidade'] },
  postos: { ver: ['postos-motoristas', 'preco-postos'], editar: 'postos-editar', campos: ['aviso'] },
  'contratos-anp': { ver: ['contratos-anp'], editar: 'contratos-anp-editar', campos: ['produto', 'unidade'] },
  'preco-fornecedor': { ver: ['preco-fornecedor'], editar: 'preco-fornecedor-editar', campos: ['unidade'] },
};
export const MAX_TEXTO = 80;
// o que dá para fazer num item do cadastro ('editar' = nome curto, centro de custo, empresa e operacional da unidade)
export const ACOES = ['adicionar', 'renomear', 'ativar', 'desativar', 'editar'];

// pedido do formulário -> {valor: {tipo, acao, id, dados}} ou {erro, status}
export function pedidoValido(d, podeEditarTela) {
  const t = TELAS[d && d.tela];
  if (!t) return { erro: 'Tela desconhecida.', status: 404 };
  if (!podeEditarTela(t.editar)) return { erro: 'Seu acesso a esta tela é só de consulta.', status: 403 };
  if (!t.campos.includes(d.campo)) return { erro: 'Este campo não tem cadastro.', status: 400 };
  if (!ACOES.includes(d.acao)) return { erro: 'Ação desconhecida.', status: 400 };
  if (d.acao === 'editar' && d.campo !== 'unidade') return { erro: 'Só a unidade tem outros dados para editar.', status: 400 };
  const id = d.id === undefined || d.id === null || d.id === '' ? null : Number(d.id);
  if (d.acao !== 'adicionar' && !Number.isInteger(id)) return { erro: 'Item inválido.', status: 400 };
  const dados = d.dados && typeof d.dados === 'object' ? { ...d.dados } : {};
  if (dados.nome !== undefined) {
    dados.nome = String(dados.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!dados.nome && (d.acao === 'adicionar' || d.acao === 'renomear')) return { erro: 'Escreva o nome.', status: 400 };
    if (dados.nome.length > MAX_TEXTO) return { erro: 'Nome com mais de ' + MAX_TEXTO + ' letras.', status: 400 };
  } else if (d.acao === 'adicionar' || d.acao === 'renomear') return { erro: 'Escreva o nome.', status: 400 };
  return { valor: { tipo: d.campo, acao: d.acao, id: d.acao === 'adicionar' ? null : id, dados } };
}

// listas do banco ({unidade: [{id, nome, ativa, ...}], ...}) -> o que a tela usa
export function listasDaTela(tela, listas) {
  const t = TELAS[tela], opcoes = {}, registros = {};
  for (const c of t.campos) {
    registros[c] = Array.isArray(listas && listas[c]) ? listas[c] : [];
    opcoes[c] = registros[c].filter((x) => x.ativa).map((x) => x.nome);
  }
  return { opcoes, registros };
}
