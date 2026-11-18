# CHECKLIST

Toda demanda pedida para o portal, quebrada em seções. `[x]` = feito e conferido; `[ ]` = falta.
Cada demanda nova entra na seção dela (ou numa seção nova) no mesmo dia em que for pedida; quando terminar, é marcada
e vai para o `CHANGELOG.md`. Regra de toda alteração: rodar `npm run verificar` (lint + testes) e criar os testes do que mudou.

## 0. Regras permanentes

- [x] Responder em português.
- [x] Nunca editar a `Base.xlsx` nem o `.pbix` (só leitura); nunca mexer no site antigo dos motoristas.
- [x] Nunca mostrar tokens, senhas ou credenciais; nenhum CPF, nascimento ou CNH de motorista guardado.
- [x] Testes só locais (usuário de teste apagado depois) ou em cópia das planilhas.
- [x] Atualizar `briefing.md`, `LEIA-ME.md`, `CHANGELOG.md` e este checklist a cada alteração.
- [x] Enviar toda alteração para o GitHub (`combustiveisgmc/Combustiveis-GMC`), sem dados nem segredos.
- [x] Toda alteração: lint (`npm run lint`), testes novos e `npm test` (16/11/2026).

## 1. Banco de dados: sair das planilhas

### 1.1 Estrutura (16/11/2026)
- [x] Espelho das planilhas e do D1 no Supabase (`public`, 12/11/2026).
- [x] Modelo relacional `gestao`: cadastros (empresas, unidades + apelidos, veículos, placas por sistema, metas, cartões, motoristas,
      postos + códigos por emissora, rotas, fornecedores, bases, tanques, medições) e dados (abastecimentos, correções, compras/NFs,
      rateio, preços negociados, preços das bombas, ANP, contratos, orçamento, transações negadas, km viradas, PRIME, acessos,
      notificações, avisos de cartão).
- [x] Carga do espelho para o modelo (`scripts/gestao_carga.py`) numa transação, com conferência dos totais e lista de pendências.
- [x] Regras de normalização testadas (`scripts/gestao_normalizar.py`, `tests/py/test_gestao.py`).
- [x] Relatório do que não está alinhado (`docs/BANCO.md` > Desalinhamentos).
- [x] Vigia rodar a carga do modelo depois de cada sincronização do espelho (17/11/2026; de 5 em 5 minutos).

### 1.2 Corrigir os dados desalinhados (ver docs/BANCO.md)
- [x] Senhas dos portais dos cartões: decisão do usuário (17/11) = manter na planilha (cartão físico é necessário); o modelo não guarda.
- [x] Unidades padronizadas no modelo (apelidos); RAJA SÃO PAULO = RAJA LOG GRANEL (modelo + 2 motoristas na planilha, 17/11).
- [x] Carros do ADM cadastrados (18, exportação da Ticket, 17/11); Kemigas não entram (vão ser vendidos).
- [x] Placa VENDIDO volta a aparecer nos filtros do site (18/11), para enxergar vendido abastecendo.
- [x] PVH7231 → PVH7C31 no banco e nos dados do site (18/11; Base.xlsx não alterada).
- [ ] Placas VENDIDO com abastecimento recente e cartão Ticket ativo (HIB6D61, HFD9063, OPF3G97...): usuário revisar.
- [ ] Motoristas: listas dos últimos 10 dias enviadas (17/11); usuário decidir cadastrar / desligar.
- [x] Coordenadas "sem vírgula" = formato da planilha (não erro); 187 postos localizados pelo endereço (17/11).
- [x] Postos sem coordenada: decisão do usuário (18/11) = ficam sem; ele cadastra pelo Mapa de calor quando precisar.
- [x] Situação das placas: 258 ATIVA e 21 VENDIDO (sem unidade/categoria), 17/11. Usuário vai revisar ativas x vendidas.
- [ ] Corrigir as placas divergentes entre Base, Ticket, TruckPag e Veloe (aba Placas MERCOSUL).
- [x] Lançamentos sem placa (VAZAMENTO, LAVAGEM...) = desperdício (`abastecimentos.tipo`), 17/11.
- [x] Compras das bombas pelas planilhas de rateio no modelo, só bases ativas: 590 NFs (17/11).
- [ ] Bases de Belém, Salvador, São Paulo, GV e Ilhéus no site (Bomba interna) para as compras aparecerem em Movimentações.

