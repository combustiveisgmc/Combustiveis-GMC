# Programa PRIME — como funciona hoje e especificação da tela

> **Situação (03/11/2026):** a tela foi construída e publicada (`#/programa-prime`, migração 0021). As seções 3 e 4 têm as decisões e o que falta.

Análise feita em 03/11/2026 com o fechamento de **setembro/2026**:
`Fechamento\Campanha combustivel\Programa PRIME\2026\Fechamento Setembro\Parametros Campanha (com km).xlsx`,
`...\Abastecimentos.xlsx` e a exportação da telemetria `data.xlsx`. As planilhas foram lidas em cópia; nada foi alterado.

---

## 1. Como o fechamento é feito hoje (planilhas)

### 1.1 Arquivos
| Arquivo | Papel |
|---|---|
| `Abastecimentos.xlsx`, aba **"Abastecimentos Junho"** (o nome ficou de junho, os dados são do mês fechado) | Os abastecimentos de diesel que **entram** no PRIME. Colunas: Data, Motorista, Placa, Km Rodado, Hodômetro, Meta, Média real, Litros, % Tanque, Despesa, R$ Litro, Econ. Litros, Posto, CAMPANHA (vazia), UNIDADE, Mês, Litros se 95%, **Litros se Meta** (= km ÷ meta). Abas "Motoristas" e "Placas" são tabelas dinâmicas de apoio (contagem por faixa). |
| `data.xlsx` (exportação da telemetria SS) | Ranking da telemetria: **RANK, CONDUTOR, PONTOS, HORAS, MÉDIA KM/L, ESTRELAS** (estrelas em emoji). No fim: "Filtros aplicados: Data ≥ 01/09/2026 e antes de 01/10/2026". Formato de exportação com texto dentro das células e sem endereço de linha: leitores comuns (openpyxl) não leem; é preciso ler o XML. |
| `Parametros Campanha (com km).xlsx` | O fechamento. Abas **Base** (resultado por motorista e encarregado + tabelas de prêmio), **PONT SS** (a exportação da telemetria colada + ajustes manuais) e **KM SS** (outra exportação da telemetria, com KM e os itens da nota: marcha lenta, freada brusca etc.). Liga por vínculo externo em `Abastecimentos.xlsx` e `Pontuação resumida SS.xlsx`. |

### 1.2 Quais abastecimentos entram
- **Setembro:** o portal tem 1.266 abastecimentos de diesel; a planilha do PRIME tem **1.236**. Todos os 1.236 casam 1 a 1 com o portal (data + placa + hodômetro), e **30 foram tirados** (as linhas são apagadas, não marcadas; a coluna CAMPANHA fica vazia).
- Os 30 tirados em setembro, por padrão aparente:
  - **Motorista coringa** (JSR9658, 2): sem motorista real.
  - **Veículo administrativo** (RVW1H65, centro de custo RAJA ADM, 2).
  - **Caminhão novo / primeiro abastecimento** (km 0 ou hodômetro de 100 a 1.830: NZE1815, HIB6357, UAF3I02 ×3).
  - **Todos os abastecimentos de um motorista** (PVH7C31, Ronie de Souza Barbosa, Ilhéus, 5).
  - **Abastecimentos parciais / de valor redondo** (100, 150, 200, 300 L) em posto externo, principalmente no fim do mês (30/09).
  - **Abastecimentos com km fora do normal** (TMZ8H55 2.286 km com 175 L) e outros casos pontuais.
- **O KM do abastecimento tirado passa para o seguinte da mesma placa** (visto em TJQ8J37: 12/09 saiu com 461 km; 14/09 ficou 722 + 461 = **1.183 km**). Os litros **não** são somados. Só houve 1 caso em setembro, porque nos outros o seguinte também saiu ou não existia.
- **Troca de motorista à mão:** PKG7936 em 29/09 está como Ademir no portal e como **Jordaene dos Santos Silva** no PRIME.
- Os nomes são escritos de formas diferentes entre portal, telemetria e planilha (Gonçalves/Goncalves, Nadson Costa/Nadson Santos Costa, Motorista/"Mostorista" Coringa). Por isso a comparação precisa ser sem acento e com uma tabela de apelidos.
- A **meta** de cada abastecimento é a meta da placa (igual à do portal em 100% dos casos de setembro).

