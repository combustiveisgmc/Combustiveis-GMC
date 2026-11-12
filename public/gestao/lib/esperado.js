// "Esperado" por dia da semana: o gasto (ou litros) não se espalha igual pelos dias do mês — nas 12 semanas até 09/11/2026,
// domingo teve ~R$ 21 mil, segunda ~68 mil, terça a sexta ~89 mil e sábado ~72 mil por dia. Comparar pelos dias corridos
// (total ÷ dias, orçado × dia/dias do mês, "mesmos dias do mês anterior") faz o mês parecer acima ou abaixo só pelo
// calendário. Aqui cada dia vale o que aquele dia da semana costuma valer.
// Feriados não são reconhecidos (um feriado num dia útil fica abaixo do esperado).

export const SEMANAS = 12;
const dow = (dia) => new Date(dia * 864e5).getUTCDay();   // dia = dias desde 1970 (UTC); 0 = domingo

// média por dia de cada dia da semana nas `semanas` semanas antes de `antesDe` (exclusive)
// linhas: [{dia, ...}]; valor(l) = o que somar (despesa, litros…)
export function pesosSemana(linhas, antesDe, valor, semanas = SEMANAS) {
  const ini = antesDe - semanas * 7, soma = new Array(7).fill(0);
  for (const l of linhas) if (l.dia >= ini && l.dia < antesDe) soma[dow(l.dia)] += valor(l) || 0;
  return soma.map((s) => s / semanas);
}

// soma dos pesos dos dias [de, ate] (inclusive)
export function pesoDosDias(pesos, de, ate) {
  let s = 0;
  for (let d = de; d <= ate; d++) s += pesos[dow(d)];
  return s;
}

// fração do mês já "vencida" até o dia `ate`, pelo peso de cada dia da semana (no lugar de dias corridos ÷ dias do mês)
export function fracaoDoMes(pesos, inicioMes, ate, fimMes) {
  const total = pesoDosDias(pesos, inicioMes, fimMes);
  return total > 0 ? pesoDosDias(pesos, inicioMes, ate) / total : (ate - inicioMes + 1) / (fimMes - inicioMes + 1);
}
