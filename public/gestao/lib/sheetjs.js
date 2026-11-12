// Leitor de planilhas no navegador (SheetJS, do cdnjs), carregado só quando uma tela precisa (Consolidador, Programa PRIME).
const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let carregando = null;
export function carregarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!carregando) {
    carregando = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = SHEETJS; s.crossOrigin = 'anonymous';
      s.onload = () => (window.XLSX ? ok(window.XLSX) : falha(new Error('SheetJS não carregou.')));
      s.onerror = () => { carregando = null; falha(new Error('Não foi possível carregar o leitor de planilhas (cdnjs). Verifique a internet.')); };
      document.head.appendChild(s);
    });
  }
  return carregando;
}
