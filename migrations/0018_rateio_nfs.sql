-- Bomba interna > Rateio das NFs.
-- As compras (Movimentações) são as notas fiscais: ganham fornecedor, CNPJ e data de emissão (para o fiscal).
ALTER TABLE bomba_movimentacoes ADD COLUMN fornecedor TEXT;
ALTER TABLE bomba_movimentacoes ADD COLUMN cnpj TEXT;
ALTER TABLE bomba_movimentacoes ADD COLUMN emissao TEXT;            -- 'AAAA-MM-DD'

-- Onde o rateio do portal começa em cada tanque (antes disso as notas foram rateadas na planilha):
--   quando     = data e hora ('AAAA-MM-DDTHH:MM:SS') do primeiro abastecimento rateado no portal;
--   placa      = placa dele (desempata dois abastecimentos no mesmo segundo);
--   ja_rateado = litros desse primeiro abastecimento que ficaram na última nota da planilha (o resto abre a primeira nota do portal).
-- Sem linha aqui, o portal mostra o rateio mas não muda o preço de nenhum abastecimento.
CREATE TABLE bomba_rateio_inicio (
  base_id       INTEGER NOT NULL REFERENCES bomba_bases(id),
  tanque        TEXT NOT NULL CHECK (tanque IN ('diesel', 'arla')),
  quando        TEXT NOT NULL,
  placa         TEXT,
  ja_rateado    REAL NOT NULL DEFAULT 0,
  usuario_nome  TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (base_id, tanque)
);

-- Centro de custo corrigido na validação, por abastecimento (chave placa|minuto|litros×100). O vigia leva a correção para a
-- INFORMAÇÃO ADICIONAL 3 da Base_copia (ou para o lote D-1, se o abastecimento ainda não estiver lá).
CREATE TABLE bomba_rateio_cc (
  chave         TEXT PRIMARY KEY,
  cc            TEXT NOT NULL,
  usuario_nome  TEXT NOT NULL,
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Validação de cada rateio (nota) antes de ir para o fiscal. Guarda a foto do rateio validado (linhas e totais em JSON):
-- é o que o fiscal vê, mesmo que algo mude depois. Reabrir apaga a validação.
CREATE TABLE bomba_rateio_validacoes (
  mov_id       INTEGER PRIMARY KEY REFERENCES bomba_movimentacoes(id),
  usuario_nome TEXT NOT NULL,
  validado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  dados        TEXT NOT NULL
);

-- Conferência de cada rateio (nota) por quem recebe (fiscal etc.): uma por pessoa e nota.
CREATE TABLE bomba_rateio_conferencias (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mov_id       INTEGER NOT NULL REFERENCES bomba_movimentacoes(id),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (mov_id, usuario_id)
);