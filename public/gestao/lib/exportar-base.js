// Exportar do Editar abastecimentos (18/11/2026, pedido do usuário): planilha igual à CONTROLES\Base_copia.xlsx > Transações,
// só com os abastecimentos dos filtros da tela, para atualizar a Base.xlsx à mão (o BI e outras planilhas leem a Base).
// Igual à planilha: 48 colunas A..AV na mesma ordem e largura, Arial 8, cabeçalho em negrito centralizado, filtro automático e
// o formato de cada coluna (data e hora, R$, KM/L com 6 casas...). As colunas de fórmula da planilha, que o banco não guarda,
// saem calculadas como o Consolidador as escreve (lib/consolidador.js): ANO e MÊS da data, COD UNID. = placa + hodômetro,
// DATA REF = 0, DEF POSTO vazia, AU vazia e AV = placa + forma de pagamento.
// Dados: /api/abastecimentos/exportar (public.base_transacoes, colunas A..AN + campanha + linha). Excel: ExcelJS do cdnjs.

const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

// [título, largura, formato] de A a AV (lidos da Base_copia em 18/11/2026); formato null = Geral
export const COLUNAS = [
  ['CODIGO TRANSACAO', 12.71, '0'], ['FORMA DE PAGAMENTO', 13.14, null], ['CODIGO CLIENTE', 9.43, '0'], ['NOME REDUZIDO', 16.29, null],
  ['DATA TRANSACAO', 18.71, 'dd/mm/yyyy\\ hh:mm:ss'], ['PLACA', 11.86, null], ['TIPO FROTA', 2.86, null], ['MODELO VEICULO', 2.14, null],
  ['NUMERO FROTA', 2.86, null], ['ANO', 5.29, '0'], ['MATRICULA', 6, '0'], ['NOME MOTORISTA', 30.29, null], ['SERVICO', 3.43, null],
  ['TIPO COMBUSTIVEL', 14.14, null], ['LITROS', 10.71, null], ['VL/LITRO', 11.43, '"R$"\\ #,##0.00'], ['HODOMETRO OU HORIMETRO', 10.14, '0'],
  ['KM RODADOS OU HORAS TRABALHADAS', 7.71, '0'], ['KM/LITRO OU LITROS/HORA', 16.29, '##,###,##0.000000'], ['VALOR EMISSAO', 13, '\\R\\$\\ * #,##0.00'],
  ['CODIGO ESTABELECIMENTO', 9.57, '0'], ['NOME ESTABELECIMENTO', 30.29, null], ['TIPO ESTABELECIMENTO', 30, null], ['ENDERECO', 45.43, null],
  ['BAIRRO', 24.29, null], ['CIDADE', 26, null], ['UF', 15.71, null], ['INFORMACAO ADIDIONAL 1', 32.43, null], ['INFORMACAO ADIDIONAL 2', 21.14, null],
  ['INFORMACAO ADIDIONAL 3', 33.43, null], ['INFORMACAO ADIDIONAL 4', 15.71, null], ['INFORMACAO ADIDIONAL 5', 13, null], ['FORMA TRANSACAO', 13, null],
  ['CODIGO LIBERACAO RESTRICAO', 13, null], ['SERIE POS', 8.86, null], ['NUMERO CARTAO', 20.29, null], ['FAMILIA VEICULO', 8.86, null],
  ['GRUPO RESTRICAO', 13, null], ['CODIGO EMISSORA', 13, null], ['RESPONSAVEL', 13, null], ['ANO', 10.86, null], ['MÊS', 8.86, null],
  ['CAMPANHA', 13, null], ['COD UNID.', 22.29, null], ['DATA REF', 13, 'mm-dd-yy'], ['DEF POSTO', 12.43, null], ['', 13, null], ['', 13, null],
];

// colunas que na planilha são número mas no banco vieram como texto (ex.: matrícula)
const NUMERO_DE_TEXTO = new Set([10]);
// '2026-11-17T21:32:34' (hora local, sem fuso) -> Date em UTC com a mesma hora (o Excel não tem fuso)
export function dataPlanilha(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))) : null;
}

// trava de segurança: a linha que o banco devolveu é o mesmo abastecimento da tela? (a busca é pelo número da linha da
// Base_copia, que muda quando um lote entra no meio; lista da tela e cópia do banco de versões diferentes = linhas trocadas)
// r = linha do banco; tela = {placa, serial (data do Excel), litros}. Mesma placa, mesmo minuto e mesmos litros.
export function confere(r, tela) {
  if (!tela) return false;
  const norm = (s) => String(s ?? '').trim().toUpperCase();
  const d = dataPlanilha(r[4]);
  const serial = d ? d.getTime() / 86400000 + 25569 : null;
  const litrosOk = (r[14] === null || r[14] === undefined) ? (tela.litros === null || tela.litros === undefined)
    : Math.abs(Number(r[14]) - Number(tela.litros)) < 0.01;
  return norm(r[5]) === norm(tela.placa) && serial !== null && Math.abs(serial - tela.serial) < 1 / 1440 && litrosOk;
}

