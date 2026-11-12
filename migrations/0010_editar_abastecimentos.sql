-- Edição de abastecimentos (Operacional > Editar abastecimentos).
-- Cada registro é a correção de um abastecimento (uma linha da aba Transações da CONTROLES\Base_copia.xlsx), esperando
-- o vigia gravar na planilha. celulas = JSON {coluna: valor novo} (P vl/litro, Q hodômetro, R km rodados, S km/litro,
-- T valor emissão, AB informação adicional 1, AD informação adicional 3); antes = os valores que o site mostrava.
-- linha + placa + data identificam o abastecimento (data = número serial do Excel, como na coluna E).
CREATE TABLE alteracoes_base_copia (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  linha        INTEGER NOT NULL,
  placa        TEXT NOT NULL,
  data         REAL NOT NULL,
  celulas      TEXT NOT NULL,
  antes        TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,
  aplicada_em  TEXT
);
CREATE INDEX idx_alteracoes_base_copia_estado ON alteracoes_base_copia(estado, id);