### 1.3 Trocar as fontes do site e do vigia (próximas fases)
- [ ] Site ler os dashboards do modelo (`gestao.abastecimentos` e cadastros) em vez do JSON gerado das planilhas.
- [x] Cadastro de placas lido do banco e gravado nele na hora (a fila para a planilha continua), 17/11.
- [ ] Motoristas, cartões e postos no banco; depois tirar a fila para a planilha.
- [ ] Editar abastecimentos, Consolidador e lotes D-1 gravarem direto em `gestao.abastecimentos`.
- [ ] APIs dos cartões (Ticket/TruckPag) gravarem direto em `gestao.abastecimentos`.
- [ ] Negociações de postos e preços das bombas gravarem direto no modelo.
- [ ] Bomba interna (bases, tanques, movimentações, rateio) no modelo.
- [ ] Planilhas viram só exportação (Excel gerado do banco) e deixam de ser fonte.
- [ ] Site fora da Cloudflare (Lovable, domínio próprio), quando o banco estiver provado.

## 2. Qualidade
- [x] ESLint com regras de erro (`.eslintrc.json`), 0 erros.
- [x] Testes: rateio, estoque, notificações, cadastros/cartões/permissões (JS); normalização, conversões e migração (Python).
- [ ] Limpar os 4 avisos de variável sem uso (cadastros/[tipo].js, mapa-calor.js, programa-prime.js).
- [ ] Testes das APIs (functions/) com D1 local.

## 3. Bomba interna
- [x] Estoque por base e tanque, movimentações (NFs), rateio das NFs com início por tanque.
- [x] Cais da Vibra (CAANA, CALAN, CABET, CAAPE) como base; rateio do portal a partir das planilhas (16/11/2026).
- [x] NFs 1722159 e 1722862 do Cais Viana lançadas sem mudar o volume (16/11/2026).
- [x] Cartões do Estoque alinhados (16/11/2026).
- [ ] Lançar as próximas NFs de Betim, Suape e Uberlândia (faltam ~2 notas de Uberlândia desde 31/10).

- [x] Preço do Rateio das NFs só com a nota fechada, travado depois, sem contar API e Base em dobro e no combustível certo (17/11).

## 4. Notificações
- [x] Avisos no canto da tela (estoque baixo, comunicado, preço alto, falta cartão, base desatualizada).
- [x] Estoque baixo com várias bases (16/11/2026).

## 5. Cartões e APIs
- [x] Integração Ticket/TruckPag em tempo real e D-1; tardios do fim de semana.
- [x] Unidade da placa vira o centro de custo na TruckPag; 27 placas alinhadas (16/11/2026).
- [ ] 10 placas VENDA sem centro de custo VENDA na TruckPag (decidir).
- [ ] Ticket: edição de veículo pela API não documentada; Veloe sem API.

## 6. Programa PRIME
- [x] Fechamento, Resultado, km mínimo, deflatores e comparativo antes x depois (13/11/2026).
- [ ] Lista de outubro/2026 quando chegar.

## 7. Postos e preços
- [x] Rodada de preços sem as bombas internas e os cais (13/11/2026).
- [x] Preço postos externos: posto bloqueado não compara com o preço antigo (13/11/2026).
- [ ] 9 postos com coordenada suspeita (briefing > Pendências).

## 8. Cadastros e abastecimentos
- [x] Motoristas sem dados pessoais; área do motorista com usuário de 6 números.
- [x] Editar abastecimentos: valor, data e hora editáveis.
- [ ] Apagar o acesso do motorista de teste 111444 (oferecido, sem resposta).
- [ ] Aviso de senha inicial dos motoristas (opções oferecidas, sem resposta).

## 9. Mapas e dashboards
- [x] Mapa de calor como no BI (zoom automático, postos escolhidos sozinhos, colunas Data/Placa/Cartão).
- [ ] Placa desabilitada escondida no roteirizador (a lista vem da aba Metas).
- [ ] 41 fábricas de clientes com localização aproximada para conferir.

## 10. Ajustes de tela (18/11/2026)
- [x] Tirar os ícones "i" dos cartões do Início.
- [x] Três pontinhos do gráfico "Média km/L contra a meta" → ícone de abrir o painel responsável.
- [x] Sino de notificações ao lado da conta, só alertas críticos no canto da tela; configuração das notificações dentro do sino
      (tela saiu do grupo Operacional).
- [x] Varredura de textos sobrepostos/estourando (Operação por motorista > mais informações, Preço x ANP e demais telas, 1440 e 390 px).
- [x] Barra de rolagem maior que a página em Evolução placas.
- [x] Pontos de cada dia no gráfico de gasto diário do Início.
- [x] "Gerenciar acessos" fora do menu lateral (fica na Conta).
- [x] Engrenagem de configuração das opções dentro de cada cadastro (placas, motoristas, postos, contratos, fornecedores, cartões).
