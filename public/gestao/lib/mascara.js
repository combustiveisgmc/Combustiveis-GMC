// Máscara dos campos de valor (R$): a pessoa digita só os números e o valor se monta da direita para a esquerda, com a
// vírgula e os pontos colocados sozinhos (1 → 0,01; 12345 → 123,45; 1234567 → 12.345,67), como em app de banco.
// Vale para todo <input data-moeda="2|3|4"> (o número é a quantidade de casas decimais). Escuta em fase de captura: as
// telas já recebem o valor formatado nos próprios ouvintes de "input" e "change" (e continuam lendo "1.234,56").
function formatar(digitos, casas) {
  const d = digitos.replace(/^0+/, '');
  if (!d) return '';
  return (Number(d) / 10 ** casas).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// Máscaras de digitação: <input data-mascara="cpf|data|placa|numeros">. A pessoa digita só os números (ou letras da
// placa) e os sinais entram sozinhos: CPF 000.000.000-00, data dd/mm/aaaa, placa ABC1D23 (maiúsculas, sem traço).
// Colar um valor já formatado também funciona. Fase de captura: as telas recebem o valor já formatado.
const MASCARAS = {
  cpf: (v) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'); },
  // CNPJ 00.000.000/0000-00 (11/11/2026: todos os campos de CNPJ, como o CPF)
  cnpj: (v) => { const d = v.replace(/\D/g, '').slice(0, 14); return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4').replace(/\/(\d{4})(\d{1,2})$/, '/$1-$2'); },
  data: (v) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 4 ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; },
  placa: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7),
  numeros: (v) => v.replace(/\D/g, ''),
};
export function iniciarMascaras(raiz = document) {
  raiz.addEventListener('input', (e) => {
    const i = e.target, f = i && i.dataset && MASCARAS[i.dataset.mascara];
    if (!f) return;
    const novo = f(i.value);
    if (novo === i.value) return;
    const noFim = i.selectionStart === i.value.length;
    i.value = novo;
    if (noFim) { try { i.setSelectionRange(novo.length, novo.length); } catch {} }
  }, true);
}

export function iniciarMascaraMoeda(raiz = document) {
  const eMoeda = (el) => el && el.matches && el.matches('input[data-moeda]');
  // ao entrar no campo: teclado numérico no celular e o valor todo selecionado (digitar já substitui)
  raiz.addEventListener('focusin', (e) => {
    const i = e.target;
    if (!eMoeda(i)) return;
    i.inputMode = 'numeric';
    setTimeout(() => { if (document.activeElement === i) i.select(); }, 0);
  });
  raiz.addEventListener('input', (e) => {
    const i = e.target;
    if (!eMoeda(i)) return;
    const casas = Number(i.dataset.moeda) || 2;
    i.value = formatar(i.value.replace(/\D/g, ''), casas);
    const fim = i.value.length;
    try { i.setSelectionRange(fim, fim); } catch {}
  }, true);
}