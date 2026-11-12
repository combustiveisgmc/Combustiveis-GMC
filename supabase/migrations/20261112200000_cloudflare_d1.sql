-- Espelho do banco da Cloudflare (D1) no Supabase (scripts/supabase_d1.py), 12/11/2026. Mesmas tabelas, colunas e
-- chaves do D1; fora: sessões/tentativas de login, d1_migrations e alteracoes_cadastros.pessoais (dados pessoais).
-- RLS ligado e sem política: só a chave secreta lê e grava.

create table if not exists public."alertas_cartoes" (
  "id" bigint,
  "criado_em" text,
  "placa" text,
  "cartoes" text,
  "motorista" text,
  "telefone" text,
  "observacao" text,
  "origem" text,
  "estado" text,
  "resolvido_em" text,
  "resolvido_por" text,
  "nota" text,
  primary key ("id")
);
alter table public."alertas_cartoes" enable row level security;
comment on table public."alertas_cartoes" is 'Espelho da tabela alertas_cartoes do banco da Cloudflare (D1)';

create table if not exists public."alteracoes_base_copia" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "linha" bigint,
  "placa" text,
  "data" double precision,
  "celulas" text,
  "antes" text,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "acao" text,
  primary key ("id")
);
alter table public."alteracoes_base_copia" enable row level security;
comment on table public."alteracoes_base_copia" is 'Espelho da tabela alteracoes_base_copia do banco da Cloudflare (D1)';

create table if not exists public."alteracoes_bomba" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "tipo" text,
  "dados" text,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "linha" bigint,
  primary key ("id")
);
alter table public."alteracoes_bomba" enable row level security;
comment on table public."alteracoes_bomba" is 'Espelho da tabela alteracoes_bomba do banco da Cloudflare (D1)';

create table if not exists public."alteracoes_cadastros" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "tipo" text,
  "acao" text,
  "chave" text,
  "dados" text,
  "antes" text,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "linha" bigint,
  "sem_cartoes" bigint,
  primary key ("id")
);
alter table public."alteracoes_cadastros" enable row level security;
comment on table public."alteracoes_cadastros" is 'Espelho da tabela alteracoes_cadastros do banco da Cloudflare (D1)';

create table if not exists public."alteracoes_cartoes" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "acao" text,
  "chave" text,
  "dados" text,
  "antes" text,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "linha" bigint,
  primary key ("id")
);
alter table public."alteracoes_cartoes" enable row level security;
comment on table public."alteracoes_cartoes" is 'Espelho da tabela alteracoes_cartoes do banco da Cloudflare (D1)';

create table if not exists public."alteracoes_locais" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "nome" text,
  "cidade" text,
  "uf" text,
  "lat" double precision,
  "lon" double precision,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "linha" bigint,
  primary key ("id")
);
alter table public."alteracoes_locais" enable row level security;
comment on table public."alteracoes_locais" is 'Espelho da tabela alteracoes_locais do banco da Cloudflare (D1)';

create table if not exists public."alteracoes_postos" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "acao" text,
  "dados" text,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "linha" bigint,
  primary key ("id")
);
alter table public."alteracoes_postos" enable row level security;
comment on table public."alteracoes_postos" is 'Espelho da tabela alteracoes_postos do banco da Cloudflare (D1)';

create table if not exists public."bomba_abastecimentos" (
  "id" bigint,
  "base_id" bigint,
  "tanque" text,
  "quando" text,
  "placa" text,
  "km" bigint,
  "litros" double precision,
  "motorista" text,
  "preco" double precision,
  "lote_id" bigint,
  "criado_em" text,
  "usuario_nome" text,
  "excluido" bigint,
  "linha" text,
  "alteracao_id" bigint,
  "editado_em" text,
  "editado_por" text,
  primary key ("id")
);
alter table public."bomba_abastecimentos" enable row level security;
comment on table public."bomba_abastecimentos" is 'Espelho da tabela bomba_abastecimentos do banco da Cloudflare (D1)';

create table if not exists public."bomba_bases" (
  "id" bigint,
  "nome" text,
  "posto" text,
  "tanques" text,
  "ativo" bigint,
  "criado_em" text,
  "atualizado_em" text,
  "usuario_nome" text,
  primary key ("id")
);
alter table public."bomba_bases" enable row level security;
comment on table public."bomba_bases" is 'Espelho da tabela bomba_bases do banco da Cloudflare (D1)';

