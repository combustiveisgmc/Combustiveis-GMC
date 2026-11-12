# Dashboard "Divisão por cartão" (#/divisao-cartoes)

Réplica da página **"% Cartão"** do `Gestão do combustível.pbix` (lida em 09/11/2026), com outro nome, no grupo
Dashboards. Sistema visual: `design-system/MASTER.md` (cartões, filtros, tabelas e dicas iguais aos outros painéis).

## Handoff Spec: Divisão por cartão

### Overview
Mostra como os litros abastecidos nos **postos externos** se dividem entre os cartões (Ticket, TruckPag, Veloe, Vibra):
mês a mês, dia a dia dentro de um mês, por mês com a média dos 6 meses anteriores e por fornecedor. Serve para
acompanhar se o volume está indo para o cartão certo (ex.: compromisso de volume com a Ticket).

### O que veio do Power BI (página "% Cartão")
| Power BI | No portal |
|---|---|
| Filtro da página: TIPO ESTABELECIMENTO = POSTO DE COMBUSTIVEL ou CAIS VIBRA | igual: só postos externos (bomba interna fica fora) |
| Segmentação **Ano** | filtro **Período** (abre em "Este ano") |
| Segmentação **Centro de custo** (INFORMACAO ADICIONAL 3) | filtro **Centro de custo** |
| Gráfico de cima (litros Cartão Físico × média 6 meses × 50% Ticket) | **não entra** (pedido do usuário) |
| Gráfico 100% empilhado por **dia**, mês atual | "Dia a dia" (mês escolhido; abre no último mês do período) |
| Gráfico 100% empilhado por **mês** | "Mês a mês" |
| Matriz Ano › Mês › Forma de pagamento: Litros no mês, Média 6 meses, 50% Ticket | "Litros por mês e cartão" (linha do mês abre os cartões) |
| Tabela Fornecedor × Litros | "Litros por fornecedor" |

FORMA DE PAGAMENTO → cartão como no resto do portal: "Cartao Fisico" = Ticket; vazia antes de 28/06/2025 = Ticket;
vazia depois = "Sem informação".

**Média 6 meses e 50% Ticket: fora** (eram do gráfico de cima, que não foi adotado — decisão do usuário em 09/11/2026).
A matriz fica com Litros e % do mês.

### Layout (grade de 12 colunas, como os outros painéis)
1. Barra de filtros + etiquetas: Período, Cartão, Centro de custo, Fornecedor, Combustível, Placa.
2. Faixa de apoio (`.apoio`): Litros no período · uma pílula por cartão com a % (cor da bandeira).
3. **Mês a mês** (largura toda): colunas 100% empilhadas por mês do período (até 24), legenda clicável em cima.
4. **Dia a dia em <mês>** (largura toda): colunas 100% empilhadas por dia do mês escolhido.
5. Grade 7/5: **Litros por mês e cartão** (matriz) | **Litros por fornecedor** (busca, ordenação, páginas de 25).

### Design Tokens Used
| Token | Value | Usage |
|-------|-------|-------|
| cor Ticket | #2F7D32 | segmento/legenda/pílula (`lib/cartoes.js`) |
| cor TruckPag | #278187 | idem |
| cor Veloe | #4B2E83 | idem |
| cor Vibra | #9DC3E6 (texto #11283d) | **cor padrão da Vibra em todo o portal** (09/11/2026; antes era #B5121B fora do Consolidador) |
| sem informação | #5F6663 | idem |
| `--cartao` / `--borda` | tema | painéis |
| `.dica` | tema | caixa ao passar o mouse (igual aos outros gráficos) |
| `--texto-2` | tema | rótulos dos eixos (12 px); % dentro das colunas também 12 px |

### Components
| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Coluna 100% | `button.dc-col` | período (mês/dia), litros por cartão | altura de cada segmento = % do total da coluna; % dentro do segmento quando ≥ 8% e a coluna é larga |
| Legenda | botões `aria-pressed` | cartões do recorte | clicar filtra o cartão |
| Matriz | `table.dados` | mês (desc), cartões ao abrir: Litros, % do mês | ▸/▾ abre e fecha; total do período no rodapé |
| Fornecedores | `table.dados` | posto, cidade, litros, % do total, cartão principal | linha clicável filtra o fornecedor |

### States and Interactions
| Element | State | Behavior |
|---------|-------|----------|
| Coluna | Hover / foco | dica: data, litros totais e litros + % de cada cartão |
| Segmento | Clique | **filtra o cartão** (Cartão = esse); com cartão filtrado, os gráficos continuam com todos os cartões e o escolhido em destaque (os outros a 30%) — num 100% empilhado filtrar deixaria tudo de uma cor só |
| Legenda | Clique | igual ao segmento |
| Coluna do mês (Mês a mês) | Clique | escolhe o mês do gráfico "Dia a dia" (a coluna fica marcada) |
| Linha do mês (matriz) | Clique | abre/fecha os cartões do mês |
| Linha do cartão (matriz) | Clique | filtra o cartão |
| Linha do fornecedor | Clique | filtra o fornecedor (de novo: tira) |
| Cabeçalho das tabelas | Clique | ordena (▲/▼) |
| Qualquer filtro | Change | redesenha tudo; o endereço guarda os filtros (como nos outros painéis) |
| Painel | Sem dados | "Nenhum abastecimento em postos externos neste recorte." |

### Responsive Behavior
| Breakpoint | Changes |
|------------|---------|
| ≥ 1100 px | matriz 7/12 + fornecedores 5/12; **fornecedores com a altura da matriz** (a lista rola dentro; mínimo 220 px de lista) |
| < 1100 px | um painel por linha; lista de fornecedores com até 520 px e rolagem |
| Celular | Dia a dia com rolagem lateral (colunas de 16 px mín.); rótulos do eixo a cada 5 dias. Mês a mês: coluna < 48 px sem % dentro das cores (fica na dica) e mês curto "jan"; < 22 px, só a inicial "J" (container query em `.dc-col`) |

### Edge Cases
- **Mês em andamento**: a coluna do mês atual leva "· em andamento" na dica.
- **Dia sem abastecimento**: coluna vazia, sem dica de %.
- **Cartão novo na Base** (outro nome em FORMA DE PAGAMENTO): entra com o nome que veio e cor cinza.
- **Período longo**: Mês a mês mostra os últimos 24 meses do período.
- **Um mês só** (ex.: "Este mês"): uma coluna de no máximo 96 px, centralizada (as colunas do Mês a mês nunca passam de 96 px).

### Animation / Motion
Sem animação de entrada; o destaque do cartão muda a opacidade em 120 ms (`prefers-reduced-motion`: sem transição).

### Accessibility Notes
- Cada coluna é um botão com `aria-label` ("março de 2026: Ticket 72,10%, TruckPag 18,40%…").
- Setas ←/→ andam entre as colunas; Enter escolhe (mês) como o clique.
- Legenda com `aria-pressed`; a % também está escrita (cor nunca é a única informação).
