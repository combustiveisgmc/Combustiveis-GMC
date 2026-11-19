-- Espelho das colunas novas do D1 (migração 0028_aplicado_no_banco.sql, 19/11/2026): se o pedido da fila já foi aplicado no banco.
alter table public."consolidador_lotes" add column if not exists "banco_aplicado_em" text;
alter table public."consolidador_lotes" add column if not exists "banco_mensagem" text;
alter table public."alteracoes_base_copia" add column if not exists "banco_aplicado_em" text;
alter table public."alteracoes_base_copia" add column if not exists "banco_mensagem" text;
