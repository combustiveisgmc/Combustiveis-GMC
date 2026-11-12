# Página do motorista (Minha média, /motorista/)

Especificação das partes da área do motorista. Base visual: `public/app.css` (mesmos tokens e componentes da tela
inicial) + `public/motorista/motorista.css`. Leitura no celular, na rua: textos de 14 px no mínimo, áreas de toque de
44 px ou mais.

## Handoff Spec: Menu da página do motorista (06/11/2026)

### Overview
Com senhas, postos, média, PRIME, mês a mês e abastecimentos numa tela só, o motorista rola muito e se perde. A página
passa a ter **4 partes com um menu fixo**, como num aplicativo de celular: uma coisa de cada vez, sempre a um toque.

| Aba (rótulo) | Ícone | Conteúdo | Por quê |
|---|---|---|---|
| **Média** | velocímetro | média contra a meta, litros economizados e km, Programa PRIME, mês a mês | é o que a gestão quer que ele veja: **abre sempre aqui** |
| **Histórico** | lista | os abastecimentos do mês, com o aviso de "fora do PRIME" | conferir o que foi lançado |
| **Postos** | bomba de combustível | postos autorizados (cartão da spec abaixo) | onde abastecer, na rua |
| **Senhas** | chave | senhas Ticket, TruckPag e Veloe (abrem ocultas; "Mostrar" fica lembrado no aparelho) | consulta rápida na bomba |

Rótulos curtos (1 palavra, ≤ 9 letras) para caberem em 4 colunas num celular de 360 px com texto de 14 px. O título de
cada parte (dentro da aba) diz o nome completo ("Seus abastecimentos em novembro de 2026").

A página **abre sempre na Média** (não lembra a última aba): o motorista entra para ver postos ou senhas e passa pela média
primeiro — é o objetivo de trazer os postos para cá. A aba fica no endereço (`#media`, `#historico`, `#postos`, `#senhas`):
o botão "voltar" do celular volta para a aba anterior e um link pode abrir direto numa aba.

### Layout
- Nas abas **Postos** e **Senhas** o topo fica baixo: só "Olá, …" com 18 px, sem a linha da unidade (09/11/2026).
- Topo de todas as abas: saudação "Olá, …" e a linha da unidade/último abastecimento. O seletor de **Mês** só aparece na
  Média e no Histórico (as outras não dependem do mês). A faixa "Acesso de teste" (MOTORISTA TESTE) fica acima de tudo.
- **Celular (< 760 px):** menu fixo embaixo (alcance do polegar), largura total, 4 colunas iguais; altura 64 px + a área
  segura do iPhone (`env(safe-area-inset-bottom)`); fundo `--topo`, borda de cima `--linha`. A página ganha espaço embaixo
  para o menu não cobrir o conteúdo.
- **Computador (≥ 760 px):** o mesmo menu vira uma barra de abas logo abaixo da saudação (ícone + rótulo lado a lado),
  com a aba ativa sublinhada.

### Design Tokens Used
| Token | Value | Usage |
|-------|-------|-------|
| `--topo` | #121212 | fundo do menu (celular) |
| `--linha` | #333333 | borda do menu |
| `--placa` | #41B06E | aba ativa (ícone, rótulo e marca de 3 px) |
| `--suave` | #9A9A9A | abas inativas |
| `--foco` | #6FA3FF | contorno de foco do teclado |

### Components
| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Menu | `nav.mt-nav` com 4 links `a[href="#aba"]` | aba ativa = `aria-current="page"` | links (não botões): funcionam com o "voltar" |
| Item do menu | ícone 24 px (SVG `currentColor`) + rótulo 14 px/600 | ativo / inativo | área de toque ≥ 64×48 px |
| Painel | `section.mt-aba[data-painel]` | `hidden` nas outras | conteúdo de cada aba (cartões já existentes) |

