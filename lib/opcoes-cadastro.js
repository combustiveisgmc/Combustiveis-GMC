// Opções configuráveis dos cadastros (18/11/2026): quais telas e campos têm a engrenagem e quem pode mudar. Só campos que são
// rótulo (categoria, marca, unidade, orientação, produto...): os que entram nas contas do site (situação, plataforma, combustível,
// tipo mínimo/polo) ficam fixos e aparecem só para consulta na engrenagem (public/gestao/lib/opcoes.js).
export const TELAS = {
  'cadastro-placas': { ver: ['cadastro-placas'], editar: 'cadastro-placas-editar', campos: ['categoria', 'unidade', 'marca'] },
  'cadastro-motoristas': { ver: ['cadastro-motoristas'], editar: 'cadastro-motoristas-editar', campos: ['unidade'] },
  postos: { ver: ['postos-motoristas', 'preco-postos'], editar: 'postos-editar', campos: ['aviso'] },
  'contratos-anp': { ver: ['contratos-anp'], editar: 'contratos-anp-editar', campos: ['produto', 'unidade'] },
  'preco-fornecedor': { ver: ['preco-fornecedor'], editar: 'preco-fornecedor-editar', campos: ['unidade'] },
};
export const MAX_VALORES = 300;
export const MAX_TEXTO = 80;

// lista digitada -> lista limpa (sem espaços sobrando, sem repetidas ignorando maiúsculas/acentos, na ordem dada) ou {erro}
export function limparValores(lista) {
  if (!Array.isArray(lista)) return { erro: 'Lista de opções inválida.' };
  const vistos = new Set(), out = [];
  for (const v of lista) {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.length > MAX_TEXTO) return { erro: 'Opção com mais de ' + MAX_TEXTO + ' letras: ' + t.slice(0, 30) + '…' };
    const k = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(t);
  }
  if (out.length > MAX_VALORES) return { erro: 'No máximo ' + MAX_VALORES + ' opções por campo.' };
  return { valores: out };
}
