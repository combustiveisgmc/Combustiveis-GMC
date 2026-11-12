-- Dashboards > Contratos x ANP: contratos cadastrados no portal (antes vinham da planilha de reajustes, aba Super).
-- A variação passa a ser ANP da semana escolhida ÷ ANP da semana da data do contrato − 1 (o preço do contrato deixa de ser usado).
CREATE TABLE contratos_anp (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade        TEXT NOT NULL,
  uf             TEXT NOT NULL,                -- estado de referência da ANP (sigla)
  data_contrato  TEXT NOT NULL,                -- AAAA-MM-DD; vale a ANP da semana desta data
  produto        TEXT NOT NULL DEFAULT 'OLEO DIESEL S10',
  observacao     TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_por     TEXT,
  criado_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  atualizado_por TEXT,
  atualizado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- contratos da planilha Controle Reajustes Diesel - 23-07-2026.xlsx (aba Super), publicada em 2026-10-26T15:48:22
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Goiânia', 'GO', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Maceió', 'AL', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Serra', 'ES', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Ilhéus', 'BA', '2026-05-30', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Teixeira', 'BA', '2026-05-30', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Recife', 'PE', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Olinda', 'PE', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('João Pessoa', 'PB', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('São Luís', 'MA', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Salvador', 'BA', '2026-05-30', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Bezerros', 'PE', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Belém', 'PA', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Conquista', 'BA', '2026-05-30', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Betim', 'MG', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Jequié', 'BA', '2026-05-30', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Granel - Goiânia', 'GO', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Granel - Betim', 'MG', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Granel - Rio (Duque)', 'RJ', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
INSERT INTO contratos_anp (unidade, uf, data_contrato, produto, criado_por) VALUES ('Granel - SP (SJC)', 'SP', '2026-03-22', 'OLEO DIESEL S10', 'planilha de reajustes');
