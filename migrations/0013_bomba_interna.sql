-- Preço bomba interna (Operacional): negociações e fornecedores lançados no site, esperando o vigia gravar na planilha
-- CONTROLES\Negociação bomba interna.xlsx (scripts/planilha_bomba.py).
-- tipo 'negociacao': dados = {data 'AAAA-MM-DD', fornecedor, produto (DIESEL/ARLA), unidade, preco}
-- tipo 'fornecedor': dados = {fornecedor, produto, unidades [..], ativo}
CREATE TABLE alteracoes_bomba (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('negociacao', 'fornecedor')),
  dados        TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,
  aplicada_em  TEXT,
  linha        INTEGER
);
CREATE INDEX idx_alteracoes_bomba_estado ON alteracoes_bomba(estado, id);
