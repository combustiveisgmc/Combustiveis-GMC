-- Consulta de KM: hodômetros que passaram de 999.999 km e voltaram a zero ("viraram 1 milhão").
-- Marcado na página (no histórico da placa). A partir do dia da virada, as leituras da placa contam com +1.000.000 km
-- nas comparações, e o aviso "menor que a leitura de ... km: conferir" some. dia = dias desde 01/01/1970 (o "dia" do site).
CREATE TABLE km_viradas (
  placa        TEXT NOT NULL,
  dia          INTEGER NOT NULL,
  usuario_nome TEXT NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (placa, dia)
);
