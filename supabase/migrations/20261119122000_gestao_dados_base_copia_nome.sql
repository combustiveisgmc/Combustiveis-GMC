-- Ajuste de texto (19/11/2026): a tela mostra "N abastecimentos da <arquivo>"; o nome vira "Base_copia (banco)". Resto igual.
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
    dp as (select coalesce(placa, chr(1)) as kk, max(placa) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(placa, chr(1))),
    dm as (select coalesce(nome_motorista, chr(1)) as kk, max(nome_motorista) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(nome_motorista, chr(1))),
    df as (select coalesce(tipo_combustivel, chr(1)) as kk, max(tipo_combustivel) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(tipo_combustivel, chr(1))),
    dpo as (select coalesce(nome_estabelecimento, chr(1)) as kk, max(nome_estabelecimento) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(nome_estabelecimento, chr(1))),
    dfo as (select coalesce(forma_de_pagamento, chr(1)) as kk, max(forma_de_pagamento) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(forma_de_pagamento, chr(1))),
    d1 as (select coalesce(informacao_adicional_1, chr(1)) as kk, max(informacao_adicional_1) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(informacao_adicional_1, chr(1))),
    d3 as (select coalesce(informacao_adicional_3, chr(1)) as kk, max(informacao_adicional_3) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(informacao_adicional_3, chr(1))),
    dr as (select coalesce(nome_reduzido, chr(1)) as kk, max(nome_reduzido) as v, row_number() over (order by min(linha)) - 1 as k from _b group by coalesce(nome_reduzido, chr(1))),
    l as (select b.*, dp.k kp, dm.k km_, df.k kf, dpo.k kpo, dfo.k kfo, d1.k k1, d3.k k3, dr.k kr from _b b
      join dp on dp.kk = coalesce(b.placa, chr(1)) join dm on dm.kk = coalesce(b.nome_motorista, chr(1))
      join df on df.kk = coalesce(b.tipo_combustivel, chr(1)) join dpo on dpo.kk = coalesce(b.nome_estabelecimento, chr(1))
      join dfo on dfo.kk = coalesce(b.forma_de_pagamento, chr(1)) join d1 on d1.kk = coalesce(b.informacao_adicional_1, chr(1))
      join d3 on d3.kk = coalesce(b.informacao_adicional_3, chr(1)) join dr on dr.kk = coalesce(b.nome_reduzido, chr(1)))
  select json_build_object('versao', v_versao, 'geradoEm', v_gerado, 'arquivo', 'Base_copia (banco)', 'linhas', n,
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
notify pgrst, 'reload schema';
