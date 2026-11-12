-- Motoristas sem dados pessoais (pedido do usuário, 12/11/2026): CPF, data de nascimento e CNH saem do portal, da planilha
-- e do banco. O login da área do motorista passa a ser um usuário de 6 números (os 6 primeiros do CPF, que já eram a senha);
-- a senha inicial é o próprio usuário e o motorista pode trocar. O cadastro novo ainda pede CPF e nascimento para criar o
-- motorista na Ticket e na TruckPag: ficam em alteracoes_cadastros.pessoais só até o vigia enviar, e são apagados depois.

-- sessões da área do motorista: pelo usuário, não mais pelo CPF (todas as sessões abertas terminam)
DROP TABLE sessoes_motoristas;
CREATE TABLE sessoes_motoristas (
  token_hash  TEXT PRIMARY KEY,
  usuario     TEXT NOT NULL,          -- 6 números (coluna USUARIO da aba Motoristas)
  nome        TEXT NOT NULL,          -- nome do cadastro no momento do login (liga aos abastecimentos)
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expira_em   INTEGER NOT NULL        -- segundos desde 1970
);
CREATE INDEX idx_sessoes_motoristas_expira ON sessoes_motoristas(expira_em);

-- senha e acessos de cada motorista (Cadastro > Motoristas mostra quem já entrou e o último acesso)
CREATE TABLE motoristas_acesso (
  usuario           TEXT PRIMARY KEY,
  nome              TEXT,             -- nome do cadastro no último login
  senha_hash        TEXT,             -- NULL = senha inicial (o próprio usuário)
  senha_trocada_em  TEXT,
  primeiro_acesso   TEXT,
  ultimo_acesso     TEXT,
  acessos           INTEGER NOT NULL DEFAULT 0,
  redefinida_por    TEXT,             -- quem da gestão voltou a senha para a inicial
  redefinida_em     TEXT
);

-- bloqueios de login que levavam o CPF na chave
DELETE FROM tentativas_login WHERE usuario LIKE 'cpf:%';

-- dados para os cartões (CPF, nascimento, CNH) só enquanto o vigia não envia à Ticket/TruckPag
ALTER TABLE alteracoes_cadastros ADD COLUMN pessoais TEXT;

-- histórico do Cadastro > Motoristas: a chave vira o usuário e os dados pessoais saem
UPDATE alteracoes_cadastros SET chave = substr(replace(replace(replace(chave, '.', ''), '-', ''), ' ', ''), 1, 6) WHERE tipo = 'motoristas';
UPDATE alteracoes_cadastros SET dados = CASE
    WHEN json_extract(dados, '$.cpf') IS NOT NULL THEN json_set(json_remove(dados, '$.cpf', '$.dataNascimento', '$.cnh', '$.cnhCategoria', '$.cnhValidade'),
      '$.usuario', substr(replace(replace(json_extract(dados, '$.cpf'), '.', ''), '-', ''), 1, 6))
    ELSE json_remove(dados, '$.dataNascimento', '$.cnh', '$.cnhCategoria', '$.cnhValidade') END
  WHERE tipo = 'motoristas';
UPDATE alteracoes_cadastros SET antes = CASE
    WHEN json_extract(antes, '$.cpf') IS NOT NULL THEN json_set(json_remove(antes, '$.cpf', '$.dataNascimento', '$.cnh', '$.cnhCategoria', '$.cnhValidade'),
      '$.usuario', substr(replace(replace(json_extract(antes, '$.cpf'), '.', ''), '-', ''), 1, 6))
    ELSE json_remove(antes, '$.dataNascimento', '$.cnh', '$.cnhCategoria', '$.cnhValidade') END
  WHERE tipo = 'motoristas' AND antes IS NOT NULL;
-- edições que só mexiam em dado pessoal ficam vazias: saem do histórico
DELETE FROM alteracoes_cadastros WHERE tipo = 'motoristas' AND acao = 'editar' AND dados = '{}';
