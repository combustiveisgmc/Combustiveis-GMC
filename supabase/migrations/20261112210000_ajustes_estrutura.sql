-- Ajustes de estrutura depois da revisão de 12/11/2026 (pedido do usuário): identidade estável dos abastecimentos, índices
-- para o site consultar rápido e sem as colunas que eram cópia.

-- base_transacoes ------------------------------------------------------------------------------------------------
-- colunas de fórmula da Base_copia que no banco são cópia: ano e mês da data, placa+hodômetro, "00:00:00", vazia
alter table public.base_transacoes
  drop column if exists ano_2,
  drop column if exists mes,
  drop column if exists cod_unid,
  drop column if exists data_ref,
  drop column if exists def_posto;
-- "ano" é o ano do veículo (o da transação sai de data_transacao)
alter table public.base_transacoes rename column ano to ano_veiculo;
-- identidade do abastecimento: placa|data e hora|hodômetro|combustível|litros (o código da transação não é único e a linha
-- da planilha muda quando um lote entra no meio). Preenchida por scripts/supabase_sync.py
alter table public.base_transacoes add column if not exists chave text;
create unique index if not exists base_transacoes_chave on public.base_transacoes (chave);
create index if not exists base_transacoes_placa_data on public.base_transacoes (placa, data_transacao);
create index if not exists base_transacoes_data on public.base_transacoes (data_transacao);
create index if not exists base_transacoes_unidade_data on public.base_transacoes (informacao_adicional_3, data_transacao);
create index if not exists base_transacoes_codigo on public.base_transacoes (codigo_transacao);
comment on column public.base_transacoes.chave is 'Identidade estável do abastecimento: placa|data e hora|hodômetro|combustível|litros (repetida ganha #2)';
comment on column public.base_transacoes.codigo_transacao is 'Código do cartão. NÃO é único: vazio em TruckPag/Veloe/Vibra/manuais e repetido em lançamentos de cartão físico';
comment on column public.base_transacoes.linha is 'Linha atual na Base_copia (muda quando um lote entra no meio da planilha; use a chave)';
comment on column public.base_transacoes.ano_veiculo is 'Ano do veículo (não é o ano do abastecimento)';

-- anp_precos -----------------------------------------------------------------------------------------------------
create index if not exists anp_precos_busca on public.anp_precos (estado, municipio, produto, mes);
comment on column public.anp_precos.concatenado is 'NÃO é único: o mesmo município em estados diferentes (ex.: Valença BA e RJ). Cruzar por estado + município + produto + mês';

-- consolidador_lotes ---------------------------------------------------------------------------------------------
-- os abastecimentos do lote ficam em base_transacoes depois de aplicado: no espelho só fica o resumo
alter table public.consolidador_lotes drop column if exists linhas;

-- históricos que guardam a linha da planilha -----------------------------------------------------------------------
comment on column public.alteracoes_base_copia.linha is 'Linha da Base_copia quando a alteração foi feita (pode ter mudado depois; o vigia acha o abastecimento por placa e data)';
create index if not exists alteracoes_base_copia_placa on public.alteracoes_base_copia (placa);
