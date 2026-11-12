-- Alterações de placas e motoristas feitas pelo portal. O vigia do computador da sincronização grava cada uma
-- na planilha CONTROLES\Controle_motoristas_e_placas.xlsx (abas "Carros" e "Motoristas") e informa o resultado.
CREATE TABLE alteracoes_cadastros (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('placas', 'motoristas')),
  acao         TEXT NOT NULL CHECK (acao IN ('adicionar', 'editar')),
  chave        TEXT NOT NULL,                  -- placa ou CPF da linha (o de antes, se ele mesmo mudou)
  dados        TEXT NOT NULL,                  -- JSON só com os campos alterados (senhas apagadas depois de gravadas)
  antes        TEXT,                           -- JSON com os valores anteriores desses campos
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,
  aplicada_em  TEXT,
  linha        INTEGER
);
CREATE INDEX idx_alt_cadastros_estado ON alteracoes_cadastros(estado, id);
CREATE INDEX idx_alt_cadastros_tipo ON alteracoes_cadastros(tipo, id);
