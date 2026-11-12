// Etiqueta do cartão (Ticket, TruckPag, Veloe…): o mesmo nome e a mesma cor em todo o portal.
// Aceita o nome da API/Base_copia (TICKET, TRUCKPAG) e o da planilha de negociações (TICKETLOG, IDENTIFICACAO).
import { esc } from './dados.js';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (c) => semAcento(c).toUpperCase().replace(/\s+/g, ' ').trim();
const NOME = { TICKET: 'Ticket', TICKETLOG: 'Ticket', TRUCKPAG: 'TruckPag', VELOE: 'Veloe', VIBRA: 'Vibra', IDENTIFICACAO: 'Identificação', 'BOMBA INTERNA': 'Bomba interna' };
// Vibra: azul-claro, a cor padrão do portal (a do Consolidador; escolha do usuário em 09/11/2026); fundo claro leva texto escuro
const COR = { TICKET: '#2F7D32', TICKETLOG: '#2F7D32', TRUCKPAG: '#278187', VELOE: '#4B2E83', VIBRA: '#9DC3E6', IDENTIFICACAO: '#1D4E9B', 'BOMBA INTERNA': '#7A5C12' };
const TEXTO = { VIBRA: '#11283d' };

export const nomeCartao = (c) => NOME[chave(c)] || c || 'Não informado';
export const corCartao = (c) => COR[chave(c)] || '#5F6663';
export const corTextoCartao = (c) => TEXTO[chave(c)] || '#fff';   // texto em cima da cor do cartão
export const seloCartao = (c, classe) =>
  '<span class="selo-cartao' + (classe ? ' ' + classe : '') + '" style="background:' + corCartao(c) + ';color:' + corTextoCartao(c) + '">' + esc(c ? nomeCartao(c) : 'Não informado') + '</span>';
