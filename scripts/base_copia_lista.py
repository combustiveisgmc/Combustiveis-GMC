"""Lista dos abastecimentos da CONTROLES\\Base_copia.xlsx para a página Operacional > Editar abastecimentos.

    py scripts/base_copia_lista.py          gera .dados/base-copia.json

Lê uma cópia (só leitura) da aba Transações e exporta, em formato colunar com dicionários, o que a página mostra:
linha da planilha, data, placa, motorista, combustível, posto, forma de pagamento, nome reduzido (empresa), informação adicional 1 e 3,
litros, vl/litro, hodômetro, km rodados, km/litro e valor emissão. Quem chama é o vigia (scripts/sincronizar.mjs),
que envia para a chave "base-copia" do KV. Saída: uma linha JSON no stdout.
Também grava .dados/cartoes-api/base-copia-bomba.json: a linha inteira (40 colunas, A..AN) dos abastecimentos das bombas
internas (postos e data inicial em .dados/cartoes-api/postos-bomba.json, escrito por scripts/bomba_rateio.mjs), para o
CSV do Rateio das NFs sair no mesmo formato da planilha de rateio.
"""
import datetime as dt
import json
import os
import shutil
import sys
import tempfile

import consolidador_historico as ch   # mesma leitura da aba Transações (valores como o SheetJS entregaria)

SAIDA = os.path.join(ch.PASTA_PROJETO, '.dados', 'base-copia.json')
PASTA_APIS = os.path.join(ch.PASTA_PROJETO, '.dados', 'cartoes-api')
POSTOS_BOMBA = os.path.join(PASTA_APIS, 'postos-bomba.json')        # {postos: [...], desde: serial}
SAIDA_BOMBA = os.path.join(PASTA_APIS, 'base-copia-bomba.json')    # {linha: [40 valores]}
# índice da coluna na aba Transações (A = 0)
COLUNAS = {'dt': 4, 'placa': 5, 'mot': 11, 'fuel': 13, 'litros': 14, 'vl': 15, 'hodo': 16, 'km': 17, 'kml': 18,
           'valor': 19, 'posto': 21, 'forma': 1, 'inf1': 27, 'inf3': 29, 'reduzido': 3}   # reduzido: empresa (Rateio das NFs)
TEXTOS = ('placa', 'mot', 'fuel', 'posto', 'forma', 'inf1', 'inf3', 'reduzido')


def gerar():
    caminho = ch.base_copia()
    if not caminho or not os.path.isfile(caminho):
        return ch.saida({'erro': 'Planilha Base_copia não encontrada na pasta CONTROLES.'})
    tmp = tempfile.mkdtemp(prefix='base-copia-')
    dics = {k: ch.Dic() for k in TEXTOS}
    col = {k: [] for k in ['linha'] + list(COLUNAS)}
    try:
        with open(POSTOS_BOMBA, encoding='utf-8') as f:
            pb = json.load(f)
        postos_bomba, desde_bomba = {str(p).strip().upper() for p in pb.get('postos') or []}, pb.get('desde') or 0
    except (OSError, ValueError):
        postos_bomba, desde_bomba = set(), 0
    bomba = {}
    try:
        # a linha 1 é o cabeçalho; o ler() devolve todas as linhas seguintes na ordem (vazias também)
        for n, r in enumerate(ch.ler(caminho, tmp, 'base-copia.xlsx'), start=2):
            if not r[5] or not isinstance(r[4], (int, float)) or isinstance(r[4], bool):
                continue
            col['linha'].append(n)
            if postos_bomba and r[4] >= desde_bomba and str(r[21] or '').strip().upper() in postos_bomba:
                bomba[n] = list(r[:40])
            for k, i in COLUNAS.items():
                v = r[i]
                if k in TEXTOS:
                    col[k].append(dics[k](v if v is None else str(v)))
                else:
                    col[k].append(v if isinstance(v, (int, float)) and not isinstance(v, bool) else None)
    except ValueError as e:
        return ch.saida({'erro': str(e)})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    agora = dt.datetime.now()
    # geradoEm em UTC: a página compara com o aplicada_em das correções (D1) para saber se a lista já as inclui
    utc = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    d = {'versao': agora.strftime('%Y%m%d%H%M%S'), 'geradoEm': utc,
         'arquivo': os.path.basename(caminho), 'linhas': len(col['linha']),
         'dic': {k: v.lista for k, v in dics.items()}, 'col': col}
    if postos_bomba:
        os.makedirs(PASTA_APIS, exist_ok=True)
        with open(SAIDA_BOMBA, 'w', encoding='utf-8') as f:
            json.dump(bomba, f, ensure_ascii=False, separators=(',', ':'))
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    ch.saida({'versao': d['versao'], 'linhas': d['linhas'], 'bytes': os.path.getsize(SAIDA)})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    gerar()
