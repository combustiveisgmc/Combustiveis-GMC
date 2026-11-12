-- Revezamento dos vigias (computadores da sincronização): só um trabalha por vez.
-- O de menor "prioridade" (1 = principal) que estiver dando sinal fica de plantão; o reserva só assume quando o
-- principal para de dar sinal, e devolve o plantão quando ele volta.
CREATE TABLE vigias (
  maquina     TEXT PRIMARY KEY,          -- nome do computador
  prioridade  INTEGER NOT NULL,          -- 1 = principal, 2 = reserva...
  visto_em    INTEGER NOT NULL           -- último sinal (unix, segundos)
);
CREATE TABLE plantao (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  maquina     TEXT,                      -- quem está trabalhando agora
  desde       INTEGER,                   -- quando assumiu (unix)
  renovado    INTEGER                    -- último sinal de quem está de plantão (unix)
);
INSERT INTO plantao (id, maquina, desde, renovado) VALUES (1, NULL, NULL, NULL);
