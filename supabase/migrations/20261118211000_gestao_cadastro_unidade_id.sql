-- Correção de 20261118210000_gestao_cadastro_tabelas.sql: em gestao.unidade_id o parâmetro "nome" tinha o mesmo nome da coluna
-- cadastro.unidades.nome e a consulta comparava a coluna com ela mesma (todas as unidades batiam). Usa $1.
create or replace function gestao.unidade_id(nome text) returns integer language sql stable as $$
  select coalesce(
    (select u.id from cadastro.unidades u where gestao.chave(u.nome) = gestao.chave($1) order by u.id limit 1),
    (select a.unidade_id from cadastro.unidade_apelidos a where a.apelido = gestao.chave($1)))
$$;
notify pgrst, 'reload schema';
