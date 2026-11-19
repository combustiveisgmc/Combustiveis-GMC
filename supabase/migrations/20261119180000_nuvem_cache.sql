-- Passo 4 da migração (19/11/2026; pedido do usuário "Pode começar" para o tempo real + D-1 e o Rateio das NFs na nuvem):
-- 1) public.nuvem_cache: o estado que o vigia guarda em .dados/cartoes-api (leitura de cada dia das APIs, atrasados, já na base,
--    correções do rateio enviadas, última lista do rateio), com o nome prefixado pela rotina ('cartoes-api:dia:2026-11-19');
-- 2) gestao_linhas_bomba: a linha inteira (A..AN) dos abastecimentos das bombas internas, para a planilha de rateio de cada nota
--    (o vigia lia de .dados/cartoes-api/base-copia-bomba.json, feito pelo base_copia_lista.py).
create table if not exists public.nuvem_cache (
  nome  text primary key,
  valor jsonb not null,
  em    timestamptz not null default now()
);
alter table public.nuvem_cache enable row level security;

-- tudo de um prefixo de uma vez ({nome sem o prefixo: valor}): a função lê o estado inteiro numa chamada
create or replace function public.gestao_nuvem_cache_ler(p_prefixo text) returns json language sql stable security definer
set search_path = public as $$
  select coalesce(json_object_agg(substr(nome, length(p_prefixo) + 1), valor), '{}'::json) from public.nuvem_cache
  where left(nome, length(p_prefixo)) = p_prefixo
$$;
create or replace function public.gestao_nuvem_cache_gravar(p_nome text, p_valor jsonb) returns void language sql security definer
set search_path = public as $$
  insert into public.nuvem_cache (nome, valor, em) values (p_nome, p_valor, now())
  on conflict (nome) do update set valor = excluded.valor, em = now()
$$;

-- {linha: [A..AN]} das bombas (postos da lista, a partir do serial do Excel p_desde), com os valores como o vigia lia da planilha:
-- data/hora como serial do Excel, números como número, texto como texto
create or replace function public.gestao_linhas_bomba(p_postos text[], p_desde float8) returns json language plpgsql stable
security definer set search_path = public, gestao as $$
declare exprs text := ''; i integer; letra text; c text[]; r json;
begin
  for i in 1..40 loop
    letra := case when i <= 26 then chr(64 + i) else 'A' || chr(64 + i - 26) end;
    c := public.gestao_coluna_base(letra);
    exprs := exprs || case when i > 1 then ', ' else '' end ||
      case c[2] when 'd' then format('public.gestao_serial(%I)', c[1]) else format('%I', c[1]) end;
  end loop;
  execute format('select coalesce(json_object_agg(linha, json_build_array(%s)), ''{}''::json) from public.base_transacoes
    where public.gestao_serial(data_transacao) >= $2 and upper(btrim(nome_estabelecimento)) = any($1)', exprs)
    into r using (select array_agg(upper(btrim(p))) from unnest(p_postos) p), p_desde;
  return r;
end $$;

revoke all on function public.gestao_nuvem_cache_ler(text), public.gestao_nuvem_cache_gravar(text, jsonb),
  public.gestao_linhas_bomba(text[], float8) from public, anon, authenticated;
grant execute on function public.gestao_nuvem_cache_ler(text), public.gestao_nuvem_cache_gravar(text, jsonb),
  public.gestao_linhas_bomba(text[], float8) to service_role;
notify pgrst, 'reload schema';
