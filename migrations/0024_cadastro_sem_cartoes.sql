-- Cadastro > Motoristas > Adicionar: caixa "Cadastrar também nos sites dos cartões frota" (marcada por padrão).
-- Desmarcada (motorista que já existe na Ticket/TruckPag), a alteração fica com sem_cartoes = 1 e o vigia não tenta criar
-- o motorista nos cartões (functions/api/sync/cadastros/novos-motoristas.js) — 11/11/2026.
ALTER TABLE alteracoes_cadastros ADD COLUMN sem_cartoes INTEGER NOT NULL DEFAULT 0;
