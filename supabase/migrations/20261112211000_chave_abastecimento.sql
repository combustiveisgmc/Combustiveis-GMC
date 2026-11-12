-- A chave do abastecimento passa a ser placa|data e hora|combustível (não muda quando o portal corrige hodômetro ou litros).
comment on column public.base_transacoes.chave is 'Identidade estável do abastecimento: placa|data e hora|combustível (repetida ganha #2). Não muda quando hodômetro ou litros são corrigidos';
