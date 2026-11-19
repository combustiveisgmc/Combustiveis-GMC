-- Migração 100% nuvem, etapa 15.2 passo 3 (19/11/2026; plano em docs/MIGRACAO-PASSO3.md): os pedidos das filas passam a ser
-- aplicados também direto no banco (Supabase, public.base_transacoes). O "estado" continua sendo o da planilha Base_copia, que o vigia
-- segue gravando como cópia de segurança; estas colunas dizem se (e quando) o pedido já está no banco.
ALTER TABLE consolidador_lotes ADD COLUMN banco_aplicado_em TEXT;
ALTER TABLE consolidador_lotes ADD COLUMN banco_mensagem TEXT;
ALTER TABLE alteracoes_base_copia ADD COLUMN banco_aplicado_em TEXT;
ALTER TABLE alteracoes_base_copia ADD COLUMN banco_mensagem TEXT;
