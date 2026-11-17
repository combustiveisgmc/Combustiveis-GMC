-- Site lendo e gravando o cadastro de placas no banco (17/11/2026, pedido do usuário: "Pode começar sim" — primeiro passo para
-- tirar as planilhas). As Functions da Cloudflare chamam estas funções pela API do Supabase (PostgREST) com a chave
-- secreta; anon/authenticated não podem executar. Lista no mesmo formato que o vigia publicava da planilha (lib/cadastros.js).

alter table gestao.veiculos add column if not exists linha_planilha integer;   -- linha na aba Carros (enquanto a planilha existir)

-- texto para comparar (sem acento, maiúsculo, espaços simples): igual a scripts/gestao_normalizar.py chave()
create or replace function gestao.chave(t text) returns text language sql immutable as $$
  select upper(regexp_replace(trim(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '\s+', ' ', 'g'))
$$;

-- unidade pelo nome ou apelido; nome novo vira unidade nova (com o apelido)
create or replace function gestao.unidade_id(nome text) returns integer language plpgsql as $$
declare k text := gestao.chave(nome); u integer;
begin
  if k = '' then return null; end if;
  select id into u from gestao.unidades where unidades.nome = k;
  if u is null then select unidade_id into u from gestao.unidade_apelidos where apelido = k; end if;
  if u is null then
    insert into gestao.unidades (nome, empresa_id, operacional)
      values (k, (select id from gestao.empresas where empresas.nome = case when k like 'KEMIGAS%' then 'KEMIGAS' else 'RAJA LOG' end), true)
      returning id into u;
    insert into gestao.unidade_apelidos (apelido, unidade_id, origem) values (k, u, 'site') on conflict do nothing;
  end if;
  return u;
end $$;

create or replace function public.gestao_placas() returns jsonb language sql stable security definer set search_path = gestao, public as $$
  select jsonb_build_object(
    'atualizadoEm', greatest((select max(terminada_em) from gestao.carga), (select max(atualizado_em) from gestao.veiculos)),
    'placas', coalesce(jsonb_agg(jsonb_build_object(
      'linha', v.linha_planilha, 'placa', v.placa, 'categoria', v.categoria, 'unidade', u.nome, 'marca', v.marca, 'modelo', v.modelo,
      'ano', v.ano_fabricacao, 'meta', v.meta_km_l, 'pontoCritico', v.ponto_critico_km_l, 'capTanque', v.capacidade_tanque_l,
      'autonomia', v.autonomia_km,
      'situacao', case v.situacao when 'desabilitado' then 'DESABILITADA' when 'vendido' then 'VENDIDO' else 'ATIVA' end)
      order by v.linha_planilha nulls last, v.placa), '[]'::jsonb))
  from gestao.veiculos v left join gestao.unidades u on u.id = v.unidade_id
  where v.cadastrado
$$;

-- p_acao: 'editar' (p_chave = placa atual) ou 'adicionar'; p_dados só com os campos alterados (os nomes de lib/cadastros.js)
create or replace function public.gestao_salvar_placa(p_acao text, p_chave text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = gestao, public as $$
declare
  atual text := upper(regexp_replace(coalesce(p_chave, ''), '[^A-Za-z0-9]', '', 'g'));
  nova text := upper(regexp_replace(coalesce(p_dados->>'placa', p_chave, ''), '[^A-Za-z0-9]', '', 'g'));
  vid integer;
  sit text := case upper(coalesce(p_dados->>'situacao', '')) when 'DESABILITADA' then 'desabilitado' when 'VENDIDO' then 'vendido'
                when 'ATIVA' then 'ativo' else null end;
begin
  if p_acao = 'adicionar' then
    select id into vid from gestao.veiculos where placa = nova;
    if vid is null then
      insert into gestao.veiculos (placa, situacao, cadastrado) values (nova, coalesce(sit, 'ativo'), true) returning id into vid;
    else
      update gestao.veiculos set cadastrado = true where id = vid;
    end if;
  else
    select id into vid from gestao.veiculos where placa = atual;
    if vid is null then return jsonb_build_object('ok', false, 'erro', 'placa ' || atual || ' não está no banco'); end if;
    if nova <> atual then update gestao.veiculos set placa = nova where id = vid; end if;
  end if;
  update gestao.veiculos set
    categoria = case when p_dados ? 'categoria' then nullif(trim(p_dados->>'categoria'), '') else categoria end,
    unidade_id = case when p_dados ? 'unidade' then gestao.unidade_id(p_dados->>'unidade') else unidade_id end,
    marca = case when p_dados ? 'marca' then nullif(trim(p_dados->>'marca'), '') else marca end,
    modelo = case when p_dados ? 'modelo' then nullif(trim(p_dados->>'modelo'), '') else modelo end,
    ano_fabricacao = case when p_dados ? 'ano' then nullif(p_dados->>'ano', '')::numeric::smallint else ano_fabricacao end,
    meta_km_l = case when p_dados ? 'meta' then nullif(p_dados->>'meta', '')::numeric else meta_km_l end,
    capacidade_tanque_l = case when p_dados ? 'capTanque' then nullif(p_dados->>'capTanque', '')::numeric else capacidade_tanque_l end,
    situacao = coalesce(sit, situacao),
    atualizado_em = now()
  where id = vid;
  -- as fórmulas da planilha: ponto crítico = meta - 0,5; autonomia = tanque x meta x 0,75
  update gestao.veiculos set
    ponto_critico_km_l = case when meta_km_l > 0 then meta_km_l - 0.5 end,
    autonomia_km = case when meta_km_l > 0 and capacidade_tanque_l > 0 then capacidade_tanque_l * meta_km_l * 0.75 end
  where id = vid;
  return jsonb_build_object('ok', true, 'id', vid);
end $$;

revoke all on function public.gestao_placas() from public, anon, authenticated;
revoke all on function public.gestao_salvar_placa(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.gestao_placas() to service_role;
grant execute on function public.gestao_salvar_placa(text, text, jsonb) to service_role;
notify pgrst, 'reload schema';
