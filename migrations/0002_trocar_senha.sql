-- 1 = o usuário precisa escolher uma senha nova antes de usar a gestão
ALTER TABLE usuarios ADD COLUMN trocar_senha INTEGER NOT NULL DEFAULT 0;
