-- Usuários da gestão (motoristas não têm conta)
CREATE TABLE usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario     TEXT NOT NULL UNIQUE,          -- login, sempre em minúsculas
  nome        TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,                 -- pbkdf2$iteracoes$sal$hash
  papel       TEXT NOT NULL DEFAULT 'gestor' CHECK (papel IN ('admin', 'gestor')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE sessoes (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   INTEGER NOT NULL                -- segundos desde 1970 (unix)
);
CREATE INDEX idx_sessoes_expira ON sessoes(expira_em);

CREATE TABLE tentativas_login (
  usuario        TEXT PRIMARY KEY,
  falhas         INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate  INTEGER NOT NULL DEFAULT 0   -- unix; 0 = livre
);
