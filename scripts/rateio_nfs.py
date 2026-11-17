"""NFs de compra das bombas internas e dos cais, lidas das planilhas de rateio (pasta RATEIOS BOMBA INTERNA), para o modelo
`gestao` (scripts/gestao_carga.py: gestao.compras_combustivel). Só leitura, sempre numa cópia (17/11/2026, pedido do usuário:
"Você já tem o histórico nas planilhas de rateio com tudo que precisa").

Cada planilha tem uma aba por NF (nome = número da NF; "(2)" = continuação da mesma nota) com os abastecimentos rateados
(E = data, F = placa, O = litros, P = valor por litro da nota) e algumas têm a aba "Base NF STOCK" (Número, CPF/CNPJ,
Fornecedor, Emissão, Descrição, Quantidade, Valor Unitário, Valor Total). A nota sai da Base NF STOCK quando existe; senão,
da aba (litros = soma dos abastecimentos, preço = o mais comum da coluna P, data = primeiro abastecimento).
Resultado em cache (.dados/rateio-nfs.json), refeito só quando alguma planilha muda (a de Jequié tem 400 abas).

    py scripts/rateio_nfs.py            mostra quantas notas por planilha
"""
import datetime as dt
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_PADRAO = os.path.join(os.path.dirname(os.path.dirname(RAIZ)), 'RATEIOS BOMBA INTERNA')
CACHE = os.path.join(RAIZ, '.dados', 'rateio-nfs.json')

# planilha -> (apelido da base no modelo, combustível). RMG = Raja Valadares (bomba "KEMIGAS LTDA", rateio da Raja);
# KGV = Kemigás GV (mesma bomba, rateio da Kemigás); VIPGAS = Ilhéus
PLANILHAS = {
    'RBA/Rateio Bomba Interna Jequié.xlsx': ('JEQUIE', 'DIESEL S10'),
    'RBA/Jequie - Rateio Arla.xlsx': ('JEQUIE', 'ARLA 32'),
    'RBA/Rateio Bomba Interna Salvador.xlsx': ('SALVADOR', 'DIESEL S10'),
    'RBA/Salvador - Rateio Arla.xlsx': ('SALVADOR', 'ARLA 32'),
    'RBE/Rateio Combustível RBE.xlsm': ('BELEM', 'DIESEL S10'),
    'RBE/Belem - Rateio Arla.xlsx': ('BELEM', 'ARLA 32'),
    'RSP/Rateio Combustível RSP.xlsm': ('SAO PAULO', 'DIESEL S10'),
    'RSP/São Paulo - Rateio Arla.xlsx': ('SAO PAULO', 'ARLA 32'),
    'KGV/Kemigás - Rateio Bomba Interna rev.0.1.xlsx': ('KEMIGAS GV', 'DIESEL S10'),
    'KGV/Kemigás - Rateio Arla.xlsx': ('KEMIGAS GV', 'ARLA 32'),
    'VIPGAS/Vipgás - Rateio Bomba Interna rev.0.1.xlsx': ('ILHEUS', 'DIESEL S10'),
    'RMG/Rateio Combustível RMG.xlsm': ('RAJA VALADARES', 'DIESEL S10'),
    'CAIS BETIM/CAIS BETIM - Rateio Diesel.xlsm': ('CABET', 'DIESEL S10'),
    'CAIS SUAPE/CAIS SUAPE - Rateio Diesel.xlsm': ('CAAPE', 'DIESEL S10'),
    'CAIS UBERLANDIA/CAIS UBERLANDIA - Rateio Diesel.xlsm': ('CALAN', 'DIESEL S10'),
    'CAIS UBERLANDIA/CAIS UBERLANDIA - Rateio Arla.xlsx': ('CALAN', 'ARLA 32'),
    'CAIS VIANA/CAIS VIANA - Rateio Diesel.xlsm': ('CAANA', 'DIESEL S10'),
}


def nf_da_aba(nome):
    """'155812 (2)' -> '155812'; 'Base' -> None."""
    m = re.match(r'^\s*(\d{3,})\b', str(nome or ''))
    return m.group(1) if m else None