### 1.3 Nota da telemetria (SS) por motorista
- **PONTOS** da exportação = **PONTUAÇÃO FINAL** (aba Base, coluna C, por XLOOKUP do nome na PONT SS).
- **Ajuste manual frequente:** em setembro, **23** dos 126 motoristas da exportação tiveram a nota trocada por um valor redondo. Exemplos: Denis Neves Siqueira 82,22 → 50; Jonas Daniel Gonçalves 102,04 → 80; Alan Borges −22,92 → 70.
- **47 motoristas sem telemetria** receberam nota manual (40, 50, 60, 70, 80, 90 ou 100). Um deles, Everton da Costa Passos Junior, ficou com 0.
- 9 nomes da exportação não estão na Base: saíram ("SAIU …"), "NÃO INFORMADO", Lio Neto e outros.
- **Estrelas** pela nota: ≥ 90 → 5★ · ≥ 80 → 4★ · ≥ 70 → 3★ · ≥ 60 → 2★ · ≥ 50 → 1★ · abaixo → nenhuma.
- **Prêmio SS (motorista):** nota ≥ 100 → **R$ 250** · ≥ 90 → **R$ 150** · ≥ 80 → **R$ 100** · abaixo → 0.

### 1.4 Combustível por motorista
- **Km rodado (F)** = soma do Km Rodado dos abastecimentos do motorista que entraram.
- **Meta média (G)** = Σ km ÷ Σ (km ÷ meta), a meta ponderada pelo km.
- **Média real (H)** = Σ km ÷ Σ litros.
- **% Meta (I)** = H ÷ G.
- **Faixa de KM (L):** ≥ 8.500 · ≥ 7.000 · ≥ 5.500 · ≥ 4.000 · ≥ 2.500 · ≥ 1.000 · abaixo de 1.000 = sem prêmio.
- **Prêmio combustível (J)**, por faixa de km × % da meta:

| Faixa de km | ≥ 105% | ≥ 100% | ≥ 95% | < 95% |
|---|---|---|---|---|
| 8.500+ | R$ 1.400 | R$ 1.050 | R$ 700 | 0 |
| 7.000+ | R$ 1.200 | R$ 900 | R$ 600 | 0 |
| 5.500+ | R$ 1.000 | R$ 750 | R$ 500 | 0 |
| 4.000+ | R$ 700 | R$ 500 | R$ 300 | 0 |
| 2.500+ | R$ 500 | R$ 350 | R$ 200 | 0 |
| 1.000+ | R$ 300 | R$ 200 | R$ 100 | 0 |

  A planilha usa "km **>** 8.500" na primeira faixa e "≥" nas outras. **Decisão (03/11):** na tela, todas as faixas usam **≥**.
- **Ponto ponderado (K)** = nota SS × km (usado para a nota dos encarregados).
- **Unidade (A)** = unidade do último abastecimento do motorista no mês.

### 1.5 Encarregados (7)
| Encarregado | Unidades |
|---|---|
| Antônio Marcos | Jequié + Vitória da Conquista + Ilhéus |
| Aldemir Bonfim | Salvador |
| Fábio Pontes | Recife |
| Fábio Silva | Log Granel + Goiânia |
| Trindade Filho | Log Belém + Maranhão |
| Guilherme Almeida | Serra + Governador Valadares + Kemigas GV |
| Aibson Gomes | Teixeira de Freitas + Kemigas Nanuque |

- **Nota SS do encarregado** = Σ (nota × km) ÷ Σ km dos motoristas das unidades dele.
- **Prêmio SS:** ≥ 100 → R$ 750 · ≥ 90 → R$ 500 · ≥ 80 → R$ 400.
- **% da meta** das unidades = Σ km ÷ Σ litros contra Σ km ÷ Σ (km ÷ meta).
- **Prêmio combustível:** ≥ 105% → R$ 600 · ≥ 100% → R$ 400 · ≥ 95% → R$ 300.
- A coluna Y lista outros nomes (Alessandro Strelow, Cartão Treinamento, Itamar Quito Roseno, "Não informado", Guilherme de Almeida Rodrigues, Caio Coelho Dutra, Luciana Miranda Coelho), que parecem ser os **excluídos do ranking**.

