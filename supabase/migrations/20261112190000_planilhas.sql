-- Tabelas espelho das planilhas (scripts/supabase_sync.py; tipos deduzidos dos dados de 12/11/2026).
-- Acesso só pela chave secreta (vigia e, no futuro, o site): RLS ligado e nenhuma política para anon/authenticated.

create table if not exists public.base_transacoes (
  id bigint generated always as identity primary key,
  linha integer,
  codigo_transacao bigint,
  forma_de_pagamento text,
  codigo_cliente bigint,
  nome_reduzido text,
  data_transacao timestamp,
  placa text,
  tipo_frota text,
  modelo_veiculo text,
  numero_frota text,
  ano bigint,
  matricula text,
  nome_motorista text,
  servico text,
  tipo_combustivel text,
  litros double precision,
  vl_litro double precision,
  hodometro_ou_horimetro double precision,
  km_rodados_ou_horas_trabalhadas double precision,
  km_litro_ou_litros_hora double precision,
  valor_emissao double precision,
  codigo_estabelecimento bigint,
  nome_estabelecimento text,
  tipo_estabelecimento text,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  informacao_adicional_1 text,
  informacao_adicional_2 text,
  informacao_adicional_3 text,
  informacao_adicional_4 text,
  informacao_adicional_5 text,
  forma_transacao text,
  codigo_liberacao_restricao bigint,
  serie_pos text,
  numero_cartao text,
  familia_veiculo text,
  grupo_restricao text,
  codigo_emissora bigint,
  responsavel text,
  ano_2 bigint,
  mes bigint,
  campanha text,
  cod_unid text,
  data_ref text,
  def_posto text,
  sincronizado_em timestamptz not null default now()
);
alter table public.base_transacoes enable row level security;
comment on table public.base_transacoes is 'Espelho de Base_copia.xlsx > Transações (62557 linhas em 12/11/2026)';

create table if not exists public.placas (
  id bigint generated always as identity primary key,
  linha integer,
  placa text,
  categoria text,
  unidade text,
  marca text,
  modelo text,
  ano bigint,
  meta double precision,
  ponto_critico double precision,
  cap_tanque double precision,
  auton_margem_de_seg double precision,
  situacao text,
  sincronizado_em timestamptz not null default now()
);
alter table public.placas enable row level security;
comment on table public.placas is 'Espelho de Controle_motoristas_e_placas.xlsx > Carros (290 linhas em 12/11/2026)';

create table if not exists public.motoristas (
  id bigint generated always as identity primary key,
  linha integer,
  motorista text,
  unidade text,
  usuario text,
  senha_ticket text,
  senha_truckpag text,
  senha_veloe text,
  situacao text,
  matricula bigint,
  codigo_ticket bigint,
  id_truckpag bigint,
  sincronizado_em timestamptz not null default now()
);
alter table public.motoristas enable row level security;
comment on table public.motoristas is 'Espelho de Controle_motoristas_e_placas.xlsx > Motoristas (165 linhas em 12/11/2026)';

create table if not exists public.cartoes_placas (
  id bigint generated always as identity primary key,
  linha integer,
  placa text,
  ticket text,
  truckpag text,
  veloe text,
  sincronizado_em timestamptz not null default now()
);
alter table public.cartoes_placas enable row level security;
comment on table public.cartoes_placas is 'Espelho de CONTROLE CARTÕES FROTA.xlsx > CARTÕES (189 linhas em 12/11/2026)';

create table if not exists public.placas_mercosul (
  id bigint generated always as identity primary key,
  linha integer,
  placa_protheus_referencia text,
  placa_base text,
  placa_ticketlog text,
  placa_truckpag text,
  placa_veloego text,
  sincronizado_em timestamptz not null default now()
);
alter table public.placas_mercosul enable row level security;
comment on table public.placas_mercosul is 'Espelho de CONTROLE CARTÕES FROTA.xlsx > Placas MERCOSUL (163 linhas em 12/11/2026)';

