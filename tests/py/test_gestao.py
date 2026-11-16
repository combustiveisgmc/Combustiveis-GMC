"""Testes das regras do modelo relacional (scripts/gestao_normalizar.py) e das conversões da carga (scripts/gestao_carga.py).
Rodar: py -m unittest discover -s tests/py   (ou npm test)"""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
import gestao_normalizar as N  # noqa: E402

try:
    import gestao_carga as G  # precisa do psycopg (instalado no computador do vigia)
except ImportError:  # pragma: no cover
    G = None


class Normalizar(unittest.TestCase):
    def test_chave(self):
        self.assertEqual(N.chave('  Jequié  '), 'JEQUIE')
        self.assertEqual(N.chave('São   Luís'), 'SAO LUIS')
        self.assertEqual(N.chave(None), '')

    def test_placa(self):
        self.assertEqual(N.placa('abc-1d23'), ('ABC1D23', True))
        self.assertEqual(N.placa('NTE 9213'), ('NTE9213', True))
        self.assertEqual(N.placa('VAZAMENTO'), ('VAZAMENTO', False))
        self.assertEqual(N.placa('PRIMEIRO ABASTECIMENTO DO TANQUE')[1], False)

    def test_unidade_todos_os_jeitos(self):
        for t in ('Jequié', 'JEQUIE', 'JEQUIÉ', 'RAJA JEQUIE'):
            self.assertEqual(N.unidade(t), 'RAJA JEQUIE', t)
        self.assertEqual(N.unidade('Belém'), 'RAJA LOG BELEM')
        self.assertEqual(N.unidade('Teixeira'), 'RAJA LOG TEIXEIRA DE FREITAS')
        self.assertEqual(N.unidade('VALADARES'), 'RAJA GOVERNADOR VALADARES')
        self.assertEqual(N.unidade('GRANEL - RIO (DUQUE)'), 'RAJA LOG GRANEL')
        self.assertEqual(N.unidade('RAJA SÃO PAULO'), 'RAJA SAO PAULO')
        self.assertEqual(N.unidade('KEMIGAS GV'), 'KEMIGAS GV')   # Kemigas não é a Raja de Valadares
        self.assertEqual(N.unidade('NANUQUE'), 'KEMIGAS NANUQUE')   # rotas
        self.assertIsNone(N.unidade('VENDA'))
        self.assertIsNone(N.unidade(None))

    def test_empresa(self):
        self.assertEqual(N.empresa_da_unidade('KEMIGAS NANUQUE'), 'KEMIGAS')
        self.assertEqual(N.empresa_da_unidade('RAJA RECIFE'), 'RAJA LOG')

    def test_combustivel(self):
        casos = {'DIESEL S-10 COMUM': 'DIESEL S10', 'DIESEL S-10 ADITIVADO': 'DIESEL S10 ADITIVADO', 'DIESEL': 'DIESEL COMUM',
                 'Arla 32': 'ARLA 32', 'arla 32': 'ARLA 32', 'ARLA': 'ARLA 32', 'ETANOL': 'ETANOL', 'Etanol': 'ETANOL',
                 'ALCOOL COMUM': 'ETANOL', 'GAS NATURAL': 'GNV', 'GASOLINA ADITIVADA': 'GASOLINA ADITIVADA', 'OLEO DIESEL S10': 'DIESEL S10'}
        for t, esperado in casos.items():
            self.assertEqual(N.combustivel(t), esperado, t)
        self.assertIsNone(N.combustivel(''))
        for nome in N.COMBUSTIVEIS:
            self.assertEqual(N.combustivel(nome), nome)

    def test_emissora(self):
        self.assertEqual(N.emissora('Cartao Fisico'), 'ticket')
        self.assertEqual(N.emissora('TRUCKPAG'), 'truckpag')
        self.assertEqual(N.emissora('VELOE'), 'veloe')
        self.assertEqual(N.emissora('VIBRA'), 'vibra')
        self.assertEqual(N.emissora(None, 'ESTABELECIMENTO INTERNO'), 'bomba')
        self.assertEqual(N.emissora(None, 'CAIS VIBRA'), 'vibra')
        self.assertEqual(N.emissora(None, 'POSTO DE COMBUSTIVEL'), 'manual')

    def test_tipo_posto(self):
        self.assertEqual(N.tipo_posto('CAIS VIBRA', 'CAANA'), 'cais')
        self.assertEqual(N.tipo_posto(None, 'POSTO INT RAJA JEQUIE'), 'interno')
        self.assertEqual(N.tipo_posto('POSTO DE COMBUSTIVEL', 'POSTO X'), 'externo')

    def test_situacoes(self):
        self.assertEqual(N.situacao_cartao('PERDIDO'), 'perdido')
        self.assertEqual(N.situacao_cartao('Envio para base'), 'envio para base')
        self.assertEqual(N.situacao_cartao('QUEBRADO'), 'outro')
        self.assertIsNone(N.situacao_cartao(None))
        self.assertEqual(N.situacao_veiculo(None, 'VENDA', 'CAVALO'), 'vendido')
        self.assertEqual(N.situacao_veiculo('DESABILITADA', 'RAJA RECIFE'), 'desabilitado')
        self.assertEqual(N.situacao_veiculo(None, 'RAJA RECIFE'), 'ativo')
        self.assertTrue(N.sim_nao('Sim'))
        self.assertFalse(N.sim_nao('NÃO'))
        self.assertIsNone(N.sim_nao(''))

    def test_uf_e_cidade(self):
        self.assertEqual(N.uf('MARANHAO'), 'MA')
        self.assertEqual(N.uf('Espírito Santo'), 'ES')
        self.assertEqual(N.uf('ba'), 'BA')
        self.assertEqual(N.cidade_uf('TAILANDIA - PA'), ('TAILANDIA', 'PA'))
        self.assertEqual(N.cidade_uf('BOM JESUS DA LAPA'), ('BOM JESUS DA LAPA', None))
        self.assertEqual(N.cidade_uf(None), (None, None))