// linha do banco [A..AN, campanha, linha] -> as 48 células da Base_copia
export function linhaPlanilha(r) {
  const c = r.slice(0, 40).map((v, i) => (NUMERO_DE_TEXTO.has(i) && typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v ?? null));
  const dt = dataPlanilha(r[4]);
  c[4] = dt;
  const placa = c[5] ?? '', forma = c[1], hodo = c[16];
  const codUnid = hodo !== null && hodo !== undefined && hodo !== '' ? placa + Math.trunc(Number(hodo)) : null;
  return [...c, dt ? dt.getUTCFullYear() : null, dt ? dt.getUTCMonth() + 1 : null, r[40] ?? null, codUnid, 0, null, null, forma ? placa + forma : placa];
}

let carregando = null;
export function carregarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!carregando) {
    carregando = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = EXCELJS; s.crossOrigin = 'anonymous';
      s.onload = () => (window.ExcelJS ? ok(window.ExcelJS) : falha(new Error('O gerador de Excel não carregou.')));
      s.onerror = () => { carregando = null; falha(new Error('Não foi possível carregar o gerador de Excel (cdnjs). Verifique a internet.')); };
      document.head.appendChild(s);
    });
  }
  return carregando;
}

// Cor da linha de cada cartão (FORMA DE PAGAMENTO), como na Base_copia (lido em 19/11/2026, pedido do usuário: "não veio com as
// formatações, como por exemplo as cores das linhas referente a cada cartão"). Cartão físico (Ticket) e outras: sem cor.
// Pinta de A a AU (a AV, chave auxiliar, fica sem cor, como na planilha).
export const CORES_CARTAO = { TRUCKPAG: 'FF99FF99', VIBRA: 'FF9DC3E6', VELOE: 'FFDBB7FF' };
const COLUNAS_PINTADAS = 47;
// alinhamento de cada coluna A..AV na Base_copia (r = direita, l = esquerda, c = centro, - = Geral)
const ALINHA = 'r l r l c l l l l r l l l l r r r r r r r l - l - l l l l l l l l l l l - l l - - l - - l l -'.split(' ');
const HORIZONTAL = { r: 'right', l: 'left', c: 'center' };
export const corDoCartao = (forma) => CORES_CARTAO[String(forma ?? '').trim().toUpperCase()] || null;
// estilo de uma célula de dados: coluna (1 = A) e forma de pagamento da linha
export function estiloCelula(coluna, forma) {
  const [, , formato] = COLUNAS[coluna - 1];
  const h = HORIZONTAL[ALINHA[coluna - 1]];
  const cor = coluna <= COLUNAS_PINTADAS ? corDoCartao(forma) : null;
  return { font: { name: 'Arial', size: 8 }, ...(formato ? { numFmt: formato } : {}), ...(h ? { alignment: { horizontal: h } } : {}),
    ...(cor ? { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } } } : {}) };
}

const letra = (n) => { let s = ''; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
// linhas = saída de linhaPlanilha; devolve o workbook do ExcelJS pronto para writeBuffer()
export function montarPlanilha(ExcelJS, linhas) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portal Gestão de Combustível';
  const ws = wb.addWorksheet('Transações');
  const fonte = { name: 'Arial', size: 8 };
  ws.columns = COLUNAS.map(([titulo, largura, formato]) => ({ header: titulo, width: largura, style: { font: fonte, ...(formato ? { numFmt: formato } : {}) } }));
  const cab = ws.getRow(1);
  cab.eachCell({ includeEmpty: true }, (cel) => { cel.font = { ...fonte, bold: true }; cel.alignment = { horizontal: 'center' }; cel.numFmt = 'General'; });
  // um objeto de estilo por coluna e cor, reaproveitado (dezenas de milhares de linhas; atribuir cel.style inteiro evita o ExcelJS
  // mexer no estilo compartilhado da coluna)
  const estilos = new Map();
  const estilo = (c, forma) => {
    const k = c + '|' + (corDoCartao(forma) || '');
    if (!estilos.has(k)) estilos.set(k, estiloCelula(c, forma));
    return estilos.get(k);
  };
  for (const l of linhas) {
    const row = ws.addRow(l);
    const forma = l[1];
    for (let c = 1; c <= COLUNAS.length; c++) row.getCell(c).style = estilo(c, forma);
  }
  ws.autoFilter = 'A1:' + letra(COLUNAS.length) + (linhas.length + 1);
  return wb;
}
