-- Alterações de postos feitas pelo portal. Cada uma vira uma linha nova na aba
-- "Base de dados de negociações" da planilha, gravada pelo vigia do computador da sincronização.
CREATE TABLE alteracoes_postos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL CHECK (acao IN ('adicionar', 'editar', 'bloquear', 'autorizar')),
  dados        TEXT NOT NULL,                  -- JSON com os campos da linha da planilha
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,                           -- motivo de "aguardando" (planilha aberta) ou "erro"
  aplicada_em  TEXT,
  linha        INTEGER                         -- número da linha gravada na planilha
);
CREATE INDEX idx_alteracoes_estado ON alteracoes_postos(estado, id);