### States and Interactions
| Element | State | Behavior |
|---------|-------|----------|
| Item do menu | Inativo | `--suave` |
| Item do menu | Ativo | `--placa` + marca de 3 px (em cima no celular, embaixo no computador) |
| Item do menu | Hover (computador) | `--asfalto` |
| Item do menu | Toque | troca a aba na hora, sobe para o topo da página |
| Seletor de mês | Change | refaz Média e Histórico e continua na mesma aba |
| Página | Carregando / erro | mensagem no lugar das abas; o menu só aparece com os dados carregados |
| Sem abastecimentos | Média e Histórico | a mensagem "Ainda não encontramos abastecimentos…"; Postos e Senhas funcionam |

### Edge Cases
- **Endereço com aba que não existe** (`#xyz`): abre a Média.
- **Telas muito estreitas (320 px):** rótulos de 1 palavra cabem; o ícone continua com 24 px.
- **Teclado do celular aberto (busca de postos):** o menu fixo continua embaixo do conteúdo, sem cobrir o campo.

### Animation / Motion
Sem animação na troca de aba (instantânea; o motorista está na rua, com sinal ruim às vezes). Só a cor do item muda.

### Accessibility Notes
- `nav` com `aria-label="Menu do motorista"`; o item ativo com `aria-current="page"`.
- Ordem do foco: topo → conteúdo da aba → menu (no computador o menu vem antes do conteúdo).
- Ao trocar de aba o foco vai para o título da aba (leitor de tela anuncia onde está).
- Ícones `aria-hidden`; o rótulo sempre visível (nunca só o ícone).

## Handoff Spec: Postos autorizados na página do motorista (06/11/2026)

### Overview
Hoje os postos autorizados ficam na tela inicial do portal, aberta para qualquer pessoa. A ideia é que eles passem a
ficar só na página do motorista (a tela inicial vira login, em outra etapa), o que faz o motorista entrar e ver a média
dele. Nesta etapa os postos **aparecem também** na página do motorista; a tela inicial continua igual.

O motorista quer, na rua, achar rápido onde pode abastecer **na unidade dele**, com o cartão certo, e abrir o mapa.

### Layout (ordem na página)
1. Saudação ("Olá, …") e mês.
2. Suas senhas dos cartões.
3. **Postos autorizados** (este cartão).
4. Média contra a meta, litros e km, PRIME, mês a mês, abastecimentos.

Os postos ficam antes da média porque são o motivo de o motorista abrir a página; a lista começa recolhida (5 postos)
para a média continuar perto do topo.

Cartão `mt-cartao` (fundo `--branco`, raio `--raio`, padding 25 px, gap 12 px), conteúdo:
- Cabeçalho: título "Postos autorizados" (14 px/500, como os outros cartões) + lista suspensa da unidade à direita
  (mesmo estilo do seletor de mês: `.mt-mes select`, 44 px de altura).
- Linha "Cartões aceitos: Ticket, TruckPag, Veloe" (`--asfalto-suave`, 14 px) — os cartões dos postos da unidade escolhida.
- Busca (`.busca`, 46 px): "Procurar posto ou cidade".
- Lista `.postos` com o mesmo item da tela inicial (`.posto`: nome 16 px/600, cidade 14 px, pílula do cartão na cor da
  bandeira, aviso em faixa amarela `--faixa-fundo`, botão do mapa 48×48 à direita). Dentro do cartão o item usa
  `--superficie-2` de fundo, para se separar do fundo `--branco` do cartão.
- Rodapé: botão "Ver todos os N postos" / "Mostrar menos" (`.btn-trocar`, largura total) quando houver mais de 5.

### Design Tokens Used
| Token | Value | Usage |
|-------|-------|-------|
| `--branco` | #262626 | fundo do cartão |
| `--superficie-2` | #2E2E2E | fundo de cada posto dentro do cartão |
| `--asfalto` / `--asfalto-suave` / `--suave` | #FFF / #D0D0D0 / #9A9A9A | título / textos / contagem |
| `--placa` | #41B06E | foco da busca, unidade nos resultados de "Todas" |
| `--faixa` / `--faixa-fundo` | #F6C25E / 14% | aviso do posto |
| `--contorno` | branco 85% | bordas de busca, seletor e botões |
| `--raio` / `--raio-pilula` | 5 px / 25 px | cartão, itens / pílula do cartão |
| cores das bandeiras | Ticket #2F7D32, TruckPag #278187, Veloe #4B2E83, Identificação #1D4E9B | pílula do cartão (iguais à tela inicial) |

