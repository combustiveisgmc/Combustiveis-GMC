-- Controle dos cartões frota (planilha CONTROLES\CONTROLE CARTÕES FROTA.xlsx, aba CARTÕES).
-- alteracoes_cartoes: mudanças de situação feitas pelo portal; o vigia grava na planilha e informa o resultado.
CREATE TABLE alteracoes_cartoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL CHECK (acao IN ('adicionar', 'editar')),
  chave        TEXT NOT NULL,                  -- placa da linha
  dados        TEXT NOT NULL,                  -- JSON só com os cartões alterados {ticket, truckpag, veloe}
  antes        TEXT,                           -- JSON com as situações anteriores
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,
  aplicada_em  TEXT,
  linha        INTEGER
);
CREATE INDEX idx_alt_cartoes_estado ON alteracoes_cartoes(estado, id);

-- alertas_cartoes: avisos dos motoristas (formulário da página dos postos) de cartão faltando no caminhão
CREATE TABLE alertas_cartoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  placa         TEXT NOT NULL,
  cartoes       TEXT NOT NULL,                 -- JSON: ["ticket", "truckpag", "veloe"]
  motorista     TEXT NOT NULL,
  telefone      TEXT,
  observacao    TEXT,
  origem        TEXT,                          -- hash do IP (limite de avisos por aparelho); o IP não é guardado
  estado        TEXT NOT NULL DEFAULT 'aberto' CHECK (estado IN ('aberto', 'resolvido')),
  resolvido_em  TEXT,
  resolvido_por TEXT,
  nota          TEXT
);
CREATE INDEX idx_alertas_cartoes_estado ON alertas_cartoes(estado, id);
CREATE INDEX idx_alertas_cartoes_origem ON alertas_cartoes(origem, criado_em);