### 1.6 Resultado de setembro
- **164 motoristas** na Base.
- Prêmio SS dos motoristas: R$ 11.450 (7 × 250, 32 × 150, 49 × 100).
- Prêmio combustível dos motoristas: R$ 20.300 (37 premiados).
- Encarregados: R$ 1.600 de SS + R$ 300 de combustível.

### 1.7 KM da telemetria
- A aba **KM SS** vem da exportação **"Pontuação resumida"** da telemetria (o `data (1).xlsx` enviado em 03/11).
  - Colunas: CONDUTOR, IDEAL, IRREGULAR, HORAS, **KM**, INÉRCIA, VERDE, EXTRA ECON., TEMPO B. VELOCIDADE, MARCHA LENTA, PARADO ACELERANDO, AMARELA, VERMELHA, BANGUELA, BATENDO TRANSMISSÃO, EXCESSO DE VELOCIDADE, EMBREAGEM, FREADA BRUSCA, ACELERAÇÃO BRUSCA, TOLERÂNCIA, PONTUAÇÃO ATINGIDA, DESCONTOS, **PONTUAÇÃO FINAL**.
  - No fim vêm uma linha "Total" e o "Filtros aplicados" com o período. É o mesmo formato de exportação (texto nas células, sem endereço de linha).
- **Esse arquivo sozinho basta:** tem os mesmos 126 motoristas do ranking, e a PONTUAÇÃO FINAL é igual aos PONTOS do ranking em 100% dos casos. Ainda traz KM e horas. As estrelas a tela calcula pela nota.
- **KM da telemetria × km dos abastecimentos (setembro, 117 motoristas com os dois):**

  | Cobertura | Motoristas |
  |---|---|
  | menos de 50% | 32 |
  | 50–80% | 16 |
  | 80–95% | 27 |
  | 95–105% | 23 |
  | mais de 105% | 19 |

  47 motoristas da Base não aparecem na telemetria.
- Hoje o prêmio usa o **km dos abastecimentos**. A telemetria serve de conferência (coluna KM SS ÷ KM BI da PONT SS).

### 1.8 Notas trocadas à mão × cobertura da telemetria
- As **23 notas trocadas à mão** em setembro são **todas** de motoristas cuja telemetria cobriu **menos de 50%** do km rodado nos abastecimentos:

  | Motorista | Telemetria | Nota usada | Km telemetria | Km abastecimentos |
  |---|---|---|---|---|
  | Alan Borges | −22,92 | 70 | 0 | 7.016 |
  | Denivaldo | 36,59 | 70 | 3 | 5.769 |
  | Denis Neves | 82,22 | 50 | 1.399 (28%) | 4.914 |
  | Antonio George | 91,49 | 70 | 1.881 (49%) | 3.832 |

- Nesses casos a nota da telemetria não representa o mês do motorista e é substituída. Ela sobe ou desce, então parece vir de outra avaliação.
- Outros **9** motoristas com cobertura abaixo de 50% **não** foram trocados (ex.: Nadson Santos Costa, 7%, ficou com 66,26).
- **Regra confirmada (03/11):**
  - A frota usa **mais de uma telemetria**. Carros **sem a SS** recebem a pontuação **manual**. O mesmo vale para o motorista que rodou em carros com e sem SS no mês.
  - O **km do prêmio é sempre o dos abastecimentos**. O KM da telemetria serve só para comparar.
  - Se o **KM da telemetria for menor que 50% do km dos abastecimentos**, a pontuação da telemetria **não vale**: o motorista se identificou em pouco do que rodou. A nota usada passa a ser a manual.

---

## 2. Especificação da tela "Programa PRIME"

### Visão geral
Tela da gestão para fechar o PRIME de um mês:
1. escolher quais abastecimentos entram;
2. anexar a exportação da telemetria;
3. ajustar notas;
4. ver o ranking e os prêmios dos motoristas e encarregados.

**Regra de ouro:** o que for decidido aqui **não altera** a Operação por motorista nem a Base. Afeta só o PRIME e a área do motorista (Minha média), onde o abastecimento tirado aparece com um aviso.

**Onde fica no menu:** Operacional → **Programa PRIME** (`#/programa-prime`). Permissões novas:
- `programa-prime`: ver;
- `programa-prime-editar`: decidir abastecimentos, anexar e ajustar notas.

