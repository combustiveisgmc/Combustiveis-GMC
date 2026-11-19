-- Migração 100% nuvem, passo 4 (19/11/2026; plano em docs/MIGRACAO-PASSO4.md): rotinas do vigia nas Edge Functions do Supabase.
-- Pedido do usuário: "O token já esta no arquivo pode adiantar o passo 4" (agendador escolhido em 19/11: Supabase Edge Functions).
-- Cada rotina tem um modo: 'desligado' (só o vigia), 'simular' (a nuvem roda e anota o que faria, o vigia continua gravando) e
-- 'ligado' (a nuvem grava e o vigia pula a dele). O estado que ficava em .dados/*.json fica em `estado`.
create extension if not exists pg_net with schema extensions;

create table if not exists public.nuvem_rotinas (
  nome text primary key,
  modo text not null default 'desligado' check (modo in ('desligado', 'simular', 'ligado')),
  intervalo_min integer not null default 60 check (intervalo_min > 0),
  estado jsonb not null default '{}'::jsonb,
  disparada_em timestamptz,
  ultima_execucao timestamptz,
  ultimo_resultado jsonb,
  ultimo_erro text
);
alter table public.nuvem_rotinas enable row level security;

create table if not exists public.nuvem_execucoes (
  id bigint generated always as identity primary key,
  rotina text not null,
  em timestamptz not null default now(),
  modo text not null,
  ok boolean not null,
  resultado jsonb
);
create index if not exists nuvem_execucoes_rotina_em on public.nuvem_execucoes (rotina, em desc);
alter table public.nuvem_execucoes enable row level security;

-- modo de uma rotina (o vigia consulta para pular a dele quando a da nuvem está ligada)
create or replace function public.gestao_nuvem_modo(p_nome text) returns text language sql stable security definer
set search_path = public as $$
  select coalesce((select modo from public.nuvem_rotinas where nome = p_nome), 'desligado')
$$;

-- a Edge Function lê e grava o próprio estado e registra cada execução (guarda 60 dias de histórico)
create or replace function public.gestao_nuvem_rotina(p_nome text) returns jsonb language sql stable security definer
set search_path = public as $$
  select to_jsonb(r) from public.nuvem_rotinas r where nome = p_nome
$$;
create or replace function public.gestao_nuvem_registrar(p_nome text, p_ok boolean, p_estado jsonb, p_resultado jsonb, p_erro text)
returns void language plpgsql security definer set search_path = public as $$
declare v_modo text;
begin
  update public.nuvem_rotinas set estado = coalesce(p_estado, estado), ultima_execucao = now(),
    ultimo_resultado = p_resultado, ultimo_erro = case when p_ok then null else p_erro end
  where nome = p_nome returning modo into v_modo;
  insert into public.nuvem_execucoes (rotina, modo, ok, resultado)
    values (p_nome, coalesce(v_modo, '?'), p_ok, coalesce(p_resultado, '{}'::jsonb) || jsonb_build_object('erro', p_erro));
  delete from public.nuvem_execucoes where em < now() - interval '60 days';
end $$;

-- pg_cron (a cada 5 min): chama as Edge Functions das rotinas que não estão desligadas e já passaram do intervalo.
-- A chave (header x-chave-nuvem) e o endereço do projeto ficam no Vault ('chave_nuvem', 'url_projeto'), nunca no código.
create or replace function public.gestao_nuvem_disparar() returns integer language plpgsql security definer
set search_path = public, extensions as $$
declare r record; v_url text; v_chave text; n integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'url_projeto';
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'chave_nuvem';
  if v_url is null or v_chave is null then return 0; end if;
  for r in select nome from public.nuvem_rotinas
           where modo <> 'desligado' and (disparada_em is null or disparada_em <= now() - make_interval(mins => intervalo_min) + interval '30 seconds')
  loop
    perform net.http_post(url := v_url || '/functions/v1/' || r.nome, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-chave-nuvem', v_chave), timeout_milliseconds := 10000);
    update public.nuvem_rotinas set disparada_em = now() where nome = r.nome;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.gestao_nuvem_modo(text), public.gestao_nuvem_rotina(text),
  public.gestao_nuvem_registrar(text, boolean, jsonb, jsonb, text), public.gestao_nuvem_disparar() from public, anon, authenticated;
grant execute on function public.gestao_nuvem_modo(text), public.gestao_nuvem_rotina(text),
  public.gestao_nuvem_registrar(text, boolean, jsonb, jsonb, text) to service_role;

-- primeira rotina: estornos da TruckPag, a cada 6 horas, começando em simulação
insert into public.nuvem_rotinas (nome, modo, intervalo_min) values ('estornos-truckpag', 'simular', 360) on conflict (nome) do nothing;

select cron.unschedule('nuvem-rotinas') where exists (select 1 from cron.job where jobname = 'nuvem-rotinas');
select cron.schedule('nuvem-rotinas', '*/5 * * * *', $$select public.gestao_nuvem_disparar()$$);