create table if not exists public.bomba_precos (
  id bigint generated always as identity primary key,
  linha integer,
  data date,
  fornecedor text,
  produto text,
  preco double precision,
  unidade text,
  preco_fob text,
  sincronizado_em timestamptz not null default now()
);
alter table public.bomba_precos enable row level security;
comment on table public.bomba_precos is 'Espelho de Negociação bomba interna.xlsx > Plan1 (2920 linhas em 12/11/2026)';

create table if not exists public.bomba_fornecedores (
  id bigint generated always as identity primary key,
  linha integer,
  fornecedor text,
  produto text,
  unidade text,
  ativo text,
  cnpj text,
  sincronizado_em timestamptz not null default now()
);
alter table public.bomba_fornecedores enable row level security;
comment on table public.bomba_fornecedores is 'Espelho de Negociação bomba interna.xlsx > Fornecedores (25 linhas em 12/11/2026)';

create table if not exists public.postos_localizacao (
  id bigint generated always as identity primary key,
  linha integer,
  nome_estabelecimento text,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  pais text,
  localizacao text,
  latitude double precision,
  longitude double precision,
  cod_posto text,
  coluna_11 text,
  sincronizado_em timestamptz not null default now()
);
alter table public.postos_localizacao enable row level security;
comment on table public.postos_localizacao is 'Espelho de LOCALIZAÇÃO DOS POSTOS.xlsx > Localização dos postos (439 linhas em 12/11/2026)';

create table if not exists public.negociacoes (
  id bigint generated always as identity primary key,
  linha integer,
  data_da_negociacao date,
  contato_da_negociacao text,
  unidade text,
  posto_negociado text,
  cidade text,
  tipo text,
  plataforma text,
  valor_negociado double precision,
  tipo_combustivel text,
  novo_contato_feito text,
  data_da_ultima_transacao_usada_para_o_preco timestamp,
  observacao text,
  aviso text,
  dias_desde_a_transacao text,
  status_atualizacao text,
  renegociacao_obrigatoria text,
  variacao_pct_vs_abastecimento_anterior double precision,
  sincronizado_em timestamptz not null default now()
);
alter table public.negociacoes enable row level security;
comment on table public.negociacoes is 'Espelho de Gestão de negociações de preço.xlsx > Base de dados de negociações (2150 linhas em 12/11/2026)';

create table if not exists public.negociacoes_rotas (
  id bigint generated always as identity primary key,
  linha integer,
  cod text,
  unidade text,
  rota text,
  posto text,
  cidade text,
  contato text,
  nome_contato text,
  sincronizado_em timestamptz not null default now()
);
alter table public.negociacoes_rotas enable row level security;
comment on table public.negociacoes_rotas is 'Espelho de Gestão de negociações de preço.xlsx > ROTAS (136 linhas em 12/11/2026)';

create table if not exists public.orcamento_metas (
  id bigint generated always as identity primary key,
  linha integer,
  unidade text,
  natureza text,
  data date,
  valor double precision,
  sincronizado_em timestamptz not null default now()
);
alter table public.orcamento_metas enable row level security;
comment on table public.orcamento_metas is 'Espelho de Banco_Orçamento_Despesas_Frota.xlsx > Base_Metas (2364 linhas em 12/11/2026)';

create table if not exists public.orcamento_unidades (
  id bigint generated always as identity primary key,
  linha integer,
  unidade text,
  inf_adicional text,
  centro_de_custo text,
  sincronizado_em timestamptz not null default now()
);
alter table public.orcamento_unidades enable row level security;
comment on table public.orcamento_unidades is 'Espelho de Banco_Orçamento_Despesas_Frota.xlsx > BD_UND (12 linhas em 12/11/2026)';

