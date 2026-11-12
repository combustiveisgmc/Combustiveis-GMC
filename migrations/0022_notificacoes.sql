-- Operacional > Notificações: regras dos avisos que aparecem no canto da tela (toast) para quem está no portal.
-- A conta (ex.: estoque da bomba interna) é feita no navegador, com os mesmos dados da tela de origem; aqui ficam só as regras.
CREATE TABLE notificacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,                       -- título do aviso (ex.: "Estoque baixo")
  tipo           TEXT NOT NULL,                       -- 'estoque-baixo' (outros tipos depois)
  ativa          INTEGER NOT NULL DEFAULT 1,
  condicao       TEXT NOT NULL,                       -- JSON: estoque-baixo = {base_id (null = todas), tanque ('diesel'|'arla'|'todos'), limite, unidade ('litros'|'pct')}
  mensagem       TEXT NOT NULL,                       -- texto com {base} {tanque} {volume} {limite} {capacidade} {percentual}
  nivel          TEXT NOT NULL DEFAULT 'alerta',      -- 'info' | 'alerta' | 'critico'
  destinatarios  TEXT NOT NULL DEFAULT '{"modo":"todos"}',   -- JSON: {modo: 'todos'} (todos com acesso à tela de origem) ou {modo: 'usuarios', ids: [..]}
  repetir        TEXT NOT NULL DEFAULT 'diaria',      -- depois de fechar no X: 'sessao' (volta ao abrir o portal de novo) | 'diaria' | 'horas:N'
  criado_por     TEXT,
  criado_em      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  atualizado_por TEXT,
  atualizado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
