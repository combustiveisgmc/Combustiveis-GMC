"""Testes do leitor das NFs das planilhas de rateio (scripts/rateio_nfs.py). Dados fictícios."""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
import rateio_nfs as R  # noqa: E402

CAB = ['CODIGO TRANSACAO', 'FORMA', 'CLIENTE', 'NOME REDUZIDO', 'DATA TRANSACAO', 'PLACA'] + [None] * 8 + ['LITROS', 'VL/LITRO']


def linha(data, placa, litros, preco):
    return [None, None, None, None, data, placa] + [None] * 8 + [litros, preco]


class Rateio(unittest.TestCase):
    def test_nf_da_aba(self):
        self.assertEqual(R.nf_da_aba('155812'), '155812')
        self.assertEqual(R.nf_da_aba('155812 (2)'), '155812')
        self.assertIsNone(R.nf_da_aba('Base NF STOCK'))
        self.assertIsNone(R.nf_da_aba('12'))          # número curto não é NF

    def test_numero_e_preco(self):
        self.assertEqual(R.numero('6,6402'), 6.6402)
        self.assertIsNone(R.numero('#REF!'))
        self.assertEqual(R.preco_comum([6.87, 6.87, 6.5, None, 0]), 6.87)
        self.assertIsNone(R.preco_comum([None]))

    def test_resumo_aba(self):
        ls = [CAB, linha(dt.datetime(2026, 11, 9, 12, 17), 'AAA1A11', 133.983, 6.87),
              linha(dt.datetime(2026, 11, 10, 8, 0), 'xxxxxxx', 66.017, 6.87),     # sobra da nota também conta
              [None] * 14 + ['=SUM(O2:O3)', None],                                  # linha de total: sem data, fica fora
              linha('texto', 'BBB2B22', 10, 6.87)]
        r = R.resumo_aba(ls)
        self.assertEqual(r['litros'], 200.0)
        self.assertEqual(r['preco'], 6.87)
        self.assertEqual(r['n'], 2)
        self.assertEqual(r['primeiro'], '2026-11-09T12:17')
        self.assertIsNone(R.resumo_aba([CAB]))

    def test_stock_cabecalho_em_qualquer_lugar(self):
        ls = [[None] * 10, [None, 'Número', 'CPF/CNPJ', 'Fornecedor', 'Emissão', 'Descrição', 'Quantidade', 'Valor Unitário', 'Valor Total'],
              [None, 2651734, '33.337.122/0053-46', 'FORNECEDOR EXEMPLO', dt.datetime(2026, 11, 10), 'DIESEL S10', 5000, 6.3752, 31876],
              [None, None, None, None, None, None, None, None, '0']]
        s = R.linhas_stock(ls)
        self.assertEqual(len(s), 1)
        self.assertEqual(s[0]['nf'], '2651734')
        self.assertEqual(s[0]['cnpj'], '33337122005346')
        self.assertEqual(s[0]['emissao'], '2026-11-10')
        self.assertEqual(s[0]['litros'], 5000)
        self.assertEqual(R.linhas_stock([[None, 'outra coisa']]), [])

    def test_juntar_prefere_stock(self):
        abas = {'100': {'litros': 4999.5, 'precos': [6.0], 'primeiro': '2026-10-01T08:00', 'ultimo': '2026-10-05T08:00'},
                '200': {'litros': 300.0, 'precos': [6.5, 6.5], 'primeiro': '2026-10-06T08:00', 'ultimo': '2026-10-07T08:00'}}
        stock = {'100': {'nf': '100', 'cnpj': '1' * 14, 'fornecedor': 'X', 'emissao': '2026-09-30', 'litros': 5000, 'preco': 6.1, 'valor': 30500}}
        n = {x['nf']: x for x in R.juntar(abas, stock)}
        self.assertEqual(n['100']['litros'], 5000)          # quantidade da nota, não a soma das linhas
        self.assertEqual(n['100']['fonte'], 'stock')
        self.assertEqual(n['200']['valor'], 1950.0)
        self.assertEqual(n['200']['fonte'], 'aba')
        self.assertIsNone(n['200']['emissao'])

    def test_planilhas_mapeadas(self):
        bases = {b for b, _ in R.PLANILHAS.values()}
        self.assertTrue({'RAJA VALADARES', 'KEMIGAS GV', 'ILHEUS'}.isdisjoint(bases))   # fora (usuário, 17/11/2026)
        self.assertTrue({'JEQUIE', 'SALVADOR', 'BELEM', 'SAO PAULO', 'CABET', 'CAAPE', 'CALAN', 'CAANA'} <= bases)
        for rel, (base, comb) in R.PLANILHAS.items():
            self.assertIn(comb, ('DIESEL S10', 'ARLA 32'), rel)
            self.assertTrue(base, rel)


if __name__ == '__main__':
    unittest.main()
