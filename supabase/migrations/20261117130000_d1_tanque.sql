-- Espelho do D1: migrations/0026_rateio_preco_fechado.sql (17/11/2026) acrescentou o tanque (diesel/arla) aos pedidos de
-- correção da Base_copia (preço da nota do Rateio das NFs só no combustível certo).
alter table public.alteracoes_base_copia add column if not exists "tanque" text;
