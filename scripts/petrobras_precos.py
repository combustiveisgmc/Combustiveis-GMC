"""Preços da Petrobras às distribuidoras (refinarias e terminais) -> .dados/petrobras/petrobras.json, para o dashboard
"Preço x Refinaria". Só DIESEL S10, por ponto de entrega e modalidade de venda, desde ago/2019.

    py scripts/petrobras_precos.py atualizar            confere o portal e refaz o arquivo se saiu tabela nova
    py scripts/petrobras_precos.py atualizar --forcar   baixa e processa de novo

Quem chama é o vigia (scripts/sincronizar.mjs), de hora em hora. Fonte: portal precos.petrobras.com.br, seção
"Acesse as tabelas de preços de venda às distribuidoras", PDF "Tabela de Preços - Diesel S500 e S10 - <data>".
O PDF traz o histórico inteiro: uma linha por LOCAL (cidade do ponto de entrega) e MODALIDADE DE VENDA (EXA, LPA, ...)
e uma coluna por data de vigência, em R$/m³, sem tributos, à vista. O PDF só é baixado de novo quando o portal
aponta para outro arquivo. Precisa do pypdf (py -m pip install --user pypdf). Saída: uma linha JSON no stdout.
"""
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.request

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(PASTA_PROJETO, '.dados', 'petrobras')
ESTADO = os.path.join(PASTA, 'estado.json')
PDF = os.path.join(PASTA, 'diesel.pdf')
SAIDA = os.path.join(PASTA, 'petrobras.json')
MUNICIPIOS = os.path.join(PASTA_PROJETO, 'public', 'gestao', 'mapas', 'municipios.json')

PORTAL = 'https://precos.petrobras.com.br'
TITULO = re.compile(r'Diesel S500 e S10', re.I)
PRODUTO = 'S10'
VERSAO_FORMATO = 1
NAVEGADOR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GestaoCombustivel/1.0'}
RE_DATA = re.compile(r'\d{2}\.\d{2}\.\d{4}')
RE_VALOR = re.compile(r'\d{1,3}(?:\.\d{3})*,\d{2}\**')
RE_LOCAL = re.compile(r'^\s*(.+?)\s{2,}([A-Z]{3})\s{2,}(.*)$')
# locais da Petrobras que não são município no IBGE: (cidade, UF) -> município onde ficam
APELIDOS = {('VILA DO CONDE', 'PA'): 'BARCARENA'}


def saida(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + '\n')


def baixar(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=NAVEGADOR), timeout=60) as r:
        return r.read()


def chave(s):
    return ' '.join(unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper().split())


def dia(texto):
    d, m, a = map(int, texto.split('.'))
    return (dt.date(a, m, d) - dt.date(1970, 1, 1)).days   # mesmo "dia" do site (dias desde 01/01/1970)


def tabela_no_portal():
    """(título, url) do PDF do diesel S500/S10 listado na página inicial do portal."""
    html = baixar(PORTAL + '/').decode('utf-8', 'replace')
    m = re.search(r'var listaTabelaJson\s*=\s*(\[.*?\]);', html, re.S)
    if not m:
        raise ValueError('Não encontrei a lista de tabelas de preços no portal da Petrobras (a página mudou?).')
    for t in json.loads(m.group(1)):
        if TITULO.search(t.get('titulo', '')):
            return t['titulo'], PORTAL + t['urlTabelaPrecos'].replace('\\/', '/')
    raise ValueError('O portal da Petrobras não lista mais a tabela "Diesel S500 e S10".')


