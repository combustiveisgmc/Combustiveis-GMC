-- O que cada login pode usar no portal. Administrador (papel 'admin') acessa tudo e gerencia os acessos;
-- os demais ('gestor' = acesso personalizado) só as páginas listadas aqui, em JSON: ["despesas","mapa-calor"].
ALTER TABLE usuarios ADD COLUMN permissoes TEXT NOT NULL DEFAULT '[]';
-- último login com sucesso (mostrado na tela de acessos)
ALTER TABLE usuarios ADD COLUMN ultimo_acesso TEXT;
-- login excluído pela tela de acessos: sai da lista e não entra mais, mas o registro fica
-- (o histórico de alterações de postos aponta para ele)
ALTER TABLE usuarios ADD COLUMN excluido INTEGER NOT NULL DEFAULT 0;