create table if not exists public."bomba_movimentacoes" (
  "id" bigint,
  "base_id" bigint,
  "tanque" text,
  "quando" text,
  "litros" double precision,
  "valor" double precision,
  "nf" text,
  "obs" text,
  "excluida" bigint,
  "criado_em" text,
  "usuario_nome" text,
  "fornecedor" text,
  "cnpj" text,
  "emissao" text,
  primary key ("id")
);
alter table public."bomba_movimentacoes" enable row level security;
comment on table public."bomba_movimentacoes" is 'Espelho da tabela bomba_movimentacoes do banco da Cloudflare (D1)';

create table if not exists public."bomba_rateio_cc" (
  "chave" text,
  "cc" text,
  "usuario_nome" text,
  "atualizado_em" text,
  primary key ("chave")
);
alter table public."bomba_rateio_cc" enable row level security;
comment on table public."bomba_rateio_cc" is 'Espelho da tabela bomba_rateio_cc do banco da Cloudflare (D1)';

create table if not exists public."bomba_rateio_conferencias" (
  "id" bigint,
  "mov_id" bigint,
  "usuario_id" bigint,
  "usuario_nome" text,
  "criado_em" text,
  primary key ("id")
);
alter table public."bomba_rateio_conferencias" enable row level security;
comment on table public."bomba_rateio_conferencias" is 'Espelho da tabela bomba_rateio_conferencias do banco da Cloudflare (D1)';

create table if not exists public."bomba_rateio_inicio" (
  "base_id" bigint,
  "tanque" text,
  "quando" text,
  "placa" text,
  "ja_rateado" double precision,
  "usuario_nome" text,
  "atualizado_em" text,
  primary key ("base_id", "tanque")
);
alter table public."bomba_rateio_inicio" enable row level security;
comment on table public."bomba_rateio_inicio" is 'Espelho da tabela bomba_rateio_inicio do banco da Cloudflare (D1)';

create table if not exists public."bomba_rateio_validacoes" (
  "mov_id" bigint,
  "usuario_nome" text,
  "validado_em" text,
  "dados" text,
  primary key ("mov_id")
);
alter table public."bomba_rateio_validacoes" enable row level security;
comment on table public."bomba_rateio_validacoes" is 'Espelho da tabela bomba_rateio_validacoes do banco da Cloudflare (D1)';

create table if not exists public."conferencia_decisoes" (
  "chave" text,
  "decisao" text,
  "usuario_nome" text,
  "criado_em" text,
  primary key ("chave")
);
alter table public."conferencia_decisoes" enable row level security;
comment on table public."conferencia_decisoes" is 'Espelho da tabela conferencia_decisoes do banco da Cloudflare (D1)';

create table if not exists public."conferencia_pedidos" (
  "id" bigint,
  "cartao_id" text,
  "dia" text,
  "placa" text,
  "quando" text,
  "usuario_nome" text,
  "criado_em" text,
  "estado" text,
  "mensagem" text,
  "lote_id" bigint,
  primary key ("id")
);
alter table public."conferencia_pedidos" enable row level security;
comment on table public."conferencia_pedidos" is 'Espelho da tabela conferencia_pedidos do banco da Cloudflare (D1)';

create table if not exists public."consolidador_lotes" (
  "id" bigint,
  "criado_em" text,
  "usuario_id" bigint,
  "usuario_nome" text,
  "resumo" text,
  "linhas" text,
  "chaves" text,
  "estado" text,
  "mensagem" text,
  "aplicada_em" text,
  "linha_inicial" bigint,
  "linha_final" bigint,
  primary key ("id")
);
alter table public."consolidador_lotes" enable row level security;
comment on table public."consolidador_lotes" is 'Espelho da tabela consolidador_lotes do banco da Cloudflare (D1)';

create table if not exists public."consolidador_postos" (
  "chave" text,
  "nome" text,
  "decisao" text,
  "canonico" text,
  "endereco" text,
  "cidade" text,
  "uf" text,
  "usuario_nome" text,
  "criado_em" text,
  primary key ("chave")
);
alter table public."consolidador_postos" enable row level security;
comment on table public."consolidador_postos" is 'Espelho da tabela consolidador_postos do banco da Cloudflare (D1)';

create table if not exists public."contratos_anp" (
  "id" bigint,
  "unidade" text,
  "uf" text,
  "data_contrato" text,
  "produto" text,
  "observacao" text,
  "ativo" bigint,
  "criado_por" text,
  "criado_em" text,
  "atualizado_por" text,
  "atualizado_em" text,
  primary key ("id")
);
alter table public."contratos_anp" enable row level security;
comment on table public."contratos_anp" is 'Espelho da tabela contratos_anp do banco da Cloudflare (D1)';