def ler_pdf(caminho):
    """{(local, modalidade): {dia: R$/m³}} das páginas do diesel S10. Cada valor vai para a data cuja coluna fica
    mais perto dele na linha (há pontos sem preço em algumas datas, então a posição é o que vale)."""
    import pypdf
    series = {}
    for pag in pypdf.PdfReader(caminho).pages:
        texto = pag.extract_text(extraction_mode='layout')
        if not re.search(r'Diesel\s+' + PRODUTO + r'\b', texto):
            continue
        colunas = None
        for linha in texto.splitlines():
            datas = list(RE_DATA.finditer(linha))
            if len(datas) >= 2 and 'LOCAL' in linha:
                colunas = [((d.start() + d.end()) / 2, dia(d.group())) for d in datas]
                continue
            if not colunas:
                continue
            m = RE_LOCAL.match(linha)
            if not m or not RE_VALOR.search(m.group(3)):
                continue
            local, mod = m.group(1).strip(), m.group(2)
            ini = m.start(3)
            s = series.setdefault((local, mod), {})
            for v in RE_VALOR.finditer(m.group(3)):
                centro = ini + (v.start() + v.end()) / 2
                _, d = min(colunas, key=lambda c: abs(c[0] - centro))
                s[d] = float(v.group().rstrip('*').replace('.', '').replace(',', '.'))
    return series


def gerar(titulo, url):
    series = ler_pdf(PDF)
    if not series:
        raise ValueError('Não encontrei preços de diesel S10 no PDF da Petrobras.')
    with open(MUNICIPIOS, encoding='utf-8') as f:
        coords = {(chave(n), uf): (lat, lon) for n, uf, lat, lon in json.load(f)}
    pontos, sem_coord = [], []
    for (local, mod), s in sorted(series.items()):
        m = re.match(r'^(.*?)\s*\(([A-Z]{2})\)$', local)
        cidade, uf = (m.group(1), m.group(2)) if m else (local, None)
        c = coords.get((APELIDOS.get((chave(cidade), uf), chave(cidade)), uf)) if uf else None
        if not c:
            sem_coord.append(local)
        datas = sorted(s)
        pontos.append({'local': local, 'cidade': cidade, 'uf': uf, 'mod': mod,
                       'lat': c[0] if c else None, 'lon': c[1] if c else None,
                       'd': datas, 'p': [s[d] for d in datas]})
    todas = sorted({d for p in pontos for d in p['d']})
    agora = dt.datetime.now()
    d = {'versao': agora.strftime('%Y%m%d%H%M%S'), 'geradoEm': agora.strftime('%Y-%m-%dT%H:%M:%S'),
         'produto': 'DIESEL ' + PRODUTO, 'unidade': 'R$/m3', 'titulo': titulo, 'url': url,
         'vigenciaMin': todas[0], 'vigenciaMax': todas[-1], 'vigencias': len(todas), 'pontos': pontos}
    with open(SAIDA, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    return d, sem_coord


def atualizar(forcar):
    os.makedirs(PASTA, exist_ok=True)
    try:
        with open(ESTADO, encoding='utf-8') as f:
            estado = json.load(f)
    except (OSError, ValueError):
        estado = {}
    titulo, url = tabela_no_portal()
    if not forcar and estado.get('url') == url and estado.get('formato') == VERSAO_FORMATO and os.path.isfile(SAIDA):
        return saida({'mudou': False, 'titulo': titulo})
    with open(PDF, 'wb') as f:
        f.write(baixar(url))
    d, sem_coord = gerar(titulo, url)
    with open(ESTADO, 'w', encoding='utf-8') as f:
        json.dump({'url': url, 'titulo': titulo, 'formato': VERSAO_FORMATO, 'versao': d['versao']}, f, ensure_ascii=False)
    ultima = dt.date(1970, 1, 1) + dt.timedelta(days=d['vigenciaMax'])
    saida({'mudou': True, 'versao': d['versao'], 'titulo': titulo, 'pontos': len(d['pontos']), 'vigencias': d['vigencias'],
           'ultimaVigencia': ultima.strftime('%d/%m/%Y'), 'semCoordenadas': sem_coord})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) >= 2 and sys.argv[1] == 'atualizar':
        try:
            atualizar('--forcar' in sys.argv)
        except Exception as e:   # o vigia lê o erro na saída
            saida({'erro': str(e)})
    else:
        print(__doc__)
        sys.exit(1)
