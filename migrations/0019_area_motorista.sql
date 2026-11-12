-- Área do motorista (/motorista/): o motorista entra com o CPF (senha = 6 primeiros dígitos, decisão do usuário) e vê só
-- os próprios abastecimentos. Sessão separada da gestão (cookie "sessao_motorista"); o motorista vem do cadastro
-- (planilha Controle_motoristas_e_placas, chave "cadastros" do KV), não da tabela usuarios.
CREATE TABLE sessoes_motoristas (
  token_hash  TEXT PRIMARY KEY,
  cpf         TEXT NOT NULL,          -- só os números
  nome        TEXT NOT NULL,          -- nome do cadastro no momento do login (liga aos abastecimentos)
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expira_em   INTEGER NOT NULL        -- segundos desde 1970
);
CREATE INDEX idx_sessoes_motoristas_expira ON sessoes_motoristas(expira_em);