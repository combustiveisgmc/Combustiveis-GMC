-- Ajustes do modelo `gestao` (17/11/2026, respostas do usuário sobre o que não estava alinhado):
--  * lançamentos sem placa (VAZAMENTO, LAVAGEM, LIMPEZA NO TANQUE...) são desperdício/consumo avulso, não abastecimento de veículo;
--  * compras das bombas também vêm das planilhas de rateio (abas de NF e Base NF STOCK): origem 'rateio'.

alter table gestao.abastecimentos
  add column if not exists tipo text not null default 'abastecimento' check (tipo in ('abastecimento', 'desperdicio')),
  add column if not exists descricao text;
comment on column gestao.abastecimentos.tipo is 'desperdicio = lançamento sem veículo (vazamento, lavagem, limpeza de tanque...): a descrição fica em descricao';

alter table gestao.compras_combustivel drop constraint if exists compras_combustivel_origem_check;
alter table gestao.compras_combustivel add constraint compras_combustivel_origem_check check (origem in ('site', 'planilha', 'rateio'));
alter table gestao.compras_combustivel add column if not exists arquivo text;   -- planilha de rateio de onde a nota veio
comment on column gestao.compras_combustivel.origem is 'site = Movimentações; planilha = Base > Bomba interna; rateio = planilhas de rateio (NF que não estava nas outras)';