create table if not exists public."funcoes" (
  "id" bigint,
  "nome" text,
  "descricao" text,
  "permissoes" text,
  "criado_em" text,
  "atualizado_em" text,
  primary key ("id")
);
alter table public."funcoes" enable row level security;
comment on table public."funcoes" is 'Espelho da tabela funcoes do banco da Cloudflare (D1)';

create table if not exists public."km_viradas" (
  "placa" text,
  "dia" bigint,
  "usuario_nome" text,
  "criado_em" text,
  primary key ("placa", "dia")
);
alter table public."km_viradas" enable row level security;
comment on table public."km_viradas" is 'Espelho da tabela km_viradas do banco da Cloudflare (D1)';

create table if not exists public."motoristas_acesso" (
  "usuario" text,
  "nome" text,
  "senha_hash" text,
  "senha_trocada_em" text,
  "primeiro_acesso" text,
  "ultimo_acesso" text,
  "acessos" bigint,
  "redefinida_por" text,
  "redefinida_em" text,
  primary key ("usuario")
);
alter table public."motoristas_acesso" enable row level security;
comment on table public."motoristas_acesso" is 'Espelho da tabela motoristas_acesso do banco da Cloudflare (D1)';

create table if not exists public."notificacoes" (
  "id" bigint,
  "nome" text,
  "tipo" text,
  "ativa" bigint,
  "condicao" text,
  "mensagem" text,
  "nivel" text,
  "destinatarios" text,
  "repetir" text,
  "criado_por" text,
  "criado_em" text,
  "atualizado_por" text,
  "atualizado_em" text,
  primary key ("id")
);
alter table public."notificacoes" enable row level security;
comment on table public."notificacoes" is 'Espelho da tabela notificacoes do banco da Cloudflare (D1)';

create table if not exists public."plantao" (
  "id" bigint,
  "maquina" text,
  "desde" bigint,
  "renovado" bigint,
  primary key ("id")
);
alter table public."plantao" enable row level security;
comment on table public."plantao" is 'Espelho da tabela plantao do banco da Cloudflare (D1)';

create table if not exists public."prime_abastecimentos" (
  "chave" text,
  "mes" text,
  "entra" bigint,
  "motivo" text,
  "aviso" text,
  "motorista_para" text,
  "motorista" text,
  "usuario_nome" text,
  "criado_em" text,
  primary key ("chave")
);
alter table public."prime_abastecimentos" enable row level security;
comment on table public."prime_abastecimentos" is 'Espelho da tabela prime_abastecimentos do banco da Cloudflare (D1)';

create table if not exists public."prime_meses" (
  "mes" text,
  "situacao" text,
  "parametros" text,
  "resultado" text,
  "fechado_por" text,
  "fechado_em" text,
  "atualizado_em" text,
  primary key ("mes")
);
alter table public."prime_meses" enable row level security;
comment on table public."prime_meses" is 'Espelho da tabela prime_meses do banco da Cloudflare (D1)';

create table if not exists public."prime_notas" (
  "mes" text,
  "motorista" text,
  "nota" double precision,
  "motivo" text,
  "usuario_nome" text,
  "criado_em" text,
  primary key ("mes", "motorista")
);
alter table public."prime_notas" enable row level security;
comment on table public."prime_notas" is 'Espelho da tabela prime_notas do banco da Cloudflare (D1)';

create table if not exists public."prime_telemetria" (
  "mes" text,
  "arquivo" text,
  "periodo" text,
  "linhas" text,
  "usuario_nome" text,
  "enviado_em" text,
  primary key ("mes")
);
alter table public."prime_telemetria" enable row level security;
comment on table public."prime_telemetria" is 'Espelho da tabela prime_telemetria do banco da Cloudflare (D1)';

create table if not exists public."usuarios" (
  "id" bigint,
  "usuario" text,
  "nome" text,
  "senha_hash" text,
  "papel" text,
  "ativo" bigint,
  "criado_em" text,
  "trocar_senha" bigint,
  "permissoes" text,
  "ultimo_acesso" text,
  "excluido" bigint,
  "funcao_id" bigint,
  "bomba_bases" text,
  primary key ("id")
);
alter table public."usuarios" enable row level security;
comment on table public."usuarios" is 'Espelho da tabela usuarios do banco da Cloudflare (D1)';

create table if not exists public."vigias" (
  "maquina" text,
  "prioridade" bigint,
  "visto_em" bigint,
  primary key ("maquina")
);
alter table public."vigias" enable row level security;
comment on table public."vigias" is 'Espelho da tabela vigias do banco da Cloudflare (D1)';

create table if not exists public.sincronizacao_cloudflare (
  tabela text primary key,
  linhas integer not null,
  hash text not null,
  sincronizado_em timestamptz not null default now()
);
alter table public.sincronizacao_cloudflare enable row level security;
