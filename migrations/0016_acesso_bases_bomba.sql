-- Bomba interna: quais bases cada login vê (Gerenciar acessos).
-- NULL = todas as bases (inclusive as criadas depois); JSON com ids ([1,3]) = só essas; [] = nenhuma.
-- Administrador vê todas, seja qual for o valor.
ALTER TABLE usuarios ADD COLUMN bomba_bases TEXT;
