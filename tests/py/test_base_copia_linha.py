"""Escolha da linha da Base_copia num pedido de correção (scripts/planilha_base_copia.py escolher_linha, 17/11/2026):
com o tanque no pedido, só vale a linha daquele combustível. Dados fictícios."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
try:
    import planilha_base_copia as B  # noqa: E402
except ImportError:  # pragma: no cover
    B = None


@unittest.skipIf(B is None, 'dependências da planilha não instaladas')
class EscolherLinha(unittest.TestCase):
    comb = {10: 'DIESEL S-10 COMUM', 11: 'Arla 32', 20: 'DIESEL S-10 COMUM'}
    kd = 46000.5

    def esc(self, linha, tanque, achadas=(10, 11)):
        it = {'linha': linha, 'tanque': tanque}
        return B.escolher_linha(it, list(achadas), self.comb, {10: self.kd, 11: self.kd}, {self.kd: [10, 11]}, self.kd)

    def test_tanque_dos_combustiveis(self):
        self.assertEqual(B.tanque_da_linha('DIESEL S-10 COMUM'), 'diesel')
        self.assertEqual(B.tanque_da_linha('arla 32'), 'arla')
        self.assertIsNone(B.tanque_da_linha('GASOLINA COMUM'))

    def test_linha_certa(self):
        self.assertEqual(self.esc(10, 'diesel'), 10)
        self.assertEqual(self.esc(11, 'arla'), 11)

    def test_linha_anotada_virou_a_do_outro_combustivel(self):
        self.assertEqual(self.esc(11, 'diesel'), 10)   # a planilha andou: o preço do diesel não vai para o Arla
        self.assertEqual(self.esc(10, 'arla'), 11)

    def test_sem_tanque_comportamento_antigo(self):
        self.assertEqual(self.esc(11, None), 11)
        self.assertIsNone(self.esc(99, None))           # duas candidatas e a linha anotada não é nenhuma: não chuta

    def test_nenhuma_do_combustivel(self):
        it = {'linha': 10, 'tanque': 'arla'}   # só existe a linha do diesel nessa data: não grava o preço do Arla nela
        self.assertIsNone(B.escolher_linha(it, [10], self.comb, {10: self.kd}, {self.kd: [10]}, self.kd))
        self.assertEqual(self.esc(10, 'arla', achadas=(10,)), 11)   # a do Arla existe na mesma data: achada pela data


if __name__ == '__main__':
    unittest.main()
