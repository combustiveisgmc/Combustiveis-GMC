-- Operacional > Conferência com os cartões: compara a Base_copia com as APIs da Ticket e da TruckPag (scripts/conferencia_cartoes.mjs).
-- Decisões de quem confere ("manter o nosso", "ignorar") para a diferença não voltar a aparecer, e pedidos de inclusão de transações
-- que estão no cartão e faltam na Base_copia (o vigia monta o lote, como o D-1 das APIs).
CREATE TABLE conferencia_decisoes (
  chave         TEXT PRIMARY KEY,     -- dif|placa|minuto|coluna|valor do cartão · falta|id do cartão · sumiu|placa|minuto
  decisao       TEXT NOT NULL,        -- manter
  usuario_nome  TEXT,
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE conferencia_pedidos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id     TEXT NOT NULL UNIQUE, -- ticket:123 / truckpag:456
  dia           TEXT NOT NULL,        -- AAAA-MM-DD da transação
  placa         TEXT,
  quando        TEXT,
  usuario_nome  TEXT,
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  estado        TEXT NOT NULL DEFAULT 'pendente',   -- pendente, feito, duplicado, erro
  mensagem      TEXT,
  lote_id       INTEGER
);