def numero(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('R$', '').replace(' ', '')
    if not s or s.startswith('#'):
        return None
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def preco_comum(precos):
    """Preço da nota: o valor por litro mais comum nas linhas (arredondado a 4 casas); None se não houver."""
    ps = [round(p, 4) for p in precos if p and p > 0]
    return Counter(ps).most_common(1)[0][0] if ps else None


def linhas_stock(linhas):
    """Linhas da aba Base NF STOCK -> [{nf, cnpj, fornecedor, emissao, litros, preco, valor}]. Acha o cabeçalho ("Número")
    em qualquer uma das primeiras linhas e colunas (a posição muda de planilha para planilha)."""
    cab, ini = None, 0
    for i, r in enumerate(linhas[:6]):
        nomes = [str(x).strip().upper() if x is not None else '' for x in (r or ())]
        if 'NÚMERO' in nomes or 'NUMERO' in nomes:
            cab, ini = {n: j for j, n in enumerate(nomes) if n}, i + 1
            break
    if not cab:
        return []
    col = lambda *ns: next((cab[n] for n in ns if n in cab), None)  # noqa: E731
    cN, cC, cF, cE = col('NÚMERO', 'NUMERO'), col('CPF/CNPJ', 'CNPJ'), col('FORNECEDOR'), col('EMISSÃO', 'EMISSAO')
    cQ, cU, cT = col('QUANTIDADE'), col('VALOR UNITÁRIO', 'VALOR UNITARIO'), col('VALOR TOTAL')
    out = []
    for r in linhas[ini:]:
        r = tuple(r or ()) + (None,) * 12
        nf = nf_da_aba(r[cN]) if cN is not None else None
        if not nf:
            continue
        q, u = numero(r[cQ]) if cQ is not None else None, numero(r[cU]) if cU is not None else None
        t = numero(r[cT]) if cT is not None else None
        em = r[cE] if cE is not None else None
        cnpj = (re.sub(r'\D', '', str(r[cC] or '')) or None) if cC is not None else None
        out.append({'nf': nf, 'cnpj': cnpj, 'fornecedor': str(r[cF]).strip() if cF is not None and r[cF] else None,
                    'emissao': em.date().isoformat() if isinstance(em, dt.datetime) else em.isoformat() if isinstance(em, dt.date) else None,
                    'litros': q, 'preco': u, 'valor': t if t else (q * u if q and u else None)})
    return out


def resumo_aba(linhas):
    """Abastecimentos de uma aba de NF -> {litros, preco, primeiro, ultimo, n} (linhas com data em E e litros em O)."""
    litros, precos, datas = 0.0, [], []
    for r in linhas[1:]:
        r = tuple(r or ()) + (None,) * 20
        if not isinstance(r[4], dt.datetime):
            continue
        q = numero(r[14])
        if q is None:
            continue
        litros += q
        precos.append(numero(r[15]))
        datas.append(r[4])
    if not datas:
        return None
    return {'litros': round(litros, 3), 'preco': preco_comum(precos), 'primeiro': min(datas).isoformat(timespec='minutes'),
            'ultimo': max(datas).isoformat(timespec='minutes'), 'n': len(datas)}


def juntar(abas, stock):
    """Notas das abas ({nf: {litros, precos, primeiro, ultimo}}) + Base NF STOCK ({nf: {...}}) -> lista de notas."""
    notas = []
    for nf in sorted(set(abas) | set(stock), key=int):
        s, a = stock.get(nf) or {}, abas.get(nf)
        preco = s.get('preco') or (preco_comum(a['precos']) if a else None)
        litros = s.get('litros') or (round(a['litros'], 3) if a else None)
        if not litros or litros <= 0:
            continue
        notas.append({'nf': nf, 'cnpj': s.get('cnpj'), 'fornecedor': s.get('fornecedor'), 'emissao': s.get('emissao'),
                      'litros': litros, 'preco': preco, 'valor': s.get('valor') or (round(litros * preco, 2) if preco else None),
                      'primeiro': a['primeiro'] if a else None, 'ultimo': a['ultimo'] if a else None, 'fonte': 'stock' if s else 'aba'})
    return notas


def ler_planilha(caminho):
    """Uma planilha de rateio -> [{nf, cnpj, fornecedor, emissao, litros, preco, valor, primeiro, ultimo, fonte}]."""
    import openpyxl
    tmp = tempfile.mkdtemp(prefix='rateio-')
    try:
        copia = os.path.join(tmp, 'p' + os.path.splitext(caminho)[1])
        shutil.copy2(caminho, copia)
        wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
        abas = {}
        for nome in wb.sheetnames:
            nf = nf_da_aba(nome)
            if not nf:
                continue
            r = resumo_aba(list(wb[nome].iter_rows(values_only=True)))
            if not r:
                continue
            a = abas.setdefault(nf, {'litros': 0.0, 'precos': [], 'primeiro': r['primeiro'], 'ultimo': r['ultimo']})
            a['litros'] += r['litros']                       # "(2)" = continuação da mesma nota
            a['precos'].append(r['preco'])
            a['primeiro'], a['ultimo'] = min(a['primeiro'], r['primeiro']), max(a['ultimo'], r['ultimo'])
        stock = {}
        nome_stock = next((s for s in wb.sheetnames if 'STOCK' in s.upper()), None)
        if nome_stock:
            for s in linhas_stock(list(wb[nome_stock].iter_rows(values_only=True))):
                stock.setdefault(s['nf'], s)
        wb.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return juntar(abas, stock)


def ler_todas(pasta=None, cache=CACHE, log=print):
    """{arquivo: {'base': apelido, 'combustivel': nome, 'notas': [...]}} das planilhas que existem; usa o cache quando a
    planilha não mudou (tamanho + data)."""
    pasta = pasta or os.environ.get('PASTA_RATEIOS') or PASTA_PADRAO
    try:
        with open(cache, encoding='utf-8') as f:
            guardado = json.load(f)
    except (OSError, ValueError):
        guardado = {}
    out, mudou = {}, False
    for rel, (base, comb) in PLANILHAS.items():
        p = os.path.join(pasta, rel)
        if not os.path.isfile(p):
            continue
        st = os.stat(p)
        assinatura = f'{st.st_size}|{int(st.st_mtime)}'
        g = guardado.get(rel)
        if g and g.get('assinatura') == assinatura:
            out[rel] = g
            continue
        try:
            notas = ler_planilha(p)
        except Exception as e:   # planilha aberta/corrompida: fica a leitura anterior, se houver
            log(f'rateio: não consegui ler {rel}: {e}')
            if g:
                out[rel] = g
            continue
        out[rel] = {'assinatura': assinatura, 'base': base, 'combustivel': comb, 'notas': notas}
        mudou = True
        log(f'rateio: {rel}: {len(notas)} nota(s)')
    if mudou:
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        tmp = cache + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False)
        os.replace(tmp, cache)
    return out


if __name__ == '__main__':
    todas = ler_todas(log=lambda m: print(m, file=sys.stderr))
    for rel, v in todas.items():
        ns = v['notas']
        datas = sorted(n['emissao'] or (n['primeiro'] or '')[:10] for n in ns if n['emissao'] or n['primeiro'])
        print(f"{rel}: {len(ns)} notas, {sum(n['litros'] for n in ns):,.0f} L, {datas[0] if datas else '-'} a {datas[-1] if datas else '-'}")
