-- Grupo "Bomba interna": estoque das bombas internas, compras (movimentações) e abastecimentos lançados pelo site.
-- Ficam só no site (escolha do usuário em 23/10/2026); os abastecimentos lançados também vão para a
-- CONTROLES\Base_copia.xlsx como um lote do consolidador (consolidador_lotes, fonte MANUAL).

-- Bases (bombas internas): o posto é o NOME ESTABELECIMENTO dos abastecimentos dela na Base (ex.: POSTO INT RAJA JEQUIE).
-- tanques = JSON {"diesel": {capacidade, inicial, inicialEm, precoInicial}, "arla": {...} ou null}
--   inicial = litros no tanque em inicialEm ('AAAA-MM-DDTHH:MM', hora local); dali em diante: + compras - abastecimentos.
--   Editar o inicial (nova medição) vale como acerto de estoque.
CREATE TABLE bomba_bases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  posto         TEXT NOT NULL,
  tanques       TEXT NOT NULL,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_nome  TEXT NOT NULL
);

-- Compras de combustível (entram no estoque do tanque). quando = 'AAAA-MM-DDTHH:MM' (hora local).
CREATE TABLE bomba_movimentacoes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id      INTEGER NOT NULL REFERENCES bomba_bases(id),
  tanque       TEXT NOT NULL CHECK (tanque IN ('diesel', 'arla')),
  quando       TEXT NOT NULL,
  litros       REAL NOT NULL,
  valor        REAL NOT NULL,
  nf           TEXT,
  obs          TEXT,
  excluida     INTEGER NOT NULL DEFAULT 0,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_nome TEXT NOT NULL
);
CREATE INDEX idx_bomba_mov_base ON bomba_movimentacoes(base_id, quando);

-- Abastecimentos lançados pelo site (Inclusão de abastecimento). Saem do estoque até a Base trazer o mesmo
-- abastecimento (aí conta o da Base). lote_id = consolidador_lotes.id (gravação na Base_copia pelo vigia).
CREATE TABLE bomba_abastecimentos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  base_id      INTEGER NOT NULL REFERENCES bomba_bases(id),
  tanque       TEXT NOT NULL CHECK (tanque IN ('diesel', 'arla')),
  quando       TEXT NOT NULL,
  placa        TEXT NOT NULL,
  km           INTEGER,
  litros       REAL NOT NULL,
  motorista    TEXT,
  preco        REAL,
  lote_id      INTEGER,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_nome TEXT NOT NULL
);
CREATE INDEX idx_bomba_abast_base ON bomba_abastecimentos(base_id, quando);
