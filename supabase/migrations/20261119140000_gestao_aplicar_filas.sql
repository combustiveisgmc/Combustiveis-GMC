-- Migração 100% nuvem, etapa 15.2 passo 3 (19/11/2026; plano em docs/MIGRACAO-PASSO3.md): os pedidos das filas do portal aplicados
-- direto em public.base_transacoes, com as mesmas regras do scripts/planilha_base_copia.py (gravar e editar).

-- coluna da aba Transações (A..AQ) -> coluna do banco e tipo (n = número, t = texto, d = data)
create or replace function public.gestao_coluna_base(p_letra text) returns text[] language sql immutable as $$
  select case upper(p_letra)
    when 'A' then array['codigo_transacao','n'] when 'B' then array['forma_de_pagamento','t'] when 'C' then array['codigo_cliente','n']
    when 'D' then array['nome_reduzido','t'] when 'E' then array['data_transacao','d'] when 'F' then array['placa','t']
    when 'G' then array['tipo_frota','t'] when 'H' then array['modelo_veiculo','t'] when 'I' then array['numero_frota','t']
    when 'J' then array['ano_veiculo','n'] when 'K' then array['matricula','t'] when 'L' then array['nome_motorista','t']
    when 'M' then array['servico','t'] when 'N' then array['tipo_combustivel','t'] when 'O' then array['litros','n']
    when 'P' then array['vl_litro','n'] when 'Q' then array['hodometro_ou_horimetro','n'] when 'R' then array['km_rodados_ou_horas_trabalhadas','n']
    when 'S' then array['km_litro_ou_litros_hora','n'] when 'T' then array['valor_emissao','n'] when 'U' then array['codigo_estabelecimento','n']
    when 'V' then array['nome_estabelecimento','t'] when 'W' then array['tipo_estabelecimento','t'] when 'X' then array['endereco','t']
    when 'Y' then array['bairro','t'] when 'Z' then array['cidade','t'] when 'AA' then array['uf','t']
    when 'AB' then array['informacao_adicional_1','t'] when 'AC' then array['informacao_adicional_2','t'] when 'AD' then array['informacao_adicional_3','t']
    when 'AE' then array['informacao_adicional_4','t'] when 'AF' then array['informacao_adicional_5','t'] when 'AG' then array['forma_transacao','t']
    when 'AH' then array['codigo_liberacao_restricao','n'] when 'AI' then array['serie_pos','t'] when 'AJ' then array['numero_cartao','t']
    when 'AK' then array['familia_veiculo','t'] when 'AL' then array['grupo_restricao','t'] when 'AM' then array['codigo_emissora','n']
    when 'AN' then array['responsavel','t'] when 'AQ' then array['campanha','t'] end
$$;
-- número serial do Excel -> data e hora (ao segundo)
create or replace function public.gestao_de_serial(s float8) returns timestamp language sql immutable as $$
  select timestamp '1899-12-30' + make_interval(secs => round(s * 86400))