### Layout (grade de 12 colunas do portal, design v2)
```
[Mês do fechamento ▾] [Situação: Em aberto | Fechado]               [Fechar mês] [Baixar planilha]
┌ Números (.apoio-topo) ───────────────────────────────────────────────────────────────────────┐
│ Motoristas no ranking · Abastecimentos que entram / tirados · Prêmio SS · Prêmio combustível · Total │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
[Ranking] [Abastecimentos (30 a decidir)] [Telemetria] [Encarregados] [Parâmetros]   ← abas (.segmentado)
```
- **Aba Ranking** (padrão): tabela por motorista com posição, motorista (unidade embaixo), nota SS e estrelas (com ✎ quando ajustada), prêmio SS, km rodado (origem embaixo: "abastecimentos" ou "telemetria"), meta média, média real, % da meta (pílula da faixa de cor), faixa de km, prêmio combustível e total. Clicar na linha abre os abastecimentos do motorista no mês.
- **Aba Abastecimentos:** os diesel do mês, mais os km que vieram de abastecimentos tirados no fim do mês anterior, com filtros Período (o mês, fixo), Placa e Estabelecimento, e o resto em "Mais filtros" (Motorista, Unidade, Situação PRIME). Cada linha tem um seletor **Entra / Não entra**. O "Não entra" pede o **motivo** em lista (Motorista coringa, Veículo administrativo, Caminhão novo, Abastecimento parcial, KM fora do normal, Outro) e um **aviso ao motorista** em texto (pré-preenchido pelo motivo). Mostra também a regra do km: "os 461 km passam para o abastecimento de 14/09". Ações em lote: "Tirar selecionados" e "Voltar selecionados". A troca de motorista ("Este abastecimento conta para:") também fica aqui.
- **Aba Telemetria:** área para **anexar a exportação "Pontuação resumida"** da SS (arrastar e soltar ou escolher o arquivo; aceita também a do ranking, que não traz KM). Depois, uma tabela com **todos os motoristas cadastrados no portal** (Cadastros → Motoristas, ativos, sem a lista de excluídos), cruzados por nome sem acento:
  - Pontuação final, horas e **KM da telemetria** (somente leitura), e a **cobertura** (km da telemetria ÷ km dos abastecimentos).
  - **Origem da nota** (calculada): "Telemetria" quando está na exportação com cobertura ≥ 50%; "Manual" quando a cobertura é menor que 50% ou o motorista não tem telemetria (carros sem SS). Na nota manual, a nota da telemetria aparece riscada ("não vale: 28% do km").
  - **Nota usada** (campo editável, vazio quando o motorista não está na exportação). A nota usada vem da telemetria até alguém editar; quem edita grava o motivo e fica no histórico.
  - Estrelas calculadas a partir da nota usada.
  - Avisos: "na telemetria e sem cadastro" (com "Vincular a…") e "cadastrado sem telemetria".
- **Aba Encarregados:** os 7 com as unidades de cada um (editável), nota ponderada, % da meta das unidades e os prêmios.
- **Aba Parâmetros:** as tabelas de prêmio (SS, combustível por faixa de km × % meta, encarregados) e a lista de excluídos do ranking, editáveis e **gravadas por mês**. Mudar não altera meses já fechados.

### Tokens do design system
| Token | Uso |
|---|---|
| `--cartao`, `--cartao-2` | Cartões, linha selecionada |
| `--verde`, `--verde-suave` | Ação principal, "Entra", seleção |
| `--meta-100/95/90/abaixo` (+ `-txt`) | Pílula do % da meta (mesmas 4 faixas do portal) |
| `--pilula-alerta` | "Nota ajustada" e "aguardando telemetria" |
| `#CC1F1F` (`.sit-ruim`) | "Não entra" |
| `--e-4`/`--e-5`, `--r` | Espaços e cantos (padrão dos painéis) |
| Fonte mínima 12 px; números `tabular-nums` | — |

### Componentes
| Componente | Variante | Notas |
|---|---|---|
| `criarFiltros` | Período fixo no mês; Placa e Estabelecimento à mostra | Igual aos outros painéis |
| `seloCartao` | — | Cartão do abastecimento |
| `metaHtml` / `faixaMeta` | Pílula | % da meta |
| `.segmentado` | Entra / Não entra | Por linha, e em lote no cabeçalho |
| Campo de anexo | Arrastar e soltar + botão | Lê o XML da exportação no navegador (o mesmo cuidado do `planilhaSimples`) |
| Campo de nota | `input inputmode=decimal` | Vazio = sem nota (não conta como 0) |
| Janela de motivo | `dialog.dialogo` | X no canto e rodapé fixo (automáticos) |
| `botoesMaisMenos` | 50 por vez | Ranking e abastecimentos |

