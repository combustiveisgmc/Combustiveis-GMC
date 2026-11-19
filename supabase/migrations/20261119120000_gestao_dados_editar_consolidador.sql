-- Migração 100% nuvem, etapa 15.2 passo 2 (19/11/2026): a lista do Editar abastecimentos (/gestao/dados/base-copia.json) e o
-- histórico do Consolidador (/gestao/dados/consolidacao.json) montados no banco, iguais ao que scripts/base_copia_lista.py e
-- scripts/consolidador_historico.py faziam com as planilhas. Fonte: public.base_transacoes (= Base_copia; o vigia substitui a tabela
-- inteira a cada sincronização, então max(sincronizado_em) = momento em que o banco reflete a planilha).
-- Ficam em public.dados_gerados (uma linha por arquivo); o pg_cron refaz junto com os dados dos painéis, só quando muda.

create table if not exists public.dados_gerados (
  nome       text primary key,            -- 'base-copia' | 'consolidacao'
  assinatura text not null,
  versao     text not null,
  gerado_em  timestamptz not null default now(),
  linhas     integer not null,
  dados      text not null
);
alter table public.dados_gerados enable row level security;

-- valor como o SheetJS entregaria (consolidador_historico.valor): matrícula guardada como texto no banco volta a ser número
create or replace function public.gestao_num_texto(t text) returns json language sql immutable as $$
  select case when t ~ '^\s*[0-9]+\s*$' then to_json(btrim(t)::bigint) else to_json(t) end
$$;
-- data/hora -> número serial do Excel (dias desde 30/12/1899, com a fração do dia)
create or replace function public.gestao_serial(ts timestamp) returns float8 language sql immutable as $$
  select extract(epoch from (ts - timestamp '1899-12-30'))::float8 / 86400
$$;

create or replace function public.gestao_assinatura_base() returns text language sql stable security definer set search_path = public as $$
  select count(*)::text || '|' || coalesce(max(sincronizado_em)::text, '') from public.base_transacoes
$$;

