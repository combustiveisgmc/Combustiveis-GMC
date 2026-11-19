-- Migração 100% nuvem, 15.2 passo 1b (19/11/2026; pedido do usuário "Pode sim" para a área do motorista do banco):
-- 1) a área do motorista (/motorista/, "Minha média") passa a vir do banco: o gerador dos painéis também grava os abastecimentos de
--    cada motorista (public.dados_motoristas) e gestao_painel_motorista(nome) entrega só os dele, com os veículos do cadastro;
-- 2) tempo real sem repetir o que o banco já tem: gestao_chaves_tempo_real(desde) devolve as chaves placa|minuto|litros×100 (as
--    mesmas do chaveTransacao do scripts/cartoes_api.mjs) para o vigia, que antes comparava com a Base.xlsx (parada desde a virada:
--    17 e 18/11 apareciam em dobro nos painéis).
create table if not exists public.dados_motoristas (
  chave     text primary key,             -- nome do motorista normalizado (gestao.chave = chaveNome do portal)
  linhas    json not null,
  gerado_em timestamptz not null default now()
);
alter table public.dados_motoristas enable row level security;

CREATE OR REPLACE FUNCTION public.gestao_gerar_dados_painel(p_forcar boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'gestao'
AS $function$
declare
  assin text := public.gestao_assinatura_painel();
  atual text;
  agora timestamp := (now() at time zone 'America/Bahia');
  v_versao text := to_char(agora, 'YYYYMMDDHH24MISS');
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
    'versao', v_versao, 'geradoEm', to_char(agora, 'YYYY-MM-DD"T"HH24:MI:SS'), 'origem', 'banco (base_transacoes)', 'linhas', n,
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

  -- área do motorista (15.2 passo 1b, 19/11/2026): abastecimentos dos últimos 13 meses de cada motorista com os mesmos números
  -- dos painéis (km corrigido, posto, cidade), para o portal entregar a cada um só os dele (gestao_painel_motorista). Mesmo
  -- formato e período do scripts/painel_motoristas.mjs: [dia, seg, placa, combustível, posto, cidade, litros, km, hodômetro, 1/0].
  delete from public.dados_motoristas;
  insert into public.dados_motoristas (chave, linhas)
  select gestao.chave(mot), json_agg(json_build_array(dia, seg, placa, comb, forn, cid, coalesce(litros, 0), coalesce(km, 0), hod,
           case when serv <> 'Abastecimento' then 0 else 1 end) order by i)
  from _r
  where dia >= (select date_trunc('month', date '1970-01-01' + max(dia) - interval '12 months')::date - date '1970-01-01' from _r)
    and gestao.chave(mot) <> ''
  group by gestao.chave(mot);

  insert into public.dados_painel (id, assinatura, versao, gerado_em, linhas, dados) values (1, assin, v_versao, now(), n, corpo)
    on conflict (id) do update set assinatura = excluded.assinatura, versao = excluded.versao, gerado_em = excluded.gerado_em,
      linhas = excluded.linhas, dados = excluded.dados;
  return v_versao;
end $function$;

create or replace function public.gestao_painel_motorista(p_nome text) returns json language sql stable security definer
set search_path = public, gestao as $$
  with m as (select linhas, gerado_em from public.dados_motoristas where chave = gestao.chave(p_nome)),
    placas as (select distinct l->>2 as placa from m, json_array_elements(m.linhas) l)
  select json_build_object(
    'geradoEm', (select to_char(max(gerado_em) at time zone 'America/Bahia', 'YYYY-MM-DD"T"HH24:MI:SS') from public.dados_motoristas),
    'linhas', coalesce((select linhas from m), '[]'::json),
    'veiculos', coalesce((select json_object_agg(v.placa, json_build_object('categoria', nullif(upper(public.gestao_texto(v.categoria)), ''),
        'modelo', nullif(public.gestao_texto(v.modelo), ''), 'meta', round(v.meta_km_l::numeric, 4)::float8))
      from gestao.veiculos v join placas p on p.placa = v.placa where v.cadastrado), '{}'::json))
$$;

create or replace function public.gestao_chaves_tempo_real(p_desde date) returns json language sql stable security definer
set search_path = public as $$
  select json_build_object(
    'ultimoDia', (select max(data_transacao)::date from public.base_transacoes),
    'chaves', coalesce((select json_agg(public.gestao_norm_placa(placa) || '|' || floor(extract(epoch from data_transacao) / 60)::bigint
        || '|' || round(coalesce(litros, 0)::numeric * 100)::bigint)
      from public.base_transacoes where data_transacao >= p_desde), '[]'::json))
$$;

revoke all on function public.gestao_painel_motorista(text), public.gestao_chaves_tempo_real(date) from public, anon, authenticated;
grant execute on function public.gestao_painel_motorista(text), public.gestao_chaves_tempo_real(date) to service_role;
notify pgrst, 'reload schema';
