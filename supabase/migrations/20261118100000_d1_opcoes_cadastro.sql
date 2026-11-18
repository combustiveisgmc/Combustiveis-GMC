-- Espelho da tabela nova do D1 opcoes_cadastro (migração 0027, 18/11/2026: opções configuráveis dos cadastros, engrenagem nos
-- formulários). Gerado por `py scripts/supabase_d1.py esquema`. RLS ligado e sem política: só a chave secreta lê e grava.
create table if not exists public."opcoes_cadastro" (
  "tela" text,
  "campo" text,
  "valores" text,
  "atualizado_por" text,
  "atualizado_em" text,
  primary key ("tela", "campo")
);
alter table public."opcoes_cadastro" enable row level security;
comment on table public."opcoes_cadastro" is 'Espelho da tabela opcoes_cadastro do banco da Cloudflare (D1)';
