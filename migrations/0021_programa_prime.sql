-- Dashboards > Programa PRIME: fechamento mensal do ranking dos motoristas (nota da telemetria SS + média de combustível).
-- O que se decide aqui não muda a Base nem a Operação por motorista; só o PRIME e a área do motorista (avisos, nota, estrelas).
CREATE TABLE prime_meses (
  mes           TEXT PRIMARY KEY,     -- AAAA-MM
  situacao      TEXT NOT NULL DEFAULT 'aberto',   -- aberto, fechado
  parametros    TEXT,                 -- JSON: tabelas de prêmio, encarregados e excluídos usados no mês
  resultado     TEXT,                 -- JSON gravado ao fechar: [{motorista, unidade, nota, estrelas, origem, km, media, meta, ...}]
  fechado_por   TEXT,
  fechado_em    TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- abastecimentos que não entram no PRIME (sem linha = entra). chave = placa|dia|hodômetro (dia = dias desde 1970, como no arquivo
-- de abastecimentos). O km do que sai passa para o abastecimento seguinte da mesma placa, mesmo no mês seguinte.
CREATE TABLE prime_abastecimentos (
  chave          TEXT PRIMARY KEY,
  mes            TEXT NOT NULL,
  entra          INTEGER NOT NULL DEFAULT 0,
  motivo         TEXT,
  aviso          TEXT,                -- texto que o motorista vê na área dele
  motorista_para TEXT,                -- troca de motorista só para o PRIME (vazio = o da Base)
  motorista      TEXT,                -- motorista do abastecimento (para a área do motorista achar os avisos dele)
  usuario_nome   TEXT,
  criado_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX prime_abastecimentos_mes ON prime_abastecimentos (mes);
CREATE INDEX prime_abastecimentos_motorista ON prime_abastecimentos (motorista);
-- exportação "Pontuação resumida" da telemetria SS do mês (a última enviada vale)
CREATE TABLE prime_telemetria (
  mes          TEXT PRIMARY KEY,
  arquivo      TEXT,
  periodo      TEXT,                  -- "Filtros aplicados" do rodapé
  linhas       TEXT NOT NULL,         -- JSON: [{nome, pontos, horas, km}]
  usuario_nome TEXT,
  enviado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- nota manual (carro sem SS, ou telemetria que cobriu menos de 50% do km e daria prêmio)
CREATE TABLE prime_notas (
  mes          TEXT NOT NULL,
  motorista    TEXT NOT NULL,         -- nome sem acento, maiúsculo
  nota         REAL NOT NULL,
  motivo       TEXT,
  usuario_nome TEXT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (mes, motorista)
);
