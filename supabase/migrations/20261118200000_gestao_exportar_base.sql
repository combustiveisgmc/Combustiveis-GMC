-- Exportar do Editar abastecimentos (18/11/2026, pedido do usuário: planilha igual à Base_copia, seguindo os filtros da tela,
-- para atualizar a Base.xlsx à mão depois da migração para a nuvem).
-- Devolve as linhas pedidas (número da linha na Base_copia) com as 40 colunas A..AN da aba Transações na ordem da planilha, mais
-- CAMPANHA e a linha; as colunas de fórmula (ANO, MÊS, COD UNID., DATA REF, DEF POSTO e a chave da coluna AV) são refeitas no
-- navegador (public/gestao/lib/exportar-base.js). Um valor só (jsonb), para não esbarrar no limite de linhas da API.
create or replace function public.gestao_exportar_base(p_linhas integer[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(
    b.codigo_transacao, b.forma_de_pagamento, b.codigo_cliente, b.nome_reduzido, b.data_transacao, b.placa, b.tipo_frota,
    b.modelo_veiculo, b.numero_frota, b.ano_veiculo, b.matricula, b.nome_motorista, b.servico, b.tipo_combustivel, b.litros,
    b.vl_litro, b.hodometro_ou_horimetro, b.km_rodados_ou_horas_trabalhadas, b.km_litro_ou_litros_hora, b.valor_emissao,
    b.codigo_estabelecimento, b.nome_estabelecimento, b.tipo_estabelecimento, b.endereco, b.bairro, b.cidade, b.uf,
    b.informacao_adicional_1, b.informacao_adicional_2, b.informacao_adicional_3, b.informacao_adicional_4,
    b.informacao_adicional_5, b.forma_transacao, b.codigo_liberacao_restricao, b.serie_pos, b.numero_cartao,
    b.familia_veiculo, b.grupo_restricao, b.codigo_emissora, b.responsavel, b.campanha, b.linha
  ) order by b.linha), '[]'::jsonb)
  from public.base_transacoes b
  where b.linha = any(p_linhas)
$$;
revoke all on function public.gestao_exportar_base(integer[]) from public, anon, authenticated;
grant execute on function public.gestao_exportar_base(integer[]) to service_role;
comment on function public.gestao_exportar_base(integer[]) is 'Exportar do Editar abastecimentos: linhas da Base_copia (colunas A..AN + campanha + linha)';
