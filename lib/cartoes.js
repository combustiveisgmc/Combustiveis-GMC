// Cartões frota: planilha CONTROLES\CONTROLE CARTÕES FROTA.xlsx, aba CARTÕES (PLACA, TICKET, TRUCKPAG, VELOE).
// O vigia publica a lista na chave "cartoes" do KV (scripts/planilha_cartoes.py). As mudanças feitas no portal ficam
// na tabela alteracoes_cartoes até o vigia gravá-las na planilha; os avisos dos motoristas ficam em alertas_cartoes.

// forma: o valor da coluna "FORMA DE PAGAMENTO" da Base (aba Transações) depois do importar_base.py
export const CARTOES = [
  { id: 'ticket', rotulo: 'Ticket', forma: 'TICKET' },
  { id: 'truckpag', rotulo: 'TruckPag', forma: 'TRUCKPAG' },
  { id: 'veloe', rotulo: 'Veloe', forma: 'VELOE' },
];
export const IDS = CARTOES.map((c) => c.id);
export const SITUACOES = ['ATIVO', 'QUEBRADO', 'PERDIDO', 'AGUARDANDO ENVIO', 'ENVIO PARA BASE'];
// ligação com o cadastro de placas: ficam no controle as placas ATIVAS destas categorias (as com motor).
// Mesma lista de scripts/planilha_cartoes.py (o vigia acerta a planilha); a página usa para mostrar já.
export const CATEGORIAS_COM_CARTAO = ['CAVALO', 'TRUCK', 'TOCO', 'BITRUCK', '3/4', 'PICAPE'];   // picape desde 06/10/2026

const so = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const base = (s) => so(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const normPlaca = (v) => so(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const placaValida = (p) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);

// situação digitada -> a da lista (sem diferença de maiúsculas/acentos); vazio = sem cartão (célula vazia)
export function situacao(v) {
  const t = base(v);
  if (!t) return { v: null };
  const s = SITUACOES.find((o) => base(o) === t);
  return s ? { v: s } : { erro: 'Situação inválida: escolha ' + SITUACOES.slice(0, -1).join(', ') + ' ou ' + SITUACOES[SITUACOES.length - 1] + '.' };
}

// {ticket, truckpag, veloe} -> só os cartões enviados, validados
export function validar(bruto) {
  const dados = {}, erros = [];
  for (const id of IDS) {
    if (!(id in (bruto || {}))) continue;
    const r = situacao(bruto[id]);
    if (r.erro) erros.push(CARTOES.find((c) => c.id === id).rotulo + ': ' + r.erro);
    else dados[id] = r.v;
  }
  if (!erros.length && !Object.keys(dados).length) erros.push('Nenhuma alteração para salvar.');
  return { dados, erros };
}