### Estados e interações
| Elemento | Estado | Comportamento |
|---|---|---|
| Mês | Em aberto | Tudo editável por quem tem `programa-prime-editar` |
| Mês | Fechado | Tudo só leitura; "Reabrir" só para administrador, com motivo |
| Linha de abastecimento | Não entra | Linha riscada e apagada, pílula vermelha com o motivo; o km passa para o seguinte (mostrado na linha seguinte: "+461 km de 12/09") |
| Seletor Entra/Não entra | Gravando | Desabilitado até a API responder; em erro volta e mostra `ctx.aviso` |
| Anexo | Arquivo errado | "Esse arquivo não é a exportação da telemetria (faltam as colunas CONDUTOR e PONTOS)" |
| Anexo | Mês diferente | Lê o "Filtros aplicados" do rodapé; se não for o mês escolhido, avisa e pede confirmação |
| Anexo | Já existe | "Substituir a telemetria de setembro?" As notas editadas à mão continuam |
| Nota | Editada | Pílula "ajustada" com a nota original no título ("telemetria: 82,22") |
| Ranking | Sem dados | "Anexe a telemetria e confira os abastecimentos para ver o ranking." |

### Telas
| Tamanho | Mudanças |
|---|---|
| > 1024 px | Tabelas inteiras, sem rolar para o lado (regra do portal) |
| 768–1024 px | Ranking esconde meta média e faixa de km (colunas de apoio) |
| < 768 px | Ranking e abastecimentos viram cartões; o seletor Entra/Não entra fica embaixo de cada cartão |

### Área do motorista (Minha média)
- Abastecimento que **não entra** no PRIME: mostra uma etiqueta "Fora do PRIME" e o **aviso** escrito pela gestão (ex.: "Abastecimento parcial: o PRIME conta o próximo completo").
- O KM que passou para o abastecimento seguinte aparece nele ("inclui 461 km de 12/09").
- Mostra a **nota SS e as estrelas** do mês (decisão de 03/11). O valor do prêmio **não** aparece para o motorista.

### Dados (proposta técnica)
- **D1:**
  - `prime_meses` (mês, situação, parâmetros JSON, fechado_por/em);
  - `prime_abastecimentos` (mês, chave do abastecimento = data + placa + hodômetro, entra 0/1, motivo, aviso, motorista_para, quem/quando);
  - `prime_telemetria` (mês, nome, pontos, horas, média, estrelas, arquivo, enviado_por/em);
  - `prime_notas` (mês, motorista, nota, motivo, quem/quando);
  - `prime_apelidos` (nome da telemetria → nome do cadastro).
- Os abastecimentos vêm do `abastecimentos.json` (Base). A Operação por motorista continua igual. A Minha média lê as decisões do mês para mostrar os avisos.
- A planilha baixada reproduz a aba Base: mesmas colunas e totais, para conferir com o modelo atual.

### Casos extremos
- Motorista com abastecimento mas fora do cadastro (ex.: "Mostorista Coringa"): aparece em "a vincular" e não entra no ranking até ser vinculado ou excluído.
- Motorista sem nenhum abastecimento no mês (Everton Jr.): fica no ranking só com a nota SS, sem prêmio de combustível.
- Abastecimento tirado sem outro da mesma placa depois dele no mês: o km vai para o primeiro abastecimento da placa no mês seguinte (decisão de 03/11). Enquanto o mês seguinte não tiver abastecimento, aparece "km aguardando o próximo abastecimento".
- Abastecimento corrigido depois no Editar abastecimentos (Base_copia): a chave muda. A tela precisa avisar quando a decisão ficar sem abastecimento correspondente.
- Nota negativa na telemetria (−22,92): aceita e mostra; sem estrela e sem prêmio.

