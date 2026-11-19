-- Migração 100% nuvem, etapa 15.2 passo 1 (19/11/2026): os painéis leem os abastecimentos do banco, não mais da Base.xlsx.
-- O banco monta a parte dos abastecimentos do arquivo dos painéis (/gestao/dados/abastecimentos.json) igual ao
-- scripts/importar_base.py fazia com a planilha: dicionários (dic), colunas (col), veículos, linhas fora de "Abastecimento",
-- endereço de cada posto e a correção do KM rodado impossível. A fonte é public.base_transacoes (= Base_copia: Base + o que o
-- portal gravou); veículos vêm do cadastro de placas no banco (gestao.veiculos). O resultado fica em public.dados_painel e o
-- pg_cron refaz a cada 2 minutos, só quando algo mudou. As outras partes do arquivo (negociações, coordenadas, orçamento)
-- continuam vindo das planilhas pelo vigia até a etapa 15.3 (o portal junta as duas: functions/gestao/dados/[arquivo].js).

create extension if not exists pg_cron;

create table if not exists public.dados_painel (
  id         smallint primary key default 1 check (id = 1),
  assinatura text not null,             -- muda quando os abastecimentos ou o cadastro de placas mudam
  versao     text not null,             -- AAAAMMDDHHMMSS (hora da Bahia), vai no ETag do arquivo
  gerado_em  timestamptz not null default now(),
  linhas     integer not null,
  dados      text not null              -- JSON: {versao, geradoEm, origem, linhas, dic, veiculos, col, foraAbastecimento, enderecos}
);
alter table public.dados_painel enable row level security;

-- texto como o importar_base.py: vazio para nulo, espaços repetidos viram um
create or replace function public.gestao_texto(t text) returns text language sql immutable as $$
  select regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g')
$$;

create or replace function public.gestao_assinatura_painel() returns text language sql stable security definer set search_path = public, gestao as $$
  select md5(
    coalesce((select string_agg(concat_ws('|', linha, chave, data_transacao, placa, nome_motorista, tipo_combustivel, litros, vl_litro,
      hodometro_ou_horimetro, km_rodados_ou_horas_trabalhadas, valor_emissao, nome_estabelecimento, cidade, uf, informacao_adicional_3,
      campanha, tipo_estabelecimento, forma_de_pagamento, servico, endereco, bairro), ',' order by linha) from public.base_transacoes), '') ||
    coalesce((select string_agg(concat_ws('|', v.placa, v.categoria, v.modelo, u.nome, v.meta_km_l, v.capacidade_tanque_l, v.ano_fabricacao,
      v.ponto_critico_km_l), ',' order by v.placa) from gestao.veiculos v left join gestao.unidades u on u.id = v.unidade_id where v.cadastrado), ''))
$$;

create or replace function public.gestao_gerar_dados_painel(p_forcar boolean default false) returns text
language plpgsql security definer set search_path = public, gestao as $$
declare
  assin text := public.gestao_assinatura_painel();
  atual text;
  agora timestamp := (now() at time zone 'America/Bahia');
  v text := to_char(agora, 'YYYYMMDDHH24MISS');
  corpo text; n integer;