@unittest.skipIf(G is None, 'psycopg não instalado')
class Conversoes(unittest.TestCase):
    def test_num(self):
        self.assertEqual(G.num('6,35'), 6.35)
        self.assertEqual(G.num('R$ 1.234,50'), 1234.5)
        self.assertEqual(G.num(7), 7)
        self.assertIsNone(G.num('abc'))
        self.assertIsNone(G.num(''))

    def test_coordenada_sem_virgula(self):
        self.assertEqual(G.coordenada(-12.97, -34, 6), (-12.97, False))
        la, corrigida = G.coordenada(-8334332, -34, 6)
        self.assertTrue(corrigida)
        self.assertAlmostEqual(la, -8.334332)
        lo, _ = G.coordenada(-35011158, -74, -28)
        self.assertAlmostEqual(lo, -35.011158)
        self.assertEqual(G.coordenada(None, -34, 6), (None, False))

    def test_datas(self):
        self.assertEqual(G.serial_para_data(46000.5), dt.datetime(2025, 12, 9, 12, 0))
        self.assertEqual(G.data_texto('01/09/2024', '20:38:49'), dt.datetime(2024, 9, 1, 20, 38, 49))
        self.assertEqual(G.data_texto('2024-09-01 00:00:00', '08:00:00'), dt.datetime(2024, 9, 1, 8, 0))
        self.assertIsNone(G.data_texto('ontem'))
        self.assertEqual(G.mes_de('2026-10'), dt.date(2026, 10, 1))
        self.assertEqual(G.mes_de(dt.date(2026, 10, 17)), dt.date(2026, 10, 1))
        self.assertIsNone(G.mes_de(None))

    def test_cnpj_e_json(self):
        self.assertEqual(G.cnpj('34.274.233/0040-00'), '34274233004000')
        self.assertIsNone(G.cnpj('123'))
        self.assertEqual(G.js('{"a": 1}'), {'a': 1})
        self.assertEqual(G.js('', []), [])
        self.assertEqual(G.js('{quebrado', {}), {})

    def test_conferencia_tolerancia(self):
        self.assertTrue(G.iguais([62824.0, 65745950.24], [62824.0, 65745950.27]))   # centavos do double
        self.assertFalse(G.iguais([62824.0], [62823.0]))
        self.assertFalse(G.iguais([1.0, 2.0], [1.0]))
        self.assertTrue(G.iguais([None], [None]))
        self.assertFalse(G.iguais([None], [0.0]))

    def test_para_copy(self):
        self.assertEqual(G.para_copy(['a', 'b']), ['a', 'b'])          # array de texto
        self.assertEqual(type(G.para_copy({'a': 1})).__name__, 'Jsonb')
        self.assertEqual(type(G.para_copy([{'a': 1}])).__name__, 'Jsonb')


class Migracao(unittest.TestCase):
    """O arquivo da migração tem as tabelas que a carga usa e não guarda senha."""
    def setUp(self):
        raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
        with open(os.path.join(raiz, 'supabase', 'migrations', '20261116120000_gestao_modelo.sql'), encoding='utf-8') as f:
            self.sql = f.read().lower()

    def test_tabelas(self):
        for t in ('unidades', 'veiculos', 'motoristas', 'postos', 'combustiveis', 'abastecimentos', 'compras_combustivel',
                  'precos_negociados', 'bases', 'tanques', 'orcamento', 'carga'):
            self.assertIn(f'create table gestao.{t} ', self.sql, t)

    def test_sem_senha(self):
        self.assertNotIn('senha_ticket', self.sql)
        self.assertNotIn('senha_hash', self.sql)
        self.assertNotIn(' cpf ', self.sql)

    def test_rls(self):
        self.assertIn('enable row level security', self.sql)


if __name__ == '__main__':
    unittest.main()
