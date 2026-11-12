-- Editar abastecimentos: além de corrigir células, dá para excluir um abastecimento da CONTROLES\Base_copia.xlsx.
-- acao = 'editar' (celulas = {coluna: valor novo}; agora também F placa e L motorista) ou 'excluir' (celulas = {},
-- a linha fica vazia na planilha). antes guarda o que o site mostrava (na exclusão: placa, motorista, hodômetro, litros).
ALTER TABLE alteracoes_base_copia ADD COLUMN acao TEXT NOT NULL DEFAULT 'editar' CHECK (acao IN ('editar', 'excluir'));
