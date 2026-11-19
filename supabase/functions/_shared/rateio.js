// Bomba interna > Rateio das NFs: as notas de compra (Movimentações) são "consumidas" pelos abastecimentos da bomba, em
// ordem (a primeira nota até acabarem os litros dela, depois a próxima). O abastecimento que passa da última gota de uma
// nota é dividido: uma parte fecha a nota, o resto abre a seguinte (como na planilha de rateio). Cada nota tem o seu
// rateio por empresa (NOME REDUZIDO) -> centro de custo (INFORMAÇÃO ADICIONAL 3) -> placa, em valor (litros × preço da
// nota) e %. O preço por litro de cada abastecimento é o da nota com mais litros dele (empate: a nota mais nova).
// Usado pela página (paginas/bomba-rateio.js) e pelo vigia (scripts/cartoes_api.mjs), para os dois fazerem a mesma conta.
const EPS = 0.005;   // litros (as notas fecham com diferença de centésimos)
const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;

// transacoes: [{id, t (ms, hora local nos campos UTC), placa, motorista, litros, reduzido, cc, ...}] de UM tanque
// notas: [{id, nf, litros, valor, quando, ...}] (compras do mesmo tanque)
// inicio: {t (ms), placa, jaRateado} ou null. O primeiro abastecimento é o de t (e placa, se dois forem no mesmo segundo);
// jaRateado = litros dele que ficaram na última nota da planilha. Se essa parte for a maior, o preço dele não muda (null).
export function ratear(transacoes, notas, inicio) {
  const ordem = [...notas].sort((a, b) => String(a.quando).localeCompare(String(b.quando)) || a.id - b.id)
    .map((n) => ({ ...n, preco: n.litros > 0 ? n.valor / n.litros : 0, partes: [], rateado: 0 }));
  const lista = [...transacoes].sort((a, b) => a.t - b.t || String(a.placa).localeCompare(String(b.placa)) || String(a.id).localeCompare(String(b.id)));
  const antes = (tr) => tr.t < inicio.t || (tr.t === inicio.t && inicio.placa && String(tr.placa).localeCompare(String(inicio.placa)) < 0);
  const resultado = [], semNota = [];
  let i = 0, primeiro = true;
  for (const tr of lista) {
    if (inicio && antes(tr)) continue;
    let resta = tr.litros || 0;
    const partes = [];
    if (inicio && primeiro && inicio.jaRateado > 0) {
      const ja = Math.min(resta, inicio.jaRateado);
      partes.push({ nota: null, anterior: true, litros: arred(ja, 3) });
      resta -= ja;
    }
    primeiro = false;
    while (resta > EPS) {
      while (i < ordem.length && ordem[i].litros - ordem[i].rateado <= EPS) i++;
      if (i >= ordem.length) { partes.push({ nota: null, litros: arred(resta, 3) }); semNota.push({ tr, litros: arred(resta, 3) }); break; }
      const n = ordem[i], uso = Math.min(resta, n.litros - n.rateado);
      n.rateado += uso; resta -= uso;
      const p = { nota: n, litros: arred(uso, 3) };
      n.partes.push({ tr, litros: p.litros, valor: p.litros * n.preco });
      partes.push(p);
    }
    // preço do abastecimento: o da nota com mais litros dele; empate fica com a mais nova
    let dona = null;
    for (const p of partes) if ((p.nota || p.anterior) && (!dona || p.litros > dona.litros - EPS)) dona = p;
    const nota = dona && dona.nota ? dona.nota : null;
    resultado.push({ tr, partes, preco: nota ? nota.preco : null, nota, dividido: partes.filter((p) => p.nota || p.anterior).length > 1 });
  }
  for (const n of ordem) {
    n.situacao = n.partes.length === 0 ? 'aguardando' : n.litros - n.rateado <= EPS ? 'fechada' : 'em uso';
    n.valorRateado = n.partes.reduce((s, p) => s + p.valor, 0);
    n.rateio = agrupar(n.partes);
  }
  return { notas: ordem, transacoes: resultado, semNota };
}

// empresa -> centro de custo -> placa, com valor e % do total da nota
export function agrupar(partes) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const empresas = new Map();
  for (const p of partes) {
    const e = p.tr.reduzido || '(sem empresa)', c = p.tr.cc || '(sem centro de custo)', pl = p.tr.placa || '(sem placa)';
    if (!empresas.has(e)) empresas.set(e, new Map());
    const ccs = empresas.get(e);
    if (!ccs.has(c)) ccs.set(c, new Map());
    const pls = ccs.get(c);
    const x = pls.get(pl) || { placa: pl, litros: 0, valor: 0 };
    x.litros += p.litros; x.valor += p.valor; pls.set(pl, x);
  }
  const pct = (v) => (total > 0 ? v / total : 0);
  return [...empresas.entries()].map(([empresa, ccs]) => {
    const centros = [...ccs.entries()].map(([cc, pls]) => {
      const placas = [...pls.values()].sort((a, b) => b.valor - a.valor).map((x) => ({ ...x, pct: pct(x.valor) }));
      const valor = placas.reduce((s, x) => s + x.valor, 0), litros = placas.reduce((s, x) => s + x.litros, 0);
      return { cc, valor, litros, pct: pct(valor), placas };
    }).sort((a, b) => b.valor - a.valor);
    const valor = centros.reduce((s, x) => s + x.valor, 0), litros = centros.reduce((s, x) => s + x.litros, 0);
    return { empresa, valor, litros, pct: pct(valor), centros };
  }).sort((a, b) => b.valor - a.valor);
}
// centro de custo -> placa, com valor e % do total da nota (a visão do Rateio das NFs)
export function agruparCC(partes) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const pct = (v) => (total > 0 ? v / total : 0);
  const ccs = new Map();
  for (const p of partes) {
    const c = p.tr.cc || '(sem centro de custo)', pl = p.tr.placa || '(sem placa)';
    if (!ccs.has(c)) ccs.set(c, new Map());
    const x = ccs.get(c).get(pl) || { placa: pl, litros: 0, valor: 0 };
    x.litros += p.litros; x.valor += p.valor; ccs.get(c).set(pl, x);
  }
  const centros = [...ccs.entries()].map(([cc, pls]) => {
    const placas = [...pls.values()].sort((a, b) => b.valor - a.valor).map((x) => ({ ...x, pct: pct(x.valor) }));
    const valor = placas.reduce((s, x) => s + x.valor, 0), litros = placas.reduce((s, x) => s + x.litros, 0);
    return { cc, valor, litros, pct: pct(valor), placas };
  }).sort((a, b) => b.valor - a.valor);
  return { centros, valor: total, litros: partes.reduce((s, p) => s + p.litros, 0) };
}
