-- Rateio das NFs: preço da nota só quando a nota fecha, e uma vez só (17/11/2026, pedido do usuário). O pedido de correção
-- passa a levar o tanque (diesel/arla) para o vigia não gravar o preço do diesel na linha do Arla do mesmo caminhão
-- (os dois são lançados no mesmo segundo). NULL = correções antigas e as do Editar abastecimentos.
ALTER TABLE alteracoes_base_copia ADD COLUMN tanque TEXT;
