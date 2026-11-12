// XLSX da nota do Rateio das NFs, montado no navegador (sem biblioteca): aba com os abastecimentos da nota (40 colunas da
// Base, como a aba de cada nota da planilha de rateio) e aba "Rateio" com uma TABELA DINÂMICA de verdade (centro de custo
// -> placa, soma do VALOR EMISSAO e % do total). A tabela já vai desenhada e marcada para atualizar ao abrir no Excel
// (refreshOnLoad), então dá para filtrar, recolher e mudar os campos como numa tabela feita à mão.
// planilhaRateio({aba, cabecalho: [40], linhas: [[40 valores]], col: {data, placa, cc, valor}, titulo}) -> Blob
const NUM_DATA = 164;   // dd/mm/aaaa hh:mm:ss

const xml = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letra = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const CAB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const isoDeSerial = (s) => new Date(Math.round((s - 25569) * 86400) * 1000).toISOString().slice(0, 19);

function celula(ref, v, estilo) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '') + '><v>' + Number(v.toPrecision(15)) + '</v></c>';
  return '<c r="' + ref + '" t="inlineStr"' + (estilo ? ' s="' + estilo + '"' : '') + '><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
}

export function planilhaRateio({ aba, cabecalho, linhas, col, titulo }) {
  const nome = String(aba).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
  const nCol = cabecalho.length, ult = letra(nCol - 1) + (linhas.length + 1);

  // ---------- aba dos abastecimentos ----------
  let dados = '<row r="1">' + cabecalho.map((h, i) => celula(letra(i) + '1', h, 1)).join('') + '</row>';
  linhas.forEach((l, k) => {
    const r = k + 2;
    dados += '<row r="' + r + '">' + l.map((v, i) => celula(letra(i) + r, v, i === col.data ? 2 : i === col.valor ? 3 : 0)).join('') + '</row>';
  });
  const sheet1 = CAB + '<worksheet ' + NS + '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols><col min="' + (col.data + 1) + '" max="' + (col.data + 1) + '" width="20" customWidth="1"/></cols><sheetData>' + dados + '</sheetData>' +
    '<autoFilter ref="A1:' + ult + '"/></worksheet>';

  // ---------- cache da tabela dinâmica (tipos de cada coluna; itens das colunas usadas nas linhas) ----------
  const valorDe = (l, i) => (l[i] === undefined ? null : l[i]);
  const total = linhas.reduce((s, l) => s + (Number(valorDe(l, col.valor)) || 0), 0);
  // centro de custo (maior valor primeiro) e placas (maior valor primeiro), na ordem em que a tabela mostra
  const porCC = new Map();
  for (const l of linhas) {
    const cc = String(valorDe(l, col.cc)), pl = String(valorDe(l, col.placa)), v = Number(valorDe(l, col.valor)) || 0;
    if (!porCC.has(cc)) porCC.set(cc, { v: 0, placas: new Map() });
    const g = porCC.get(cc); g.v += v; g.placas.set(pl, (g.placas.get(pl) || 0) + v);
  }
  const ccs = [...porCC.entries()].sort((a, b) => b[1].v - a[1].v);
  const somaPlaca = new Map();
  for (const [, g] of ccs) for (const [p, v] of g.placas) somaPlaca.set(p, (somaPlaca.get(p) || 0) + v);
  const placas = [...somaPlaca.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const idxCC = new Map(ccs.map(([c], i) => [c, i])), idxPl = new Map(placas.map((p, i) => [p, i]));

  const campos = cabecalho.map((h, i) => {
    if (i === col.cc) return '<cacheField name="' + xml(h) + '" numFmtId="0"><sharedItems count="' + ccs.length + '">' + ccs.map(([c]) => '<s v="' + xml(c) + '"/>').join('') + '</sharedItems></cacheField>';
    if (i === col.placa) return '<cacheField name="' + xml(h) + '" numFmtId="0"><sharedItems count="' + placas.length + '">' + placas.map((p) => '<s v="' + xml(p) + '"/>').join('') + '</sharedItems></cacheField>';
    const vs = linhas.map((l) => valorDe(l, i));
    const branco = vs.some((v) => v === null || v === ''), nums = vs.filter((v) => typeof v === 'number'), txt = vs.some((v) => typeof v === 'string' && v !== '');
    let a = '';
    if (i === col.data && nums.length && !txt) {
      a = 'containsSemiMixedTypes="0" containsNonDate="0" containsDate="1" containsString="0"' + (branco ? ' containsBlank="1"' : '') +
        ' minDate="' + isoDeSerial(Math.min(...nums)) + '" maxDate="' + isoDeSerial(Math.max(...nums)) + '"';
      return '<cacheField name="' + xml(h) + '" numFmtId="' + NUM_DATA + '"><sharedItems ' + a + '/></cacheField>';
    }
    if (nums.length && !txt) {
      a = 'containsSemiMixedTypes="0" containsString="0" containsNumber="1"' + (nums.every(Number.isInteger) ? ' containsInteger="1"' : '') +
        (branco ? ' containsBlank="1"' : '') + ' minValue="' + Math.min(...nums) + '" maxValue="' + Math.max(...nums) + '"';
    } else if (nums.length && txt) {
      a = 'containsMixedTypes="1" containsNumber="1"' + (branco ? ' containsBlank="1"' : '') + ' minValue="' + Math.min(...nums) + '" maxValue="' + Math.max(...nums) + '"';
    } else if (!txt) {
      a = 'containsNonDate="0" containsString="0" containsBlank="1"';
    } else if (branco) a = 'containsBlank="1"';
    return '<cacheField name="' + xml(h) + '" numFmtId="0"><sharedItems' + (a ? ' ' + a : '') + '/></cacheField>';
  });
  const cache = CAB + '<pivotCacheDefinition ' + NS + ' saveData="0" refreshOnLoad="1" createdVersion="5" refreshedVersion="5" minRefreshableVersion="3" recordCount="' + linhas.length + '">' +
    '<cacheSource type="worksheet"><worksheetSource ref="A1:' + ult + '" sheet="' + xml(nome) + '"/></cacheSource>' +
    '<cacheFields count="' + nCol + '">' + campos.join('') + '</cacheFields></pivotCacheDefinition>';

  // ---------- tabela dinâmica (aba Rateio, a partir de A3) ----------
  const itens = [];   // linhas da tabela: [rótulo, valor, nível]
  let rowItems = '';
  for (const [c, g] of ccs) {
    rowItems += '<i><x v="' + idxCC.get(c) + '"/></i>'; itens.push([c, g.v, 0]);
    for (const [p, v] of [...g.placas.entries()].sort((a, b) => idxPl.get(a[0]) - idxPl.get(b[0]))) { rowItems += '<i r="1"><x v="' + idxPl.get(p) + '"/></i>'; itens.push([p, v, 1]); }
  }
  rowItems += '<i t="grand"><x/></i>'; itens.push(['Total Geral', total, -1]);
  const ini = 3, fim = ini + itens.length;
  const pf = cabecalho.map((h, i) => {
    if (i === col.cc) return '<pivotField axis="axisRow" showAll="0"><items count="' + (ccs.length + 1) + '">' + ccs.map((_, k) => '<item x="' + k + '"/>').join('') + '<item t="default"/></items></pivotField>';
    if (i === col.placa) return '<pivotField axis="axisRow" showAll="0"><items count="' + (placas.length + 1) + '">' + placas.map((_, k) => '<item x="' + k + '"/>').join('') + '<item t="default"/></items></pivotField>';
    if (i === col.valor) return '<pivotField dataField="1" showAll="0"/>';
    return '<pivotField showAll="0"/>';
  });
  const tabela = CAB + '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="Rateio" cacheId="1" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" updatedVersion="5" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" createdVersion="5" indent="0" outline="1" outlineData="1" multipleFieldFilters="0" rowHeaderCaption="Centro de custo / placa">' +
    '<location ref="A' + ini + ':C' + fim + '" firstHeaderRow="0" firstDataRow="1" firstDataCol="1"/>' +
    '<pivotFields count="' + nCol + '">' + pf.join('') + '</pivotFields>' +
    '<rowFields count="2"><field x="' + col.cc + '"/><field x="' + col.placa + '"/></rowFields><rowItems count="' + (itens.length) + '">' + rowItems + '</rowItems>' +
    '<colFields count="1"><field x="-2"/></colFields><colItems count="2"><i><x/></i><i i="1"><x v="1"/></i></colItems>' +
    '<dataFields count="2"><dataField name="Soma de VALOR EMISSAO" fld="' + col.valor + '" baseField="0" baseItem="0" numFmtId="4"/>' +
    '<dataField name="PERCENTUAL" fld="' + col.valor + '" showDataAs="percentOfTotal" baseField="0" baseItem="0" numFmtId="10"/></dataFields>' +
    '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
    // sem a linha "Valores" em cima do cabeçalho (como na tabela da planilha de rateio)
    '<extLst><ext uri="{962EF5D1-5CA2-4c93-8EF4-DBF5C05439D2}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main">' +
    '<x14:pivotTableDefinition hideValuesRow="1" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"/></ext></extLst></pivotTableDefinition>';

  // valores já escritos nas células (quem abre sem atualizar, como o visualizador do celular, também vê o rateio)
  let rat = '<row r="1">' + celula('A1', titulo || nome, 1) + '</row>';
  rat += '<row r="' + ini + '">' + celula('A' + ini, 'Centro de custo / placa', 1) + celula('B' + ini, 'Soma de VALOR EMISSAO', 1) + celula('C' + ini, 'PERCENTUAL', 1) + '</row>';
  itens.forEach(([rot, v, nivel], k) => {
    const r = ini + 1 + k, e = nivel === 1 ? 0 : 1;
    rat += '<row r="' + r + '">' + celula('A' + r, (nivel === 1 ? '    ' : '') + rot, e) + celula('B' + r, v, nivel === 1 ? 3 : 5) + celula('C' + r, total ? v / total : 0, nivel === 1 ? 4 : 6) + '</row>';
  });
  const sheet2 = CAB + '<worksheet ' + NS + '><sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="34" customWidth="1"/>' +
    '<col min="2" max="3" width="22" customWidth="1"/></cols><sheetData>' + rat + '</sheetData></worksheet>';

  const estilos = CAB + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="' + NUM_DATA + '" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="' + NUM_DATA + '" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rel = (id, tipo, alvo) => '<Relationship Id="' + id + '" Type="' + R + '/' + tipo + '" Target="' + alvo + '"/>';
  const rels = (...r) => CAB + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + r.join('') + '</Relationships>';
  const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
  const arquivos = {
    '[Content_Types].xml': CAB + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="' + CT + 'sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + CT + 'worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="' + CT + 'worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="' + CT + 'styles+xml"/><Override PartName="/xl/pivotTables/pivotTable1.xml" ContentType="' + CT + 'pivotTable+xml"/>' +
      '<Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="' + CT + 'pivotCacheDefinition+xml"/></Types>',
    '_rels/.rels': rels(rel('rId1', 'officeDocument', 'xl/workbook.xml')),
    'xl/workbook.xml': CAB + '<workbook ' + NS + '><bookViews><workbookView activeTab="1"/></bookViews><sheets><sheet name="' + xml(nome) + '" sheetId="1" r:id="rId1"/><sheet name="Rateio" sheetId="2" r:id="rId2"/></sheets>' +
      '<pivotCaches><pivotCache cacheId="1" r:id="rId4"/></pivotCaches></workbook>',
    'xl/_rels/workbook.xml.rels': rels(rel('rId1', 'worksheet', 'worksheets/sheet1.xml'), rel('rId2', 'worksheet', 'worksheets/sheet2.xml'),
      rel('rId3', 'styles', 'styles.xml'), rel('rId4', 'pivotCacheDefinition', 'pivotCache/pivotCacheDefinition1.xml')),
    'xl/styles.xml': estilos,
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/sheet2.xml': sheet2,
    'xl/worksheets/_rels/sheet2.xml.rels': rels(rel('rId1', 'pivotTable', '../pivotTables/pivotTable1.xml')),
    'xl/pivotTables/pivotTable1.xml': tabela,
    'xl/pivotTables/_rels/pivotTable1.xml.rels': rels(rel('rId1', 'pivotCacheDefinition', '../pivotCache/pivotCacheDefinition1.xml')),
    'xl/pivotCache/pivotCacheDefinition1.xml': cache,
  };
  return new Blob([zip(arquivos)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ZIP sem compressão (o XLSX é um ZIP; o Excel aceita "stored")
const TAB_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TAB_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(arquivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  let pos = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff], u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [nome, texto] of Object.entries(arquivos)) {
    const n = enc.encode(nome), d = enc.encode(texto), c = crc32(d);
    const comum = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034b50), ...comum]);
    partes.push(local, n, d);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...comum, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), n);
    pos += local.length + n.length + d.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0), qt = Object.keys(arquivos).length;
  const fim = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(qt), ...u16(qt), ...u32(tamCentral), ...u32(pos), ...u16(0)]);
  return new Blob([...partes, ...central, fim]);
}
// planilha de uma aba só (sem tabela dinâmica), com cabeçalho em negrito, filtro e colunas formatadas:
// planilhaSimples({aba, cabecalho: [...], linhas: [[...]], tipos: ['data'|'moeda'|'pct'|'texto'|'numero', ...], larguras: [...]}) -> Blob
// 'data': 'AAAA-MM-DD' vira data do Excel (dd/mm/aaaa)
export function planilhaSimples({ aba, cabecalho, linhas, tipos = [], larguras = [] }) {
  const nome = String(aba).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
  const serial = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 + 25569 : null; };
  const estilo = (i) => (tipos[i] === 'data' ? 2 : tipos[i] === 'moeda' ? 3 : tipos[i] === 'pct' ? 4 : 0);   // pct = fração (0,9257 → 92,57%)
  let dados = '<row r="1">' + cabecalho.map((h, i) => celula(letra(i) + '1', h, 1)).join('') + '</row>';
  linhas.forEach((l, k) => {
    const r = k + 2;
    dados += '<row r="' + r + '">' + l.map((v, i) => celula(letra(i) + r, tipos[i] === 'data' ? serial(v) ?? v : v, estilo(i))).join('') + '</row>';
  });
  const cols = cabecalho.map((_, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (larguras[i] || 16) + '" customWidth="1"/>').join('');
  const sheet = CAB + '<worksheet ' + NS + '><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' + cols + '</cols><sheetData>' + dados + '</sheetData><autoFilter ref="A1:' + letra(cabecalho.length - 1) + (linhas.length + 1) + '"/></worksheet>';
  const estilos = CAB + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rel = (id, tipo, alvo) => '<Relationship Id="' + id + '" Type="' + R + '/' + tipo + '" Target="' + alvo + '"/>';
  const rels = (...r) => CAB + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + r.join('') + '</Relationships>';
  const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
  return new Blob([zip({
    '[Content_Types].xml': CAB + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="' + CT + 'sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + CT + 'worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="' + CT + 'styles+xml"/></Types>',
    '_rels/.rels': rels(rel('rId1', 'officeDocument', 'xl/workbook.xml')),
    'xl/workbook.xml': CAB + '<workbook ' + NS + '><sheets><sheet name="' + xml(nome) + '" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': rels(rel('rId1', 'worksheet', 'worksheets/sheet1.xml'), rel('rId2', 'styles', 'styles.xml')),
    'xl/styles.xml': estilos,
    'xl/worksheets/sheet1.xml': sheet,
  })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
