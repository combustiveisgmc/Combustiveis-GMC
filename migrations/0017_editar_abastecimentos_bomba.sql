-- Bomba interna > Inclusão de abastecimento: editar e excluir os lançados pelo site.
-- A correção vai para a Base_copia pela mesma fila do "Editar abastecimentos" (alteracoes_base_copia, gravada pelo vigia).
--   excluido     = 1: excluído (sai do estoque e da lista; a linha sai da Base_copia)
--   linha        = JSON [fonte, ...48 colunas] como está agora (NULL = a do lote original); base para a próxima correção
--   alteracao_id = última correção/exclusão pedida (alteracoes_base_copia.id): enquanto pendente, não aceita outra
ALTER TABLE bomba_abastecimentos ADD COLUMN excluido INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bomba_abastecimentos ADD COLUMN linha TEXT;
ALTER TABLE bomba_abastecimentos ADD COLUMN alteracao_id INTEGER;
ALTER TABLE bomba_abastecimentos ADD COLUMN editado_em TEXT;
ALTER TABLE bomba_abastecimentos ADD COLUMN editado_por TEXT;
