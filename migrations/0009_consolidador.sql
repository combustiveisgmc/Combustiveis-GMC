-- Consolidador de abastecimentos (Operacional > Consolidador).
-- consolidador_postos: decisões do usuário sobre postos que não estão na Base (painel "Postos pendentes"). Ficam gravadas
-- e valem nas próximas consolidações, sem perguntar de novo. chave = nome do posto normalizado (maiúsculas, sem acento).
CREATE TABLE consolidador_postos (
  chave        TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,                  -- nome como veio no arquivo da plataforma
  decisao      TEXT NOT NULL CHECK (decisao IN ('mesmo', 'novo', 'ignorar')),
  canonico     TEXT,                           -- 'mesmo': nome do posto já cadastrado na Base
  endereco     TEXT, cidade TEXT, uf TEXT,     -- 'novo': endereço do próprio arquivo
  usuario_nome TEXT NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- consolidador_lotes: abastecimentos processados no site, esperando o vigia acrescentar na planilha
-- CONTROLES\Base_copia.xlsx (aba Transações). linhas = JSON [[fonte, ...48 colunas da Base]].
CREATE TABLE consolidador_lotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  resumo       TEXT NOT NULL,                  -- JSON: contagens por fonte, duplicados, avisos
  linhas       TEXT NOT NULL,
  chaves       TEXT NOT NULL,                  -- JSON: placa§hodômetro§combustível de cada linha (duplicidade até a Base nova)
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,
  aplicada_em  TEXT,
  linha_inicial INTEGER,
  linha_final  INTEGER
);
CREATE INDEX idx_consolidador_lotes_estado ON consolidador_lotes(estado, id);