### Acessibilidade
- O seletor Entra/Não entra é um grupo de dois botões com `aria-pressed`; o motivo é obrigatório e lido pelo leitor de tela.
- Ordem do foco: mês → abas → filtros → tabela → ações em lote.
- O resultado de anexar é anunciado (`role="status"`): "126 motoristas lidos · 9 sem cadastro".

---

## 3. Decisões (respostas de 03/11/2026)
1. **Tirar abastecimento é sempre decisão manual.** A tela não sugere nem marca nada sozinha; só mostra os dados (km, litros, hodômetro, posto) para decidir.
2. ~~O km do abastecimento tirado passa para o seguinte da mesma placa.~~ **Substituída em 04/11/2026:** o abastecimento tirado sai **só da média** (km/L e % da meta); o km rodado dele continua contando no km do mês dele (faixa do prêmio), porque o motorista rodou de qualquer forma.
3. **Anexo da telemetria:** a exportação **"Pontuação resumida"** (com KM). A tela também aceita a do ranking, mas só ela não traz KM.
5. **A lista de excluídos** (coluna Y: Alessandro Strelow Siqueira, Cartão Treinamento, Itamar Quito Roseno, Não informado, Guilherme de Almeida Rodrigues, Caio Coelho Dutra, Luciana Miranda Coelho) **não aparece no ranking**. Fica na aba Parâmetros, editável.
6. **Minha média:** o motorista vê a **nota, as estrelas e os avisos** dos abastecimentos tirados. O valor do prêmio não aparece.
7. **Todas as faixas de km usam ≥.**

4. **Nota da telemetria × nota manual:**
   - Cobertura (km telemetria ÷ km abastecimentos) de **50% ou mais**: vale a nota da telemetria.
   - Cobertura **abaixo de 50%** e nota da telemetria **abaixo de 80** (não dá prêmio): **mantém a nota da telemetria** (ex.: Nadson, 7%, 66,26).
   - Cobertura **abaixo de 50%** e nota da telemetria **de 80 ou mais** (daria prêmio): a nota da telemetria **não vale** e a nota é **manual**.
   - **Sem telemetria** (carros sem SS): nota **manual**.
   - Nota manual pendente: o campo fica vazio e destacado.
9. **Ninguém fica sem nota:** **Fechar mês** só fica disponível quando todos os motoristas do ranking têm nota. Enquanto faltar alguma, a tela mostra "N notas faltando" com um link para elas.
8. **Km do prêmio de combustível:** sempre o dos abastecimentos. O KM da telemetria aparece só para comparação (coluna "Cobertura").
10. **Km mínimo (11/11/2026):** quem rodou **menos de 1.000 km** no mês (km dos abastecimentos) **perde todos os prêmios** (telemetria e combustível). Continua no ranking com nota e estrelas. Parâmetro editável na aba Parâmetros.
11. **Deflatores (12/11/2026):** o relatório de premiados de quem cuida do pagamento diz quem recebeu de fato. Nos meses com esse relatório, o prêmio gravado é o pago e quem estava premiado na conta e não recebeu (`naoRecebeu`) sai também da economia do Resultado PRIME, como quem ficou abaixo de 95% da meta. **Atualizado em 13/11/2026:** a fonte certa é a lista "Premiados sem deflatores" (fechamento do Motorista 5 Estrelas: prêmio positivo, desconto de deflatores zero e sem bloqueio). Só recebe quem está nela; qualquer deflator tira o prêmio do mês. Aplicada de jan a set/2026 (out sem lista); o prêmio gravado é o V. bruto da lista e o da conta fica em `premioAntesPagamento`. **Corrigido em 19/11/2026 (pedido do usuário):** quem não recebeu por deflator continua na economia do Resultado PRIME (economizou de qualquer forma); os deflatores só tiram o prêmio. Antes e depois dos deflatores, a economia é a mesma e a diferença no resultado é o prêmio que não foi pago.

## 4. Perguntas em aberto
- Em setembro, pela regra 4, quatro motoristas com cobertura abaixo de 50% ficaram com nota da telemetria que dá prêmio: Amilcar Bassora 91,96 (33%), Claudio Tomaz 91,61 (19%), Iram Bezerra 86,75 (11%) e Leandro Santos de Oliveira 89,22 (15%). Na tela eles cairiam em nota manual. Itamar Quito Roseno (88,87, 39%) está na lista de excluídos.