begin
  select assinatura into atual from public.dados_painel where id = 1;
  if not p_forcar and atual is not distinct from assin then return null; end if;

  create temporary table if not exists _r (i integer, linha integer, dia integer, seg integer, placa text, mot text, comb text, litros float8,
    vl float8, hod bigint, km bigint, desp float8, forn text, cid text, cc text, camp integer, tipo text, cartao text, serv text, ende text) on commit drop;
  truncate _r;
  insert into _r
  select (row_number() over (order by b.linha))::integer - 1, b.linha,
    (b.data_transacao::date - date '1970-01-01'),
    extract(hour from b.data_transacao)::integer * 3600 + extract(minute from b.data_transacao)::integer * 60 + floor(extract(second from b.data_transacao))::integer,
    upper(public.gestao_texto(b.placa)), upper(public.gestao_texto(b.nome_motorista)), upper(public.gestao_texto(b.tipo_combustivel)),
    round(b.litros::numeric, 4)::float8, round(b.vl_litro::numeric, 4)::float8,
    round(b.hodometro_ou_horimetro::numeric)::bigint, round(b.km_rodados_ou_horas_trabalhadas::numeric)::bigint, round(b.valor_emissao::numeric, 4)::float8,
    public.gestao_texto(b.nome_estabelecimento),
    case when public.gestao_texto(b.cidade) <> '' and public.gestao_texto(b.uf) <> '' then public.gestao_texto(b.cidade) || ' - ' || public.gestao_texto(b.uf)
         else public.gestao_texto(b.cidade) end,
    upper(public.gestao_texto(b.informacao_adicional_3)),
    case when upper(public.gestao_texto(b.campanha)) in ('SIM', 'S') then 1 when upper(public.gestao_texto(b.campanha)) in ('NÃO', 'NAO', 'N') then 0 end,
    upper(public.gestao_texto(b.tipo_estabelecimento)),
    -- cartão usado (importar_base.cartao_usado): "Cartao Fisico" é o Ticket; vazio é Ticket só antes de 28/06/2025
    case
      when gestao.chave(b.forma_de_pagamento) = 'CARTAO FISICO' then 'TICKET'
      when gestao.chave(b.forma_de_pagamento) = '' then case when b.data_transacao::date < date '2025-06-28' then 'TICKET' else '' end
      else gestao.chave(b.forma_de_pagamento) end,
    public.gestao_texto(b.servico),
    array_to_string(array_remove(array[nullif(public.gestao_texto(b.endereco), ''), nullif(public.gestao_texto(b.bairro), '')], null), ', ')
  from public.base_transacoes b
  where b.data_transacao is not null and b.litros is not null;
  select count(*) into n from _r;

  -- KM rodado impossível (importar_base.corrigir_km_impossivel): só diesel; passa de 3.000 km e de 3x a diferença do hodômetro para
  -- o abastecimento anterior da mesma placa, com a diferença entre 1 e 3.000 km -> o KM vira a diferença
  update _r set km = c.dif from (
    select i, km, hod - lag(hod) over (partition by placa order by dia, coalesce(seg, 0), i) as dif
    from _r where hod is not null and comb like '%DIESEL%' and comb not like '%ARLA%') c
  where _r.i = c.i and c.km is not null and c.dif > 0 and c.dif <= 3000 and c.km > 3000 and c.km > 3 * c.dif;

  with
    d_placa as (select placa as v, row_number() over (order by min(i)) - 1 as k from _r group by placa),
    d_mot as (select mot as v, row_number() over (order by min(i)) - 1 as k from _r group by mot),
    d_comb as (select comb as v, row_number() over (order by min(i)) - 1 as k from _r group by comb),
    d_forn as (select forn as v, row_number() over (order by min(i)) - 1 as k from _r group by forn),
    d_cid as (select cid as v, row_number() over (order by min(i)) - 1 as k from _r group by cid),
    d_cc as (select cc as v, row_number() over (order by min(i)) - 1 as k from _r group by cc),
    d_tipo as (select tipo as v, row_number() over (order by min(i)) - 1 as k from _r group by tipo),
    d_cartao as (select cartao as v, row_number() over (order by min(i)) - 1 as k from _r group by cartao),
    linhas as (
      select r.*, p.k as kp, m.k as km_, c.k as kc, f.k as kf, ci.k as kci, cc.k as kcc, t.k as kt, ca.k as kca
      from _r r join d_placa p on p.v = r.placa join d_mot m on m.v = r.mot join d_comb c on c.v = r.comb join d_forn f on f.v = r.forn
        join d_cid ci on ci.v = r.cid join d_cc cc on cc.v = r.cc join d_tipo t on t.v = r.tipo join d_cartao ca on ca.v = r.cartao),
    veic as (
      select v.placa, json_build_object('categoria', nullif(upper(public.gestao_texto(v.categoria)), ''), 'modelo', nullif(public.gestao_texto(v.modelo), ''),
        'unidade', u.nome, 'meta', round(v.meta_km_l::numeric, 4)::float8, 'tanque', round(v.capacidade_tanque_l::numeric, 2)::float8,
        'ano', v.ano_fabricacao::text, 'pc', round(v.ponto_critico_km_l::numeric, 3)::float8) as o
      from gestao.veiculos v left join gestao.unidades u on u.id = v.unidade_id where v.cadastrado),
    ende as (select distinct on (upper(forn)) upper(forn) as posto, ende from _r where ende <> '' order by upper(forn), i desc)
  select json_build_object(
    'versao', v, 'geradoEm', to_char(agora, 'YYYY-MM-DD"T"HH24:MI:SS'), 'origem', 'banco (base_transacoes)', 'linhas', n,
    'dic', json_build_object(
      'placa', (select json_agg(v order by k) from d_placa), 'motorista', (select json_agg(v order by k) from d_mot),
      'combustivel', (select json_agg(v order by k) from d_comb), 'fornecedor', (select json_agg(v order by k) from d_forn),
      'cidade', (select json_agg(v order by k) from d_cid), 'cc', (select json_agg(v order by k) from d_cc),
      'tipo_estab', (select json_agg(v order by k) from d_tipo), 'cartao', (select json_agg(v order by k) from d_cartao)),
    'veiculos', coalesce((select json_object_agg(placa, o) from veic), '{}'::json),
    'col', (select json_build_object(
      'data', json_agg(dia order by i), 'placa', json_agg(kp order by i), 'motorista', json_agg(km_ order by i),
      'combustivel', json_agg(kc order by i), 'litros', json_agg(litros order by i), 'vl_litro', json_agg(vl order by i),
      'hodometro', json_agg(hod order by i), 'km', json_agg(km order by i), 'despesa', json_agg(desp order by i),
      'fornecedor', json_agg(kf order by i), 'cidade', json_agg(kci order by i), 'cc', json_agg(kcc order by i),
      'campanha', json_agg(camp order by i), 'tipo_estab', json_agg(kt order by i), 'seg', json_agg(seg order by i),
      'cartao', json_agg(kca order by i)) from linhas),
    'foraAbastecimento', coalesce((select json_agg(i order by i) from _r where serv <> 'Abastecimento'), '[]'::json),
    'enderecos', coalesce((select json_object_agg(posto, ende) from ende), '{}'::json)
  )::text into corpo;

  insert into public.dados_painel (id, assinatura, versao, gerado_em, linhas, dados) values (1, assin, v, now(), n, corpo)
    on conflict (id) do update set assinatura = excluded.assinatura, versao = excluded.versao, gerado_em = excluded.gerado_em,
      linhas = excluded.linhas, dados = excluded.dados;
  return v;
end $$;

-- leitura pelo portal (chave secreta): a versão (barata, para o ETag e o cache) e o arquivo (json, sai como está)
create or replace function public.gestao_dados_painel_versao() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('versao', versao, 'geradoEm', gerado_em, 'linhas', linhas) from public.dados_painel where id = 1
$$;
create or replace function public.gestao_dados_painel() returns json language sql stable security definer set search_path = public as $$
  select dados::json from public.dados_painel where id = 1
$$;

revoke all on function public.gestao_gerar_dados_painel(boolean) from public, anon, authenticated;
revoke all on function public.gestao_dados_painel_versao() from public, anon, authenticated;
revoke all on function public.gestao_dados_painel() from public, anon, authenticated;
revoke all on function public.gestao_assinatura_painel() from public, anon, authenticated;
grant execute on function public.gestao_dados_painel_versao() to service_role;
grant execute on function public.gestao_dados_painel() to service_role;

-- a cada 2 minutos (só refaz quando a assinatura muda)
select cron.unschedule(jobid) from cron.job where jobname = 'gestao-dados-painel';
select cron.schedule('gestao-dados-painel', '*/2 * * * *', $cron$select public.gestao_gerar_dados_painel(false)$cron$);
notify pgrst, 'reload schema';
