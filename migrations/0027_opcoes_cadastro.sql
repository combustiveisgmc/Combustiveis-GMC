-- Opções configuráveis dos cadastros (18/11/2026, pedido do usuário: engrenagem dentro de cada tela de cadastro para configurar as
-- variáveis, ex.: categoria da placa). Uma linha por tela e campo; valores = lista JSON gravada pela API (functions/api/opcoes.js).
-- Sem linha: o formulário usa as opções de antes (as que já existem nos dados).
CREATE TABLE IF NOT EXISTS opcoes_cadastro (
  tela           TEXT NOT NULL,
  campo          TEXT NOT NULL,
  valores        TEXT NOT NULL,
  atualizado_por TEXT,
  atualizado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tela, campo)
);
