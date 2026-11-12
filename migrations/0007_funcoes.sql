-- Funções (perfis de acesso): um conjunto de permissões com nome. O login com função recebe as permissões dela
-- (e acompanha quando a função é editada); sem função, vale a lista personalizada do próprio login (usuarios.permissoes).
-- Administrador (papel 'admin') continua acima de tudo.
CREATE TABLE funcoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descricao     TEXT NOT NULL DEFAULT '',
  permissoes    TEXT NOT NULL DEFAULT '[]',   -- JSON, mesmos ids de lib/permissoes.js
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
ALTER TABLE usuarios ADD COLUMN funcao_id INTEGER REFERENCES funcoes(id);

-- funções predefinidas (podem ser editadas ou excluídas na tela Gerenciar acessos)
INSERT INTO funcoes (nome, descricao, permissoes) VALUES
  ('Consulta de dashboards', 'Todos os dashboards e mapas, só para consulta.',
   '["operacao-motorista","despesas","evolucao-placas","media-geral","preco-fornecedor","preco-postos","preco-anp","contratos-anp","consulta-km","mapa-calor","roteirizador"]'),
  ('Negociação de postos', 'Preços e postos: negociar, atualizar a lista dos motoristas e fazer a rodada de preços.',
   '["preco-postos","preco-anp","contratos-anp","mapa-calor","roteirizador","postos-motoristas","postos-editar","rodada-precos"]'),
  ('Cadastros', 'Consulta e edição de placas e motoristas.',
   '["cadastro-placas","cadastro-placas-editar","cadastro-motoristas","cadastro-motoristas-editar"]'),
  ('Gestor completo', 'Tudo no portal, menos gerenciar os acessos.',
   '["operacao-motorista","despesas","evolucao-placas","media-geral","preco-fornecedor","preco-postos","preco-anp","contratos-anp","consulta-km","mapa-calor","roteirizador","postos-motoristas","postos-editar","rodada-precos","cadastro-placas","cadastro-placas-editar","cadastro-motoristas","cadastro-motoristas-editar"]');