create table if not exists public.metas_mes (
  id bigint generated always as identity primary key,
  linha integer,
  placa text,
  unidade text,
  mes date,
  meta double precision,
  sincronizado_em timestamptz not null default now()
);
alter table public.metas_mes enable row level security;
comment on table public.metas_mes is 'Espelho de Base.xlsx > Metas x mes (1153 linhas em 12/11/2026)';

create table if not exists public.bomba_compras (
  id bigint generated always as identity primary key,
  linha integer,
  bomba text,
  data_compra date,
  quantidade double precision,
  vencimento_boleto date,
  fornecedor text,
  nf bigint,
  envio_bol date,
  afericao_da_bomba text,
  produto text,
  sincronizado_em timestamptz not null default now()
);
alter table public.bomba_compras enable row level security;
comment on table public.bomba_compras is 'Espelho de Base.xlsx > Bomba interna, Bomba Interna Arla (692 linhas em 12/11/2026)';

create table if not exists public.transacoes_negadas (
  id bigint generated always as identity primary key,
  linha integer,
  cliente bigint,
  nome_reduzido text,
  posto_interno text,
  codigo_transacao bigint,
  placa text,
  modelo_do_veiculo text,
  familia_do_veiculo text,
  numero_da_frota text,
  tipo_de_frota text,
  hodometro_x_horimetro text,
  informacao_adicional_1 text,
  informacao_adicional_2 text,
  informacao_adicional_3 text,
  informacao_adicional_4 text,
  informacao_adicional_5 text,
  dia_da_semana text,
  data text,
  hora text,
  servico text,
  combustivel_principal text,
  combustivel_secundario text,
  combustivel_transacao text,
  matricula bigint,
  motorista text,
  responsavel text,
  estabelecimento bigint,
  nome text,
  cidade text,
  uf text,
  r double precision,
  hodometro_informado double precision,
  km_original double precision,
  km_final double precision,
  litros_original text,
  litros_final double precision,
  km_l_original double precision,
  km_l_final double precision,
  km_l_familia_comb double precision,
  indice_km_l double precision,
  r_km double precision,
  r_km_familia_comb double precision,
  indice_r_km double precision,
  r_l_original double precision,
  r_l_final double precision,
  iptl double precision,
  negociacao text,
  motivo text,
  verificacao text,
  codigo_liberacao text,
  usuario_liberacao text,
  classificacao text,
  pagamento text,
  sincronizado_em timestamptz not null default now()
);
alter table public.transacoes_negadas enable row level security;
comment on table public.transacoes_negadas is 'Espelho de Base.xlsx > Transações Negadas (936 linhas em 12/11/2026)';

create table if not exists public.anp_precos (
  id bigint generated always as identity primary key,
  linha integer,
  concatenado text,
  mes date,
  produto text,
  regiao text,
  estado text,
  municipio text,
  numero_de_postos_pesquisados double precision,
  unidade_de_medida text,
  preco_medio_revenda double precision,
  desvio_padrao_revenda double precision,
  preco_minimo_revenda double precision,
  preco_maximo_revenda double precision,
  margem_media_revenda text,
  coef_de_variacao_revenda double precision,
  preco_medio_distribuicao text,
  desvio_padrao_distribuicao text,
  preco_minimo_distribuicao text,
  preco_maximo_distribuicao text,
  coef_de_variacao_distribuicao text,
  tipo_ticket text,
  despesas_minimo double precision,
  despesas_medio double precision,
  ano bigint,
  mes_2 double precision,
  despesa_real double precision,
  litros double precision,
  sincronizado_em timestamptz not null default now()
);
alter table public.anp_precos enable row level security;
comment on table public.anp_precos is 'Espelho de Base.xlsx > ANP (96463 linhas em 12/11/2026)';

-- controle da sincronização (o que foi carregado e quando)
create table if not exists public.sincronizacao_planilhas (
  tabela text primary key,
  arquivo text not null,
  linhas integer not null,
  modificado_em timestamptz,
  sincronizado_em timestamptz not null default now()
);
alter table public.sincronizacao_planilhas enable row level security;