## 5. Ajustes de 04/11/2026
- **Parcial no fim do mês:** abastecimento tirado como "Abastecimento parcial" que é o último da placa no mês faz o 1º da placa no mês seguinte sair da média sozinho ("Completou o abastecimento parcial"). O km de cada um fica no mês dele (parcial de 30/10: km em outubro; o 1º de novembro: km em novembro). O automático não tem "Voltar"; só "Trocar motorista". Para desfazer, mude o motivo do parcial.
- **Troca de motorista:** grava no PRIME na hora e manda a coluna L para a Base_copia (fila do Editar abastecimentos). Sem acesso de editar abastecimentos, fica só no PRIME (a tela avisa).
- **Tempo real:** abastecimentos que só chegaram pela API dos cartões entram no PRIME (selo API).
- **Área do motorista:** a média, a % da meta, a economia e o mês a mês não contam os abastecimentos fora do PRIME; "Km rodados" conta todos.
- **Km rodado (regra de 04/11):** todos os abastecimentos do mês do motorista, os tirados também. A média usa só os que entram.
- **Telas:** ranking, abastecimentos e telemetria com rolagem própria e cabeçalho fixo; detalhe com hodômetro; % da meta 00,00%.
- **Revisão de design (04/11):** topo com selo "N sem nota"; pílula só para abastecimento fora; telemetria anexada mostrada na área de anexo; Parâmetros com prêmio dos encarregados (encSS, encComb), estrelas e coberturaMin editáveis; celular com ranking em cartão rotulado.

## Seleção de abastecimentos (09/11/2026)
Igual à Operação por motorista (`.sel-flutuante`). Linhas `tr[data-ab]` do detalhe do ranking e da aba Abastecimentos: clique seleciona (de novo no único: limpa), Ctrl soma/tira, Shift pega o intervalo da mesma tabela; Enter/Espaço pelo teclado. Linha selecionada: fundo `--verde-suave` + marca verde de 3 px.
Barra fixa embaixo: **média real** = Σ km do PRIME ÷ Σ litros (só os que entram); **meta** = Σ km ÷ Σ (km ÷ meta da placa) dos que têm meta; % da meta colorida (`metaHtml`); km e litros; litros de economia ou gastos a mais; quantos tirados do PRIME ficaram fora da média; "Limpar seleção". A seleção vale para as duas abas e limpa ao trocar o mês.

