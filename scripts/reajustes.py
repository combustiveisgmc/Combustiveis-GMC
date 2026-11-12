"""Contratos de diesel com o cliente (planilhas "Controle Reajustes Diesel - DD-MM-AAAA.xlsx" da pasta Reajustes SGB)
-> .dados/reajustes.json, para o dashboard "Contratos x ANP".

    py scripts/reajustes.py

Só leitura: a planilha nunca é alterada (o script lê uma cópia temporária, como faz com a Base). Vale o reajuste
mais recente: o arquivo com a data mais nova no nome. Da aba "Super" (ou da primeira aba) saem, por unidade: data
base do contrato, estado de referência, produto e preço do contrato. As colunas são achadas pelo nome do cabeçalho
(o leiaute já mudou entre as versões). Saída: uma linha JSON no stdout.
"""
import datetime as dt
import glob
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anp_precos import UFS, chave   # noqa: E402  (mesmos nomes de estado da ANP)

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.environ.get('REAJUSTES_PASTA') or os.path.join(os.path.dirname(os.path.dirname(PASTA_PROJETO)), 'Reajustes SGB')
SAIDA = os.path.join(PASTA_PROJETO, '.dados', 'reajustes.json')
UF_POR_NOME = {chave(nome): uf for uf, (nome, _) in UFS.items()}
UF_POR_NOME.update({uf: uf for uf in UFS})   # aceita a sigla (ex.: "ES")

COLUNAS = {   # campo -> nomes possíveis do cabeçalho (sem acento, maiúsculas)
    'unidade': ['UNIDADE'],
    'estado': ['ESTADO REFERENCIA', 'REFERENCIA', 'ESTADO'],
    'data': ['DATA BASE (CONTRATO)', 'DATA BASE', 'DATA CONTRATO'],
    'preco': ['PRECO CONTRATO', 'R$ CONTRATO'],
    'produto': ['PRODUTO'],
}


def saida(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + '\n')


def data_do_nome(caminho):
    m = re.search(r'(\d{2})-(\d{2})-(\d{4})', os.path.basename(caminho))
    return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None


def arquivo_mais_recente():
    arqs = [a for a in glob.glob(os.path.join(PASTA, '*.xlsx')) if not os.path.basename(a).startswith('~$') and data_do_nome(a)]
    return max(arqs, key=lambda a: (data_do_nome(a), os.path.getmtime(a))) if arqs else None


def ler(caminho):
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, 'reajuste.xlsx')
        shutil.copy2(caminho, copia)
        wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
        try:
            ws = next((w for w in wb.worksheets if chave(w.title) == 'SUPER'), wb.worksheets[0])
            linhas = list(ws.iter_rows(values_only=True))
            aba = ws.title
        finally:
            wb.close()
    i_cab = next((i for i, r in enumerate(linhas[:10]) if r and 'UNIDADE' in [chave(c) for c in r]), None)
    if i_cab is None:
        raise ValueError(f'Não achei o cabeçalho (coluna "UNIDADE") na aba "{aba}".')
    cab = [chave(c) for c in linhas[i_cab]]
    col = {}
    for campo, nomes in COLUNAS.items():
        col[campo] = next((cab.index(n) for n in nomes if n in cab), None)
    faltam = [c for c in ('unidade', 'estado', 'data', 'preco') if col[c] is None]
    if faltam:
        raise ValueError(f'Faltam colunas na aba "{aba}": {", ".join(faltam)}.')
    contratos, avisos = [], []
    for n, r in enumerate(linhas[i_cab + 1:], start=i_cab + 2):
        if not r or r[col['unidade']] in (None, ''):
            continue
        unidade = ' '.join(str(r[col['unidade']]).split())
        uf = UF_POR_NOME.get(chave(r[col['estado']]))
        data, preco = r[col['data']], r[col['preco']]
        if not uf:
            avisos.append(f'Linha {n} ({unidade}): estado de referência "{r[col["estado"]]}" não reconhecido.')
            continue
        if not isinstance(data, dt.datetime):
            avisos.append(f'Linha {n} ({unidade}): sem data base do contrato.')
            continue
        if not isinstance(preco, (int, float)) or not (2 < preco < 20):
            avisos.append(f'Linha {n} ({unidade}): preço do contrato inválido ({preco}).')
            continue
        contratos.append({
            'unidade': unidade, 'uf': uf, 'dataBase': data.date().isoformat(), 'preco': round(float(preco), 4),
            'produto': ' '.join(str(r[col['produto']]).split()) if col['produto'] is not None and r[col['produto']] else 'OLEO DIESEL S10',
            'linha': n,
        })
    return aba, contratos, avisos


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    arq = arquivo_mais_recente()
    if not arq:
        return saida({'erro': f'Nenhuma planilha "Controle Reajustes Diesel - DD-MM-AAAA.xlsx" em {PASTA}.'})
    try:
        aba, contratos, avisos = ler(arq)
    except Exception as e:
        return saida({'erro': f'{os.path.basename(arq)}: {e}'})
    corpo = {'arquivo': os.path.basename(arq), 'dataArquivo': data_do_nome(arq).isoformat(), 'aba': aba,
             'contratos': contratos, 'avisos': avisos}
    versao = hashlib.sha1(json.dumps(corpo, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    corpo['versao'] = versao
    corpo['geradoEm'] = dt.datetime.now().isoformat(timespec='seconds')
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8') as f:
        json.dump(corpo, f, ensure_ascii=False)
    saida({'arquivo': corpo['arquivo'], 'contratos': len(contratos), 'avisos': avisos, 'versao': versao})


if __name__ == '__main__':
    main()