-- ---------- lista do Editar abastecimentos (scripts/base_copia_lista.py) ----------
create or replace function public.gestao_gerar_base_copia(p_forcar boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  assin text := public.gestao_assinatura_base();
  v_versao text := to_char(now() at time zone 'America/Bahia', 'YYYYMMDDHH24MISS');
  -- a página compara com o aplicada_em das correções (D1): hora em que o banco passou a refletir a planilha, em UTC
  v_gerado text := to_char((select max(sincronizado_em) from public.base_transacoes) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  corpo text; n integer;
begin
  if not p_forcar and (select assinatura from public.dados_gerados where nome = 'base-copia') is not distinct from assin then return null; end if;
  create temporary table if not exists _b on commit drop as select * from public.base_transacoes where false;
  truncate _b;
  insert into _b select * from public.base_transacoes where nullif(placa, '') is not null and data_transacao is not null;
  select count(*) into n from _b;
  with
    dp as (select placa as v, row_number() over (order by min(linha)) - 1 as k from _b group by placa),
    dm as (select nome_motorista as v, row_number() over (order by min(linha)) - 1 as k from _b group by nome_motorista),
    df as (select tipo_combustivel as v, row_number() over (order by min(linha)) - 1 as k from _b group by tipo_combustivel),
    dpo as (select nome_estabelecimento as v, row_number() over (order by min(linha)) - 1 as k from _b group by nome_estabelecimento),
    dfo as (select forma_de_pagamento as v, row_number() over (order by min(linha)) - 1 as k from _b group by forma_de_pagamento),
    d1 as (select informacao_adicional_1 as v, row_number() over (order by min(linha)) - 1 as k from _b group by informacao_adicional_1),
    d3 as (select informacao_adicional_3 as v, row_number() over (order by min(linha)) - 1 as k from _b group by informacao_adicional_3),
    dr as (select nome_reduzido as v, row_number() over (order by min(linha)) - 1 as k from _b group by nome_reduzido),
    l as (select b.*, dp.k kp, dm.k km_, df.k kf, dpo.k kpo, dfo.k kfo, d1.k k1, d3.k k3, dr.k kr from _b b
      join dp on dp.v is not distinct from b.placa join dm on dm.v is not distinct from b.nome_motorista
      join df on df.v is not distinct from b.tipo_combustivel join dpo on dpo.v is not distinct from b.nome_estabelecimento
      join dfo on dfo.v is not distinct from b.forma_de_pagamento join d1 on d1.v is not distinct from b.informacao_adicional_1
      join d3 on d3.v is not distinct from b.informacao_adicional_3 join dr on dr.v is not distinct from b.nome_reduzido)
  select json_build_object('versao', v_versao, 'geradoEm', v_gerado, 'arquivo', 'banco (base_transacoes)', 'linhas', n,
    'dic', json_build_object(
      'placa', (select json_agg(v order by k) from dp), 'mot', (select json_agg(v order by k) from dm), 'fuel', (select json_agg(v order by k) from df),
      'posto', (select json_agg(v order by k) from dpo), 'forma', (select json_agg(v order by k) from dfo), 'inf1', (select json_agg(v order by k) from d1),
      'inf3', (select json_agg(v order by k) from d3), 'reduzido', (select json_agg(v order by k) from dr)),
    'col', (select json_build_object(
      'linha', json_agg(linha order by linha), 'dt', json_agg(public.gestao_serial(data_transacao) order by linha),
      'placa', json_agg(kp order by linha), 'mot', json_agg(km_ order by linha), 'fuel', json_agg(kf order by linha),
      'litros', json_agg(litros order by linha), 'vl', json_agg(vl_litro order by linha), 'hodo', json_agg(hodometro_ou_horimetro order by linha),
      'km', json_agg(km_rodados_ou_horas_trabalhadas order by linha), 'kml', json_agg(km_litro_ou_litros_hora order by linha),
      'valor', json_agg(valor_emissao order by linha), 'posto', json_agg(kpo order by linha), 'forma', json_agg(kfo order by linha),
      'inf1', json_agg(k1 order by linha), 'inf3', json_agg(k3 order by linha), 'reduzido', json_agg(kr order by linha)) from l)
  )::text into corpo;
  insert into public.dados_gerados (nome, assinatura, versao, gerado_em, linhas, dados) values ('base-copia', assin, v_versao, now(), n, corpo)
    on conflict (nome) do update set assinatura = excluded.assinatura, versao = excluded.versao, gerado_em = excluded.gerado_em,
      linhas = excluded.linhas, dados = excluded.dados;
  return v_versao;
end $$;

-- ---------- histórico do Consolidador (scripts/consolidador_historico.py) ----------
-- veículo: colunas C, D, G, H, I, J, M e AB..AN da Transações; posto: U, W..AA (mesma ordem do COL_VEICULO / COL_POSTO)
create or replace function public.gestao_gerar_consolidacao(p_forcar boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  assin text := public.gestao_assinatura_base();
  agora timestamp := (now() at time zone 'America/Bahia');
  v_versao text := to_char(agora, 'YYYYMMDDHH24MISS');
  corpo text; n integer;
begin
  if not p_forcar and (select assinatura from public.dados_gerados where nome = 'consolidacao') is not distinct from assin then return null; end if;
  create temporary table if not exists _c (linha integer, dt float8, placa text, hodo float8, fuel text, forma text, vl float8, posto text,
    mot text, mat json, veic text, pst text) on commit drop;
  truncate _c;
  insert into _c
  select b.linha, public.gestao_serial(b.data_transacao), b.placa, b.hodometro_ou_horimetro, b.tipo_combustivel, b.forma_de_pagamento,
    b.vl_litro, b.nome_estabelecimento, b.nome_motorista, public.gestao_num_texto(b.matricula),
    json_build_array(b.codigo_cliente, b.nome_reduzido, b.tipo_frota, b.modelo_veiculo, b.numero_frota, b.ano_veiculo, b.servico,
      b.informacao_adicional_1, b.informacao_adicional_2, b.informacao_adicional_3, b.informacao_adicional_4, b.informacao_adicional_5,
      b.forma_transacao, b.codigo_liberacao_restricao, b.serie_pos, b.numero_cartao, b.familia_veiculo, b.grupo_restricao,
      b.codigo_emissora, b.responsavel)::text,
    json_build_array(b.codigo_estabelecimento, b.tipo_estabelecimento, b.endereco, b.bairro, b.cidade, b.uf)::text
  from public.base_transacoes b where nullif(b.placa, '') is not null and b.data_transacao is not null;
  select count(*) into n from _c;
  with
    dp as (select placa as v, row_number() over (order by min(linha)) - 1 as k from _c group by placa),
    df as (select fuel as v, row_number() over (order by min(linha)) - 1 as k from _c group by fuel),
    dfo as (select forma as v, row_number() over (order by min(linha)) - 1 as k from _c group by forma),
    dpo as (select posto as v, row_number() over (order by min(linha)) - 1 as k from _c group by posto),
    dm as (select mot as v, row_number() over (order by min(linha)) - 1 as k from _c group by mot),
    dma as (select mat::text as v, row_number() over (order by min(linha)) - 1 as k from _c group by mat::text),
    dv as (select veic as v, row_number() over (order by min(linha)) - 1 as k from _c group by veic),
    dps as (select pst as v, row_number() over (order by min(linha)) - 1 as k from _c group by pst),
    l as (select c.*, dp.k kp, df.k kf, dfo.k kfo, dpo.k kpo, dm.k km_, dma.k kma, dv.k kv, dps.k kps from _c c
      join dp on dp.v is not distinct from c.placa join df on df.v is not distinct from c.fuel join dfo on dfo.v is not distinct from c.forma
      join dpo on dpo.v is not distinct from c.posto join dm on dm.v is not distinct from c.mot join dma on dma.v = c.mat::text
      join dv on dv.v = c.veic join dps on dps.v = c.pst)
  select json_build_object('versao', v_versao, 'geradoEm', to_char(agora, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'fontes', json_build_array(json_build_object('arquivo', 'banco (base_transacoes)', 'linhas', n, 'novas', n)),
    'linhas', n, 'datamax', (select max(dt) from _c),
    'dic', json_build_object(
      'placa', (select json_agg(v order by k) from dp), 'fuel', (select json_agg(v order by k) from df), 'forma', (select json_agg(v order by k) from dfo),
      'posto', (select json_agg(v order by k) from dpo), 'mot', (select json_agg(v order by k) from dm), 'mat', (select json_agg(v::json order by k) from dma)),
    'veiculos', (select json_agg(v::json order by k) from dv), 'postos', (select json_agg(v::json order by k) from dps),
    'col', (select json_build_object(
      'dt', json_agg(dt order by linha), 'placa', json_agg(kp order by linha), 'hodo', json_agg(hodo order by linha), 'fuel', json_agg(kf order by linha),
      'forma', json_agg(kfo order by linha), 'vl', json_agg(vl order by linha), 'posto', json_agg(kpo order by linha), 'mot', json_agg(km_ order by linha),
      'mat', json_agg(kma order by linha), 'v', json_agg(kv order by linha), 'p', json_agg(kps order by linha)) from l)
  )::text into corpo;
  insert into public.dados_gerados (nome, assinatura, versao, gerado_em, linhas, dados) values ('consolidacao', assin, v_versao, now(), n, corpo)
    on conflict (nome) do update set assinatura = excluded.assinatura, versao = excluded.versao, gerado_em = excluded.gerado_em,
      linhas = excluded.linhas, dados = excluded.dados;
  return v_versao;
end $$;

-- leitura pelo portal (chave secreta)
create or replace function public.gestao_dados_gerados_versao(p_nome text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('versao', versao, 'geradoEm', gerado_em, 'linhas', linhas) from public.dados_gerados where nome = p_nome
$$;
create or replace function public.gestao_dados_gerados(p_nome text) returns json language sql stable security definer set search_path = public as $$
  select dados::json from public.dados_gerados where nome = p_nome
$$;
revoke all on function public.gestao_gerar_base_copia(boolean) from public, anon, authenticated;
revoke all on function public.gestao_gerar_consolidacao(boolean) from public, anon, authenticated;
revoke all on function public.gestao_dados_gerados_versao(text) from public, anon, authenticated;
revoke all on function public.gestao_dados_gerados(text) from public, anon, authenticated;
grant execute on function public.gestao_dados_gerados_versao(text) to service_role;
grant execute on function public.gestao_dados_gerados(text) to service_role;

-- o mesmo agendamento dos painéis passa a refazer os três arquivos (cada um só quando muda)
select cron.unschedule(jobid) from cron.job where jobname = 'gestao-dados-painel';
select cron.schedule('gestao-dados-painel', '*/2 * * * *',
  $cron$select public.gestao_gerar_dados_painel(false); select public.gestao_gerar_base_copia(false); select public.gestao_gerar_consolidacao(false);$cron$);
notify pgrst, 'reload schema';