## Resultado PRIME (11/11/2026)
Menu: grupo "Programa PRIME" com "Fechamento abastecimentos" (#/programa-prime) e "Resultado PRIME" (#/prime-resultado, apresentável; permissão programa-prime). Só meses fechados (resultado gravado no fechamento).
- Faixa 1: motoristas no ranking (premiados), abastecimentos, prêmio telemetria, prêmio combustível, encarregados, premiação total.
- Faixa 2: litros economizados (ou gastos a mais) com % da meta, economia em R$ (preço médio), resultado (economia − premiação, pílula bom/ruim), retorno (economia ÷ premiação; "—" se a economia for negativa), economia de quem bateu a meta.
- Barras por unidade (escala comum): economia em R$ (verde; vermelha se negativa) e premiação; saldo à direita.
- Tabela por unidade + total: motoristas (premiados), km, litros, % da meta, litros economizados, preço médio (da unidade; "média geral" se não houver), economia R$, prêmio motoristas, prêmio encarregado, premiação, resultado, retorno.
- Painel "Antes x depois dos deflatores" (13/11/2026): faixa com prêmio que não foi pago, economia em R$, premiação total, resultado (pílula com a diferença) e retorno, cada um com o "antes" embaixo; tabela ordenável por unidade (não receberam, economia/premiação/resultado antes e depois, diferença no resultado) com total. Antes = conta do portal (`premioAntesPagamento`; quem não recebeu ainda na economia); depois = lista de premiados sem deflatores. Encarregados iguais nos dois. Mês sem lista (out/2026): aviso de que antes e depois são iguais.
- Regras: litros economizados = Σ(litrosMeta − litros) só dos motoristas com % da meta ≥ o menor pctMeta do mês (95%; 11/11/2026: quem fica abaixo não recebe, o gasto a mais não é custo do programa); preço médio = Σ valor ÷ Σ litros de todo o diesel do mês com o centro de custo da unidade; prêmio do encarregado dividido entre as unidades dele pela quantidade de motoristas.

## Handoff Spec: ajustes de alinhamento — Fechamento abastecimentos e Resultado PRIME (11/11/2026)

### Overview
As duas telas do grupo Programa PRIME tinham a faixa de indicadores com itens em formatos diferentes (uns com rótulo e número
na mesma linha, outros quebrados em duas) e, no Resultado PRIME, o valor de cada barra invadia a coluna do saldo e os textos de
apoio saíam no tamanho dos números. A tabela do resultado não ordenava.

### Layout
| Bloco | Regra |
|---|---|
| Faixa de indicadores (Fechamento `#pr-resumo`, Resultado `#prr-topo` e `#prr-economia`) | `.apoio.apoio-pilha`: rótulo sempre em cima, número embaixo, colunas iguais (`minmax(150px,1fr)`, auto-fit); texto de apoio em `.apoio-det` embaixo do número |
| Linha do mês (Fechamento) | caixa do mês, selo "Fechado" e "por …" na mesma linha, centrados verticalmente (`.pr-mes{align-items:center}`) |
| Barras "Economia x premiação por unidade" | grade fixa por unidade: nome (140–200 px) · pares de barra · saldo (140 px); cada par = valor (110 px, à direita) + trilha (1fr) com a barra dentro: o valor nunca passa da trilha nem entra no saldo |
| Tabela "Resultado por unidade" | `lib/tabela.js` (ordenável); espaço interno 6 px por lado para as 13 colunas caberem sem rolagem lateral a partir de ~1280 px |

### Design Tokens Used
| Token | Value | Usage |
|---|---|---|
| `--e-4` / `--e-5` | espaçamentos do tema | padding e vãos da `.apoio-pilha` |
| `--texto-2` | tema | rótulos e `.apoio-det` (12 px/400) |
| `--verde` | #41B06E | barra de economia positiva |
| `--ruim` | tema (vermelho) | barra de economia negativa ("gastou mais que a meta") |
| #6C8EBF | azul | barra de premiação |
| `--cartao-2` | tema | trilho das barras |
| `--borda` | tema | linha entre unidades nas barras |

### Components
| Component | Variant | Props | Notes |
|---|---|---|---|
| Faixa de indicadores | `.apoio.apoio-pilha` | `htmlApoio([{rot, val, det}])` | `det` em `<small class="apoio-det">` ou pílula (`statusHtml`/`metaHtml`, 12 px, sem quebrar) |
| Tabela ordenável | `tabelaOrdenavel(tabela, {colunas, padrao, vazio})` | coluna `{id, rot, n, v, html, cls}` | **padrão para tabelas novas** (ver MASTER.md) |
| Legenda das barras | `.prr-legenda` | Economia, Gastou mais que a meta, Premiação, Saldo | "Saldo = economia − premiação" à direita |

### States and Interactions
| Element | State | Behavior |
|---|---|---|
| Cabeçalho da tabela | Clique | ordena pela coluna; de novo, inverte (▲/▼, `aria-sort`); números começam do maior |
| Cabeçalho | Hover | texto verde (como as outras tabelas) |
| Total (rodapé) | — | fixo, não entra na ordenação |
| Mês sem fechamento | Vazio | "… ainda não foi fechado" na tabela; faixas e barras vazias |

### Responsive Behavior
| Breakpoint | Changes |
|---|---|
| ≥ 1280 px | faixa em 6 colunas; tabela inteira sem rolagem |
| 760–1280 px | faixa quebra em 3 colunas; tabela com rolagem lateral |
| < 760 px | barras: nome e saldo em cima, os dois pares embaixo (valor 96 px); faixa em 2 colunas (< 600 px) |

### Edge Cases
- **RAJA ADM**: fora da tela inteira (não participa do PRIME): `UNIDADES_FORA` em `dashboards/prime-resultado.js`.
- **Economia negativa**: barra vermelha com o valor "−R$ …"; Retorno "—" ("sem economia no mês").
- **Valor longo** (−R$ 65.213): cabe na coluna de 110 px; a barra escala dentro da trilha.

### Accessibility Notes
- Botões de cabeçalho com foco; depois de ordenar o foco fica no mesmo cabeçalho (Enter de novo inverte).
- `aria-sort` em cada `th` ordenável; a cor das barras nunca é a única informação (o valor está escrito).
