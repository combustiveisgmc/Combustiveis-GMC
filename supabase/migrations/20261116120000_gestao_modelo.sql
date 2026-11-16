-- Modelo relacional da gestão de combustível (16/11/2026, pedido do usuário: "reestruture todos os bancos de dados,
-- criando as tabelas de cadastros, dados, etc."; objetivo: tirar a dependência das planilhas).
--
-- Schema `gestao`: cadastros únicos (unidade, veículo, motorista, posto, combustível, fornecedor, base/tanque) e os
-- dados ligados a eles por chave (abastecimentos, compras, preços, metas, orçamento...). O espelho das planilhas e do
-- D1 continua em `public` (scripts/supabase_sync.py e supabase_d1.py) e é a origem da carga (scripts/gestao_carga.py),
-- até o site e o vigia gravarem direto aqui. Documentação: docs/BANCO.md.
-- Acesso só pela chave secreta: RLS ligado e nenhuma política para anon/authenticated.

create schema if not exists gestao;
comment on schema gestao is 'Modelo relacional da gestão de combustível (docs/BANCO.md). Carga: scripts/gestao_carga.py';

-- =====================================================================================================================
-- CADASTROS
-- =====================================================================================================================
create table gestao.empresas (
  id          smallint generated always as identity primary key,
  nome        text not null unique,                 -- RAJA LOG, KEMIGAS
  cnpj        text check (cnpj ~ '^\d{14}$')
);

create table gestao.unidades (
  id            integer generated always as identity primary key,
  nome          text not null unique,               -- como no centro de custo (INFORMAÇÃO ADICIONAL 3): RAJA JEQUIE
  nome_curto    text,                               -- como no orçamento: Jequié
  centro_custo  text unique,                        -- código Protheus: 0203001
  empresa_id    smallint references gestao.empresas(id),
  operacional   boolean not null default true,      -- false: ADM, DIRETORIA, retiradas
  ativa         boolean not null default true
);
-- todos os jeitos de escrever a unidade nas planilhas (JEQUIÉ, JEQUIE, Jequié...) -> unidade
create table gestao.unidade_apelidos (
  apelido     text primary key,                     -- sem acento, maiúsculo (scripts/gestao_normalizar.py chave)
  unidade_id  integer not null references gestao.unidades(id) on delete cascade,
  origem      text
);

create table gestao.combustiveis (
  id     smallint generated always as identity primary key,
  nome   text not null unique,                      -- DIESEL S10, ARLA 32, GASOLINA COMUM...
  grupo  text not null check (grupo in ('diesel','arla','gasolina','etanol','gnv','outro'))
);

create table gestao.emissoras (                     -- de onde vem o abastecimento
  id    text primary key check (id in ('ticket','truckpag','veloe','vibra','bomba','manual')),
  nome  text not null
);

create table gestao.veiculos (
  id                   integer generated always as identity primary key,
  placa                text not null unique check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  categoria            text,                         -- CAVALO, CARRETA, TRUCK, TOCO, BITRUCK, 3/4, PICAPE
  marca                text,
  modelo               text,
  ano_fabricacao       smallint,
  unidade_id           integer references gestao.unidades(id),
  situacao             text not null default 'ativo' check (situacao in ('ativo','desabilitado','vendido')),
  meta_km_l            numeric(6,3),
  ponto_critico_km_l   numeric(6,3),
  capacidade_tanque_l  numeric(8,2),
  autonomia_km         numeric(10,3),
  familia              text,                         -- CAMINHAO, SUV... (da transação)
  tipo_frota           text,
  cadastrado           boolean not null default true, -- false: placa só apareceu nos abastecimentos
  atualizado_em        timestamptz not null default now()
);
-- placa em cada sistema quando difere (antiga x Mercosul): aba Placas MERCOSUL
create table gestao.veiculo_placas_sistema (
  veiculo_id  integer not null references gestao.veiculos(id) on delete cascade,
  sistema     text not null check (sistema in ('protheus','base','ticket','truckpag','veloe')),
  placa       text not null,
  primary key (veiculo_id, sistema)
);
create table gestao.veiculo_metas (                  -- meta de consumo por mês (Base.xlsx > Metas x mes)
  veiculo_id  integer not null references gestao.veiculos(id) on delete cascade,
  mes         date not null check (extract(day from mes) = 1),
  meta_km_l   numeric(6,3) not null,
  unidade_id  integer references gestao.unidades(id),
  primary key (veiculo_id, mes)
);
create table gestao.cartoes (                        -- situação do cartão de cada emissora por veículo
  veiculo_id     integer not null references gestao.veiculos(id) on delete cascade,
  emissora_id    text not null references gestao.emissoras(id),
  situacao       text not null check (situacao in ('ativo','perdido','aguardando envio','envio para base','cancelado','bloqueado','outro')),
  atualizado_em  timestamptz not null default now(),
  primary key (veiculo_id, emissora_id)
);

create table gestao.motoristas (
  id             integer generated always as identity primary key,
  nome           text not null,
  usuario        text unique check (usuario ~ '^\d{6}$'),   -- login da área do motorista
  matricula      bigint,
  unidade_id     integer references gestao.unidades(id),
  situacao       text not null default 'ativo' check (situacao in ('ativo','desligado','historico')),
  codigo_ticket  bigint,
  id_truckpag    bigint,
  cadastrado     boolean not null default true,              -- false: nome só apareceu nos abastecimentos
  atualizado_em  timestamptz not null default now()
);
create unique index motoristas_nome_historico on gestao.motoristas (nome) where not cadastrado;
comment on table gestao.motoristas is 'Sem CPF, nascimento, CNH nem senhas dos cartões (regra de 12/11/2026)';

create table gestao.postos (
  id         integer generated always as identity primary key,
  nome       text not null,
  cidade     text,
  uf         char(2),
  endereco   text,
  bairro     text,
  latitude   double precision check (latitude between -90 and 90),
  longitude  double precision check (longitude between -180 and 180),
  tipo       text not null default 'externo' check (tipo in ('externo','interno','cais')),
  unique nulls not distinct (nome, cidade, uf)
);
create table gestao.posto_codigos (                  -- código do estabelecimento em cada emissora
  emissora_id  text not null references gestao.emissoras(id),
  codigo       bigint not null,
  posto_id     integer not null references gestao.postos(id) on delete cascade,
  primary key (emissora_id, codigo)
);

create table gestao.rotas (                          -- Gestão de negociações > ROTAS
  id          integer generated always as identity primary key,
  unidade_id  integer references gestao.unidades(id),
  nome        text not null,
  unique nulls not distinct (unidade_id, nome)
);
create table gestao.rota_postos (
  rota_id       integer not null references gestao.rotas(id) on delete cascade,
  posto_nome    text not null,
  posto_id      integer references gestao.postos(id),
  cidade        text,
  uf            char(2),
  contato       text,
  nome_contato  text,
  primary key (rota_id, posto_nome)
);

create table gestao.fornecedores (                   -- fornecedores das bombas internas
  id    integer generated always as identity primary key,
  nome  text not null unique,
  cnpj  text check (cnpj ~ '^\d{14}$')
);
create table gestao.fornecedor_atendimentos (        -- quem vende o quê para qual praça
  fornecedor_id   integer not null references gestao.fornecedores(id) on delete cascade,
  combustivel_id  smallint not null references gestao.combustiveis(id),
  praca           text not null,                     -- JEQUIE, SP, BELEM, GV, SALVADOR
  ativo           boolean not null default true,
  cnpj            text check (cnpj ~ '^\d{14}$'),      -- CNPJ da filial que atende a praça
  primary key (fornecedor_id, combustivel_id, praca)
);

create table gestao.bases (                          -- bombas internas e cais da Vibra
  id          integer primary key,                   -- mesmo id do D1 (bomba_bases); históricas a partir de 1001
  nome        text not null unique,
  posto_id    integer references gestao.postos(id),
  unidade_id  integer references gestao.unidades(id),
  tipo        text not null check (tipo in ('interna','cais')),
  ativa       boolean not null default true,
  apelidos    text[] not null default '{}'           -- como a base aparece na planilha de compras (Jequié, Kemigas GV...)
);
create table gestao.tanques (
  id              integer generated always as identity primary key,
  base_id         integer not null references gestao.bases(id) on delete cascade,
  combustivel_id  smallint not null references gestao.combustiveis(id),
  capacidade_l    numeric(10,2),
  unique (base_id, combustivel_id)
);
create table gestao.tanque_medicoes (                -- régua: o estoque recomeça da última medição
  id           integer generated always as identity primary key,
  tanque_id    integer not null references gestao.tanques(id) on delete cascade,
  medido_em    timestamp not null,
  volume_l     numeric(12,3) not null,
  preco_medio  numeric(10,4),
  unique (tanque_id, medido_em)
);

-- =====================================================================================================================
-- DADOS
-- =====================================================================================================================
create table gestao.abastecimentos (
  id                bigint generated always as identity primary key,
  chave             text not null unique,            -- placa|data e hora|combustível (+#n), a mesma do espelho
  emissora_id       text not null references gestao.emissoras(id),
  codigo_transacao  bigint,                          -- do cartão; NÃO é único
  data_hora         timestamp not null,              -- hora local
  placa             text not null,                   -- como veio (às vezes não é placa: VAZAMENTO, LAVAGEM...)
  veiculo_id        integer references gestao.veiculos(id),
  motorista_nome    text,
  motorista_id      integer references gestao.motoristas(id),
  matricula         text,
  unidade_id        integer references gestao.unidades(id),   -- centro de custo (INFORMAÇÃO ADICIONAL 3)
  empresa_id        smallint references gestao.empresas(id),  -- NOME REDUZIDO
  codigo_cliente    bigint,
  posto_id          integer references gestao.postos(id),
  base_id           integer references gestao.bases(id),       -- bomba interna/cais
  combustivel_id    smallint not null references gestao.combustiveis(id),
  litros            numeric not null,
  preco_litro       numeric,
  valor             numeric,
  hodometro         numeric(16,2),
  km_rodados        numeric(16,2),
  km_por_litro      numeric(16,4),
  servico           text,
  forma_transacao   text,                            -- POS, WEB...
  numero_cartao     text,
  responsavel       text,
  info_adicional    jsonb not null default '{}',     -- informações adicionais 1, 2, 4 e 5 e o que mais vier do cartão
  linha_planilha    integer,                         -- linha atual na Base_copia (só enquanto a planilha existir)
  atualizado_em     timestamptz not null default now()
);
create index abastecimentos_data on gestao.abastecimentos (data_hora);
create index abastecimentos_veiculo_data on gestao.abastecimentos (veiculo_id, data_hora);
create index abastecimentos_unidade_data on gestao.abastecimentos (unidade_id, data_hora);
create index abastecimentos_posto on gestao.abastecimentos (posto_id);
create index abastecimentos_base_data on gestao.abastecimentos (base_id, data_hora) where base_id is not null;

create table gestao.abastecimento_correcoes (        -- histórico do Editar abastecimentos (alteracoes_base_copia)
  id            bigint primary key,
  placa         text,
  data_hora     timestamp,
  acao          text,
  campos        jsonb,
  antes         jsonb,
  usuario       text,
  criado_em     timestamptz,
  estado        text,
  aplicada_em   timestamptz
);

create table gestao.compras_combustivel (            -- NFs dos tanques (Movimentações e planilha de compras)
  id               integer generated always as identity primary key,
  tanque_id        integer not null references gestao.tanques(id),
  tipo             text not null default 'compra' check (tipo in ('compra','ajuste')),
  fornecedor_id    integer references gestao.fornecedores(id),
  fornecedor_nome  text,
  cnpj             text,
  nf               text,
  emissao          date,
  recebido_em      timestamp,
  vencimento       date,
  litros           numeric(12,3) not null,
  valor            numeric(14,2),
  observacao       text,
  origem           text not null check (origem in ('site','planilha')),
  origem_id        bigint,                            -- id em bomba_movimentacoes / linha da planilha
  usuario          text,
  unique (origem, origem_id)
);
create table gestao.rateio_inicio (
  tanque_id      integer primary key references gestao.tanques(id) on delete cascade,
  desde          timestamp not null,
  placa          text,
  ja_rateado_l   numeric(12,3) not null default 0,
  usuario        text,
  atualizado_em  timestamptz
);
create table gestao.rateio_centro_custo (            -- centro de custo corrigido por abastecimento no rateio
  chave          text primary key,                   -- placa|minuto|litros×100
  unidade_id     integer references gestao.unidades(id),
  centro_custo   text not null,
  usuario        text,
  atualizado_em  timestamptz
);
create table gestao.rateio_validacoes (
  compra_id    integer primary key references gestao.compras_combustivel(id) on delete cascade,
  usuario      text,
  validado_em  timestamptz,
  dados        jsonb
);

create table gestao.precos_negociados (              -- negociações com os postos externos
  id               integer generated always as identity primary key,
  data             date not null,
  unidade_id       integer references gestao.unidades(id),
  posto_nome       text not null,
  posto_id         integer references gestao.postos(id),
  cidade           text,
  uf               char(2),
  combustivel_id   smallint not null references gestao.combustiveis(id),
  emissora_id      text references gestao.emissoras(id),
  plataforma       text,                             -- como veio (TICKETLOG, TRUCKPAG, VELOE, IDENTIFICAÇÃO)
  tipo             text check (tipo in ('minimo','polo')),
  valor            numeric(10,4),
  orientacao       text,                             -- AVISO: "SEMPRE COMPLETAR", "LITRAGEM MINIMA PARA PERNOITE"...
  contato          text,
  novo_contato     boolean,
  observacao       text,
  transacao_ref    timestamp,                        -- data da última transação usada para o preço
  linha_planilha   integer
);
create index precos_negociados_posto on gestao.precos_negociados (posto_id, combustivel_id, data);

create table gestao.precos_fornecedores (            -- preço das bombas internas (Negociação bomba interna)
  id              integer generated always as identity primary key,
  data            date not null,
  fornecedor_id   integer not null references gestao.fornecedores(id),
  combustivel_id  smallint not null references gestao.combustiveis(id),
  praca           text not null,
  preco           numeric(10,4),
  preco_fob       numeric(10,4)
);
create index precos_fornecedores_busca on gestao.precos_fornecedores (praca, combustivel_id, data);

create table gestao.anp_precos (                     -- ANP: preço de revenda por município e mês
  mes                   date not null,
  uf                    char(2) not null,
  municipio             text not null,
  produto               text not null,
  regiao                text,
  postos_pesquisados    integer,
  preco_medio           numeric(10,4),
  desvio_padrao         numeric(10,4),
  preco_minimo          numeric(10,4),
  preco_maximo          numeric(10,4),
  coef_variacao         numeric(10,4),
  primary key (mes, uf, municipio, produto)
);

create table gestao.contratos_anp (                  -- contratos de diesel do cliente (praça x data base)
  id             integer primary key,                -- mesmo id do D1
  praca          text not null,                      -- Betim, Olinda, Maceió... (não é a unidade)
  uf             char(2),
  unidade_id     integer references gestao.unidades(id),
  data_contrato  date,
  produto        text,
  observacao     text,
  ativo          boolean not null default true
);

create table gestao.orcamento (                      -- Banco_Orçamento_Despesas_Frota > Base_Metas
  unidade_id  integer not null references gestao.unidades(id),
  natureza    text not null,                         -- COMBUSTIVEL CAMINHAO, ARLA, KM, PNEUS...
  mes         date not null check (extract(day from mes) = 1),
  valor       numeric not null,
  primary key (unidade_id, natureza, mes)
);

create table gestao.transacoes_negadas (
  id                 integer generated always as identity primary key,
  data_hora          timestamp,
  placa              text,
  veiculo_id         integer references gestao.veiculos(id),
  motorista          text,
  codigo_transacao   bigint,
  posto_nome         text,
  cidade             text,
  uf                 char(2),
  combustivel        text,
  litros             numeric(12,3),
  motivo             text,
  classificacao      text,
  pagamento          text,
  negociacao         boolean,
  dados              jsonb not null default '{}'      -- demais colunas do relatório
);

create table gestao.km_viradas (                     -- hodômetro que virou 1 milhão
  placa        text not null,
  dia          date not null,
  usuario      text,
  criado_em    timestamptz,
  primary key (placa, dia)
);

-- ---------------- Programa PRIME ----------------
create table gestao.prime_meses (
  mes           date primary key check (extract(day from mes) = 1),
  situacao      text,
  parametros    jsonb,
  resultado     jsonb,
  fechado_por   text,
  fechado_em    timestamptz,
  atualizado_em timestamptz
);
create table gestao.prime_notas (
  mes           date not null,
  motorista     text not null,
  motorista_id  integer references gestao.motoristas(id),
  nota          numeric(6,2),
  motivo        text,
  usuario       text,
  criado_em     timestamptz,
  primary key (mes, motorista)
);
create table gestao.prime_abastecimentos (           -- abastecimento tirado/trocado de motorista no PRIME
  chave           text primary key,
  mes             date,
  entra           boolean,
  motivo          text,
  aviso           text,
  motorista       text,
  motorista_para  text,
  usuario         text,
  criado_em       timestamptz
);

-- ---------------- acesso e operação do portal ----------------
create table gestao.funcoes (
  id           integer primary key,
  nome         text not null unique,
  descricao    text,
  permissoes   text[] not null default '{}'
);
create table gestao.usuarios (
  id             integer primary key,
  usuario        text not null unique,
  nome           text not null,
  papel          text not null check (papel in ('admin','gestor')),
  ativo          boolean not null default true,
  excluido       boolean not null default false,
  funcao_id      integer references gestao.funcoes(id),
  permissoes     text[] not null default '{}',
  trocar_senha   boolean not null default false,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz
);
comment on table gestao.usuarios is 'Sem o hash da senha: o login continua no D1 até o site sair da Cloudflare';
create table gestao.usuario_bases (                  -- bases da bomba que o login vê (vazio = todas)
  usuario_id  integer not null references gestao.usuarios(id) on delete cascade,
  base_id     integer not null references gestao.bases(id) on delete cascade,
  primary key (usuario_id, base_id)
);
create table gestao.notificacoes (
  id             integer primary key,
  nome           text not null,
  tipo           text not null,
  ativa          boolean not null default true,
  condicao       jsonb not null default '{}',
  mensagem       text,
  nivel          text,
  destinatarios  jsonb,
  repetir        text,
  criado_por     text,
  criado_em      timestamptz,
  atualizado_em  timestamptz
);
create table gestao.alertas_cartoes (                -- "estou sem cartão" dos motoristas
  id            integer primary key,
  criado_em     timestamptz,
  placa         text,
  veiculo_id    integer references gestao.veiculos(id),
  emissoras     text[],
  motorista     text,
  observacao    text,
  estado        text,
  resolvido_em  timestamptz,
  resolvido_por text,
  nota          text
);

-- ---------------- controle da carga ----------------
create table gestao.carga (
  id            integer generated always as identity primary key,
  iniciada_em   timestamptz not null default now(),
  terminada_em  timestamptz,
  linhas        jsonb,                               -- linhas por tabela
  conferencia   jsonb,                               -- totais origem x destino
  pendencias    jsonb                                -- o que não casou (placas, motoristas, postos, unidades)
);

-- RLS em todas as tabelas (sem política: só a chave secreta)
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'gestao' loop
    execute format('alter table gestao.%I enable row level security', t.tablename);
  end loop;
end $$;