$$;
create or replace function public.gestao_norm_placa(p text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;
-- combustível para a duplicidade: todo diesel junto, Arla (e o resto) à parte
create or replace function public.gestao_cadeia_comb(f text) returns text language sql immutable as $$
  select case when gestao.chave(f) like '%DIESEL%' then 'DIESEL' else gestao.chave(f) end
$$;
-- chave estável (igual scripts/supabase_sync.py): PLACA|AAAA-MM-DDTHH:MM:SS|COMBUSTÍVEL; repetida ganha #2, #3...
create or replace function public.gestao_chave_livre(p_placa text, p_data timestamp, p_comb text, p_ignorar bigint default null) returns text
language plpgsql stable as $$
declare base text := upper(btrim(coalesce(p_placa, ''))) || '|' || to_char(p_data, 'YYYY-MM-DD"T"HH24:MI:SS') || '|' || upper(btrim(coalesce(p_comb, '')));
  c text := base; n integer := 1;
begin
  while exists (select 1 from public.base_transacoes where chave = c and (p_ignorar is null or id <> p_ignorar)) loop
    n := n + 1; c := base || '#' || n;
  end loop;
  return c;
end $$;
create or replace function public.gestao_valor_coluna(v jsonb, tipo text) returns text language sql immutable as $$
  select case when v is null or v = 'null'::jsonb then null when jsonb_typeof(v) = 'string' then v #>> '{}' else v::text end
$$;

-- ---------- porta A: inserir as linhas de um lote ([fonte, A..AV] cada) ----------
create or replace function public.gestao_aplicar_lote(p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path = public, gestao as $$
declare
  r jsonb; v_data timestamp; v_hod bigint; v_ins integer := 0; v_ign integer := 0; v_min timestamp; v_ini integer; v_id bigint;
  v_ids bigint[] := '{}';
begin
  for r in select * from jsonb_array_elements(p_linhas) loop
    -- r = [fonte, A, B, ..., AV]: a coluna X (0 = A) está em r->(X+1)
    if jsonb_typeof(r->5) <> 'number' or public.gestao_norm_placa(r->>6) = '' then v_ign := v_ign + 1; continue; end if;
    v_data := public.gestao_de_serial((r->>5)::float8);
    v_hod := case when jsonb_typeof(r->17) = 'number' then trunc((r->>17)::numeric)::bigint end;
    if exists (select 1 from public.base_transacoes b where public.gestao_norm_placa(b.placa) = public.gestao_norm_placa(r->>6)
        and b.data_transacao = v_data and (trunc(b.hodometro_ou_horimetro::numeric)::bigint is not distinct from v_hod)
        and public.gestao_cadeia_comb(b.tipo_combustivel) = public.gestao_cadeia_comb(r->>14)) then
      v_ign := v_ign + 1; continue;   -- já está (lote gravado antes, digitado à mão ou repetido no próprio lote)
    end if;
    insert into public.base_transacoes (linha, codigo_transacao, forma_de_pagamento, codigo_cliente, nome_reduzido, data_transacao, placa,
      tipo_frota, modelo_veiculo, numero_frota, ano_veiculo, matricula, nome_motorista, servico, tipo_combustivel, litros, vl_litro,
      hodometro_ou_horimetro, km_rodados_ou_horas_trabalhadas, km_litro_ou_litros_hora, valor_emissao, codigo_estabelecimento,
      nome_estabelecimento, tipo_estabelecimento, endereco, bairro, cidade, uf, informacao_adicional_1, informacao_adicional_2,
      informacao_adicional_3, informacao_adicional_4, informacao_adicional_5, forma_transacao, codigo_liberacao_restricao, serie_pos,
      numero_cartao, familia_veiculo, grupo_restricao, codigo_emissora, responsavel, campanha, chave, sincronizado_em)
    values (null, (r->>1)::numeric::bigint, r->>2, (r->>3)::numeric::bigint, r->>4, v_data, r->>6, r->>7, r->>8, r->>9,
      (r->>10)::numeric::bigint, r->>11, r->>12, r->>13, r->>14, (r->>15)::float8, (r->>16)::float8, (r->>17)::float8,
      (r->>18)::float8, (r->>19)::float8, (r->>20)::float8, (r->>21)::numeric::bigint, r->>22, r->>23, r->>24, r->>25, r->>26, r->>27,
      r->>28, r->>29, r->>30, r->>31, r->>32, r->>33, (r->>34)::numeric::bigint, r->>35, r->>36, r->>37, r->>38, (r->>39)::numeric::bigint,
      r->>40, r->>43, public.gestao_chave_livre(r->>6, v_data, r->>14), now())
    returning id into v_id;
    v_ids := v_ids || v_id; v_ins := v_ins + 1;
    v_min := least(coalesce(v_min, v_data), v_data);
  end loop;
  if v_ins > 0 then
    -- ordem por data (como o intercalar da planilha): renumera a partir da primeira linha com data >= a menor data inserida
    select coalesce(min(linha), (select coalesce(max(linha), 1) + 1 from public.base_transacoes where linha is not null))
      into v_ini from public.base_transacoes where linha is not null and data_transacao >= v_min;
    update public.base_transacoes b set linha = x.nova from (
      select id, v_ini - 1 + row_number() over (order by data_transacao, linha nulls last, id) as nova
      from public.base_transacoes where linha is null or linha >= v_ini) x
    where b.id = x.id and b.linha is distinct from x.nova;
  end if;
  return jsonb_build_object('ok', true, 'inseridas', v_ins, 'ignoradas', v_ign, 'ids', to_jsonb(v_ids));
end $$;

-- ---------- porta B: corrigir ou excluir uma linha ----------
-- acha como o planilha_base_copia.escolher_linha: placa + data ao segundo (com tanque, só aquele combustível), preferindo a linha
-- informada; placa já trocada: a linha informada com a mesma data; senão a única linha com aquela data
create or replace function public.gestao_achar_linha(p_linha integer, p_placa text, p_data float8, p_tanque text) returns bigint
language plpgsql security definer set search_path = public, gestao as $$
declare v_data timestamp := public.gestao_de_serial(p_data); v_id bigint; n integer;
begin
  create temporary table if not exists _cand (id bigint, linha integer) on commit drop;
  truncate _cand;
  insert into _cand select b.id, b.linha from public.base_transacoes b where public.gestao_norm_placa(b.placa) = public.gestao_norm_placa(p_placa)
    and b.data_transacao = v_data and (p_tanque is null or (p_tanque = 'arla') = (gestao.chave(b.tipo_combustivel) like '%ARLA%'));
  select c.id into v_id from _cand c where c.linha = p_linha;
  if v_id is not null then return v_id; end if;
  select count(*) into n from _cand;
  if n >= 1 then select c.id into v_id from _cand c order by c.linha limit 1; return v_id; end if;
  select b.id into v_id from public.base_transacoes b where b.linha = p_linha and b.data_transacao = v_data;
  if v_id is not null then return v_id; end if;
  select count(*) into n from public.base_transacoes b where b.data_transacao = v_data;
  if n = 1 then select b.id into v_id from public.base_transacoes b where b.data_transacao = v_data; end if;
  return v_id;
end $$;

create or replace function public.gestao_aplicar_alteracao(p_acao text, p_linha integer, p_placa text, p_data float8, p_celulas jsonb, p_tanque text)
returns jsonb language plpgsql security definer set search_path = public, gestao as $$
declare v_id bigint := public.gestao_achar_linha(p_linha, p_placa, p_data, nullif(p_tanque, '')); k text; col text[]; v_val text;
  b public.base_transacoes;
begin
  if v_id is null then return jsonb_build_object('ok', false, 'erro', 'abastecimento não encontrado no banco (placa ' || coalesce(p_placa, '') || ')'); end if;
  if p_acao = 'excluir' then
    -- exclusão só com a mesma placa: se a linha já saiu (pedido repetido), os últimos recursos da busca achariam outro veículo
    if not exists (select 1 from public.base_transacoes where id = v_id and public.gestao_norm_placa(placa) = public.gestao_norm_placa(p_placa)) then
      return jsonb_build_object('ok', false, 'erro', 'abastecimento não encontrado no banco para excluir (placa ' || coalesce(p_placa, '') || ')');
    end if;
    delete from public.base_transacoes where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'acao', 'excluir');
  end if;
  for k in select jsonb_object_keys(coalesce(p_celulas, '{}'::jsonb)) loop
    col := public.gestao_coluna_base(k);
    if col is null then continue; end if;
    v_val := public.gestao_valor_coluna(p_celulas->k, col[2]);
    if col[2] = 'd' then
      execute format('update public.base_transacoes set %I = $1 where id = $2', col[1])
        using (case when v_val is null then null else public.gestao_de_serial(v_val::float8) end), v_id;
    elsif col[2] = 'n' then
      execute format('update public.base_transacoes set %I = $1::numeric where id = $2', col[1]) using nullif(v_val, ''), v_id;
    else
      execute format('update public.base_transacoes set %I = $1 where id = $2', col[1]) using v_val, v_id;
    end if;
  end loop;
  select * into b from public.base_transacoes where id = v_id;
  -- placa nova (F): tipo de frota, modelo, número de frota e ano (G-J) do último abastecimento da placa nova
  if p_celulas ? 'F' then
    update public.base_transacoes t set tipo_frota = u.tipo_frota, modelo_veiculo = u.modelo_veiculo, numero_frota = u.numero_frota, ano_veiculo = u.ano_veiculo
    from (select x.tipo_frota, x.modelo_veiculo, x.numero_frota, x.ano_veiculo from public.base_transacoes x
          where public.gestao_norm_placa(x.placa) = public.gestao_norm_placa(b.placa) and x.id <> v_id order by x.data_transacao desc limit 1) u
    where t.id = v_id;
  end if;
  -- motorista novo (L): matrícula (K) do último abastecimento do motorista
  if p_celulas ? 'L' and not p_celulas ? 'K' then
    update public.base_transacoes t set matricula = u.matricula
    from (select x.matricula from public.base_transacoes x where gestao.chave(x.nome_motorista) = gestao.chave(b.nome_motorista) and x.id <> v_id
          and x.matricula is not null order by x.data_transacao desc limit 1) u
    where t.id = v_id;
  end if;
  -- placa, data ou combustível mudaram: refaz a chave
  if p_celulas ?| array['E', 'F', 'N'] then
    update public.base_transacoes t set chave = public.gestao_chave_livre(t.placa, t.data_transacao, t.tipo_combustivel, t.id) where t.id = v_id;
  end if;
  update public.base_transacoes set sincronizado_em = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'acao', 'editar');
end $$;

revoke all on function public.gestao_aplicar_lote(jsonb) from public, anon, authenticated;
revoke all on function public.gestao_aplicar_alteracao(text, integer, text, float8, jsonb, text) from public, anon, authenticated;
grant execute on function public.gestao_aplicar_lote(jsonb) to service_role;
grant execute on function public.gestao_aplicar_alteracao(text, integer, text, float8, jsonb, text) to service_role;
notify pgrst, 'reload schema';
