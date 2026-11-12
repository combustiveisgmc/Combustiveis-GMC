-- Mapa de calor: coordenadas de postos cadastradas pelo site (lista "Postos sem coordenadas"), esperando o vigia gravar
-- na planilha LOCALIZAÇÃO DOS POSTOS (scripts/planilha_locais.py). nome = NOME ESTABELECIMENTO como na Base (é a chave
-- que o mapa usa); se o posto já está na planilha (ex.: coordenada suspeita), só a latitude e a longitude são trocadas.
CREATE TABLE alteracoes_locais (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  nome         TEXT NOT NULL,
  cidade       TEXT,
  uf           TEXT,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aguardando', 'aplicada', 'erro')),
  mensagem     TEXT,
  aplicada_em  TEXT,
  linha        INTEGER
);
CREATE INDEX idx_alteracoes_locais_estado ON alteracoes_locais(estado, id);