### Components
| Component | Variant | Props | Notes |
|-----------|---------|-------|-------|
| Seletor de unidade | `select` nativo | unidades dos postos autorizados + "Todas as unidades" | começa na unidade do cadastro do motorista; a escolha fica guardada no aparelho |
| Busca | `input[type=search]` | posto ou cidade, sem acento | com texto, mostra todos os resultados (sem limite de 5) |
| Item de posto | `.posto.com-mapa` | Posto, Cidade, Cartão, Aviso, coordenadas | em "Todas", a cidade mostra também "· Unidade" |
| Ver todos | `.btn-trocar` | N postos | só com mais de 5 e sem busca |

### Unidade do motorista → unidade dos postos
O cadastro usa o centro de custo (ex.: RAJA LOG GRANEL); a lista de postos usa nomes curtos. Regra por palavra:
BELEM→Belém, CONQUISTA→Conquista, GOIANIA→Goiânia, GOVERNADOR VALADARES/GOVAL→Governador Valadares, ILHEUS→Ilhéus,
JEQUIE→Jequié, MARANHAO→Maranhão, RECIFE→Recife, SALVADOR→Salvador, SERRA→Serra, TEIXEIRA→Teixeira,
GRANEL ou SAO PAULO→São Paulo. Sem correspondência (ex.: RAJA ADM): "Todas as unidades".

### States and Interactions
| Element | State | Behavior |
|---------|-------|----------|
| Cartão | Carregando | "Carregando postos…" (`.mensagem`) |
| Cartão | Erro | "Não foi possível carregar os postos. Verifique a internet e abra de novo." |
| Lista | Vazia (busca) | "Nenhum posto autorizado com esse nome ou cidade." |
| Lista | Vazia (unidade) | "Nenhum posto autorizado nesta unidade." |
| Item | Toque/clique | abre o Google Maps (como o botão do mapa); sem coordenadas: "Sem mapa", sem ação |
| Botão do mapa | Hover/ativo | fundo `--superficie-2` |
| Seletor | Change | redesenha a lista (volta aos 5 primeiros) e guarda a unidade |
| Busca | Input | filtra na hora; o foco continua no campo |
| Trocar o mês da média | — | a unidade, a busca e o "ver todos" continuam como estavam |

### Responsive Behavior
| Breakpoint | Changes |
|------------|---------|
| Desktop (≥760 px) | itens em grade (`auto-fill, minmax(300px,1fr)`), seletor ao lado do título |
| Celular (<760 px) | uma coluna; o seletor quebra para baixo do título e ocupa a largura toda |

### Edge Cases
- **Muitos postos** (Belém, 14): 5 + "Ver todos os 14 postos".
- **Nome longo de posto**: quebra a linha (`overflow-wrap:anywhere`), nunca corta.
- **Lista ainda não publicada no KV**: o `/postos.csv` cai no arquivo estático (mesma regra da tela inicial).
- **Sem internet**: estado de erro só neste cartão; o resto da página continua.
- **Motorista sem abastecimentos**: o cartão aparece do mesmo jeito (depois das senhas).

### Animation / Motion
Os itens usam a mesma entrada da tela inicial (`acende`, 0,3 s ease-out), só com `prefers-reduced-motion: no-preference`.

### Accessibility Notes
- Ordem do foco: seletor de unidade → busca → itens (link do mapa) → "Ver todos".
- `select` com `<label>` "Unidade"; busca com `<label>` "Procurar posto ou cidade".
- Contagem ("8 postos") em `aria-live="polite"` para o leitor de tela anunciar o resultado da busca.
- Botão do mapa: `aria-label="Abrir <posto> no mapa"`; "Ver todos" com `aria-expanded`.
- A cor da bandeira nunca é a única informação: a pílula tem o nome do cartão.
