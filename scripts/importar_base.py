"""Lê a planilha Base.xlsx (somente leitura) e gera os dados dos dashboards da gestão.

    py scripts/importar_base.py [caminho da Base.xlsx]

A planilha nunca é alterada: o script copia o arquivo para uma pasta temporária e lê a cópia
(assim funciona mesmo com a Base aberta no Excel).

Saída: .dados/abastecimentos.json (fora de public/). Quem envia para o site é scripts/sincronizar.mjs,
que grava no Workers KV da Cloudflare; o site lê de lá em /gestao/dados/abastecimentos.json (com login).
Formato colunar com dicionários, para o arquivo ficar pequeno:
  dic.<campo>   lista de textos; as colunas guardam o índice
  veiculos      dados da aba Metas por placa (categoria, modelo, meta, tanque, unidade)
  col.<campo>   uma lista por coluna, todas com o mesmo tamanho
"""
import datetime as dt
import json
import math
import os
import shutil
import sys
import tempfile
import unicodedata

import openpyxl

from gestao_normalizar import PLACAS_CORRIGIDAS   # placa escrita errada nas planilhas -> a certa (17/11/2026)

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_PADRAO = os.path.join(os.path.dirname(PASTA_PROJETO), 'Base.xlsx')
SAIDA = os.path.join(PASTA_PROJETO, '.dados', 'abastecimentos.json')
# coordenadas dos postos (mapa de calor): planilha separada, também só leitura
LOCAIS_PADRAO = os.path.join(os.path.dirname(PASTA_PROJETO), 'LOCALIZAÇÃO DOS POSTOS.xlsx')
# negociações com os postos externos (preço negociado, rodada semanal): também só leitura aqui
NEGOCIACOES_PADRAO = os.environ.get('PLANILHA_NEGOCIACAO') or os.path.join(
    os.path.dirname(PASTA_PROJETO), 'Gestão de negociações de preço.xlsx')
ABA_NEGOCIACOES = 'Base de dados de negociações'
# orçamento de despesas da frota (dashboard "Real x Orçado"): também só leitura
ORCAMENTO_PADRAO = os.environ.get('PLANILHA_ORCAMENTO') or os.path.join(
    os.path.dirname(PASTA_PROJETO), 'Banco_Orçamento_Despesas_Frota.xlsx')
# sede de cada município (IBGE), a mesma lista que o roteirizador usa; confere as coordenadas dos postos
MUNICIPIOS = os.path.join(PASTA_PROJETO, 'public', 'gestao', 'mapas', 'municipios.json')
# negociações das bombas internas (Preço bomba interna): planilha própria desde 07/10/2026, gravada também pelo site
BOMBA_PADRAO = os.environ.get('PLANILHA_BOMBA') or os.path.join(PASTA_PROJETO, 'CONTROLES', 'Negociação bomba interna.xlsx')
LIMITE_KM_CIDADE = 100   # posto a mais que isso da sede da cidade informada na planilha: coordenada suspeita


def chave_cidade(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper()
    return ' '.join(s.replace('-', ' ').replace("'", ' ').split())


def sedes_municipios():
    try:
        with open(MUNICIPIOS, encoding='utf-8') as f:
            return {(chave_cidade(n), uf): (lat, lng) for n, uf, lat, lng in json.load(f)}
    except (OSError, ValueError):
        return {}


def distancia_km(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    a = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lng2 - lng1) * r / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))

# colunas da aba Transações (cabeçalho da linha 1)
C = {
    'data': 'DATA TRANSACAO', 'placa': 'PLACA', 'motorista': 'NOME MOTORISTA',
    'combustivel': 'TIPO COMBUSTIVEL', 'litros': 'LITROS', 'vl_litro': 'VL/LITRO',
    'hodometro': 'HODOMETRO OU HORIMETRO', 'km': 'KM RODADOS OU HORAS TRABALHADAS',
    'despesa': 'VALOR EMISSAO', 'fornecedor': 'NOME ESTABELECIMENTO', 'cidade': 'CIDADE', 'uf': 'UF',
    'cc': 'INFORMACAO ADIDIONAL 3',  # centro de custo: a mesma coluna que o filtro do Power BI usa
    'campanha': 'CAMPANHA',
    'tipo_estab': 'TIPO ESTABELECIMENTO',   # posto de combustível ou estabelecimento interno (bomba própria)
}


def num(v):
    """Número vindo do Excel: aceita 1234.5, '1234,5' e '1.234,5'. Vazio/inválido -> None."""
    if v is None or v == '':
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('R$', '').replace(' ', '')
    if not s:
        return None
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def texto(v):
    if v is None:
        return ''
    return ' '.join(str(v).split())


def data_iso(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, (int, float)) and v > 20000:  # número de série do Excel
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=float(v))).date()
    s = texto(v)
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S'):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


INICIO_OUTROS_CARTOES = dt.date(2025, 6, 28)   # primeira transação TruckPag na Base; antes disso só havia Ticket


def cartao_usado(forma, dia):
    """Coluna FORMA DE PAGAMENTO -> TICKET / TRUCKPAG / VELOE / VIBRA. "Cartao Fisico" é o Ticket.
    Vazia: Ticket se for de antes dos outros cartões existirem; depois disso não dá para saber ("")."""
    f = ' '.join(unicodedata.normalize('NFKD', texto(forma)).encode('ascii', 'ignore').decode().upper().split())
    if f == 'CARTAO FISICO':
        return 'TICKET'
    if not f:
        return 'TICKET' if dia < INICIO_OUTROS_CARTOES else ''
    return f


class Dicionario:
    def __init__(self):
        self.lista, self.idx = [], {}

    def __call__(self, valor):
        if valor not in self.idx:
            self.idx[valor] = len(self.lista)
            self.lista.append(valor)
        return self.idx[valor]


def arred(v, casas):
    return None if v is None else round(v, casas)


def coordenada(v, latitude):
    """Latitude/longitude da planilha de localização. Aceita o número digitado sem a vírgula decimal
    (ex.: -16658807 = -16,658807): tenta 6 casas (padrão do Google Maps), depois 7 e 5, e fica com a que cai no Brasil."""
    x = num(v)
    if x is None:
        return None
    dentro = (lambda a: -35 < a < 6) if latitude else (lambda a: -75 < a < -30)
    if dentro(x):
        return x
    if abs(x) >= 1000 and float(x).is_integer():
        for casas in (6, 7, 5):
            y = x / 10 ** casas
            if dentro(y):
                return y
    return None


def segundos_do_dia(v):
    """Hora da transação em segundos desde a meia-noite (a rodada de preços usa a hora exata)."""
    return v.hour * 3600 + v.minute * 60 + v.second if isinstance(v, dt.datetime) else None


def corrigir_km_impossivel(col, dics):
    """KM rodado digitado errado na Base (ex.: 154.126 km entre dois abastecimentos com hodômetro 314.169 e 314.647)
    estraga a média km/L de todos os painéis. A Base.xlsx não é alterada: só nos dados do site, quando o KM rodado passa
    de 3.000 e é mais que 3 vezes a diferença do hodômetro para o abastecimento anterior da mesma placa e combustível
    (todo diesel junto), e essa diferença é coerente (entre 1 e 3.000 km), o KM vira a diferença. Só diesel (o que entra
    nas médias contra a meta): o Arla conta o KM desde o último Arla, e a gasolina tem placas com o KM em outro formato."""
    def cadeia(i):
        f = str(dics['combustivel'].lista[col['combustivel'][i]] or '').upper()
        return 'ARLA' if 'ARLA' in f else 'DIESEL' if 'DIESEL' in f else f
    grupos = {}
    for i in range(len(col['data'])):
        if col['hodometro'][i] is None or cadeia(i) != 'DIESEL':
            continue
        grupos.setdefault((col['placa'][i], cadeia(i)), []).append(i)
    trocados = []
    for idx in grupos.values():
        idx.sort(key=lambda i: (col['data'][i], col['seg'][i] or 0))
        for a, b in zip(idx, idx[1:]):
            dif, km = col['hodometro'][b] - col['hodometro'][a], col['km'][b]
            if km is not None and 0 < dif <= 3000 and km > 3000 and km > 3 * dif:
                trocados.append((b, km, dif))
                col['km'][b] = dif
    if trocados:
        print(f'  KM rodado impossível corrigido pelo hodômetro em {len(trocados)} abastecimento(s) (a Base.xlsx não muda).')
    return trocados


def ler_negociacoes(caminho, tmp):
    """Aba "Base de dados de negociações": uma linha por negociação com um posto externo, em ordem de gravação.
    Devolve o formato colunar (dic/col) e os limites da linha 1 (dias sem atualização, variação, renegociação)."""
    if not caminho or not os.path.isfile(caminho):
        return None
    copia = os.path.join(tmp, 'negociacoes.xlsx')
    shutil.copy2(caminho, copia)
    wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
    try:
        ws = wb[ABA_NEGOCIACOES]
        ws.reset_dimensions()
        linhas = ws.iter_rows(values_only=True)
        cab = [texto(c) for c in next(linhas)]
        ix = {k: cab.index(v) for k, v in {
            'data': 'Data da negociação', 'contato': 'Contato da negociação', 'unidade': 'Unidade',
            'posto': 'Posto negociado', 'cidade': 'Cidade', 'tipo': 'Tipo', 'plataforma': 'Plataforma',
            'valor': 'Valor Negociado', 'combustivel': 'TIPO COMBUSTIVEL',
            'transacao': 'Data da última transação (usada para o preço)', 'status': 'Observação', 'aviso': 'Aviso',
        }.items()}
        # limites na linha 1 (R1:W1): rótulo seguido do valor
        limites = {'diasSemAtualizacao': 15, 'variacao': 0.1, 'diasRenegociacao': 90}
        rotulos = {'LIMITE DIAS SEM ATUALIZAÇÃO': 'diasSemAtualizacao', 'LIMITE VARIAÇÃO DE PREÇO': 'variacao',
                   'LIMITE DIAS - RENEGOCIAÇÃO OBRIGATÓRIA': 'diasRenegociacao'}
        for i, c in enumerate(cab[:-1]):
            k = rotulos.get(c.upper())
            if k and isinstance(num(cab[i + 1]), float):
                limites[k] = num(cab[i + 1])
        textos = ('unidade', 'posto', 'cidade', 'tipo', 'plataforma', 'combustivel', 'status', 'contato', 'aviso')
        dn = {k: Dicionario() for k in textos}
        cn = {k: [] for k in textos + ('data', 'valor', 'trans_dia', 'trans_seg')}
        epoca = dt.date(1970, 1, 1)
        for r in linhas:
            if r is None:
                continue
            r = tuple(r) + (None,) * (len(cab) - len(r))
            d = data_iso(r[ix['data']])
            posto = texto(r[ix['posto']]).upper()
            if d is None or not posto:
                continue
            t = r[ix['transacao']]
            td = data_iso(t)
            cn['data'].append((d - epoca).days)
            for k in textos:
                cn[k].append(dn[k](posto if k == 'posto' else texto(r[ix[k]]).upper()))
            v = num(r[ix['valor']])
            cn['valor'].append(round(v, 4) if v and v > 0 else None)
            cn['trans_dia'].append((td - epoca).days if td else None)
            cn['trans_seg'].append(segundos_do_dia(t))
        return {'dic': {k: v.lista for k, v in dn.items()}, 'col': cn, 'limites': limites}
    finally:
        wb.close()


def ler_orcamento(caminho, tmp):
    """Planilha "Banco_Orçamento_Despesas_Frota": aba Base_Metas (Unidade, Natureza, Data, Valor) e aba BD_UND
    (UNIDADE, INF ADICIONAL: o centro de custo das transações, a coluna INFORMACAO ADIDIONAL 3).
    Devolve {arquivo, unidades: [[unidade, inf]], linhas: [[unidade, natureza, 'AAAA-MM', valor]]} (soma as repetidas)."""
    if not caminho or not os.path.isfile(caminho):
        return None
    copia = os.path.join(tmp, 'orcamento.xlsx')
    shutil.copy2(caminho, copia)
    wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
    try:
        unidades = []
        if 'BD_UND' in wb.sheetnames:
            linhas = wb['BD_UND'].iter_rows(values_only=True)
            cab = [texto(c).upper() for c in next(linhas)]
            iu, ii = cab.index('UNIDADE'), cab.index('INF ADICIONAL')
            for r in linhas:
                if r and texto(r[iu]) and texto(r[ii]):
                    unidades.append([texto(r[iu]), ' '.join(texto(r[ii]).upper().split())])
        soma = {}
        linhas = wb['Base_Metas'].iter_rows(values_only=True)
        cab = [texto(c).upper() for c in next(linhas)]
        ix = {k: cab.index(k) for k in ('UNIDADE', 'NATUREZA', 'DATA', 'VALOR')}
        for r in linhas:
            if r is None:
                continue
            und, nat, d, v = texto(r[ix['UNIDADE']]), ' '.join(texto(r[ix['NATUREZA']]).upper().split()), data_iso(r[ix['DATA']]), num(r[ix['VALOR']])
            if not und or not nat or d is None or v is None:
                continue
            k = (und, nat, d.strftime('%Y-%m'))
            soma[k] = soma.get(k, 0.0) + v
        return {'arquivo': os.path.basename(caminho), 'unidades': unidades,
                'linhas': [[u, n, m, round(v, 2)] for (u, n, m), v in sorted(soma.items())]}
    finally:
        wb.close()


def ler_aba_negociacao(wn):
    """Aba de negociações (DATA, FORNECEDOR, PRODUTO, PRECO, UNIDADE) -> {'dic', 'col'} colunar."""
    epoca = dt.date(1970, 1, 1)
    wn.reset_dimensions()
    ln = wn.iter_rows(values_only=True)
    cabn = [texto(c).upper() for c in next(ln)]
    ix = {k: cabn.index(k) for k in ('DATA', 'FORNECEDOR', 'PRODUTO', 'PRECO', 'UNIDADE')}
    dn = {k: Dicionario() for k in ('fornecedor', 'produto', 'unidade')}
    cn = {k: [] for k in ('data', 'fornecedor', 'produto', 'unidade', 'preco')}
    for r in ln:
        if r is None:
            continue
        r = tuple(r) + (None,) * (len(cabn) - len(r))
        d = data_iso(r[ix['DATA']])
        preco = num(r[ix['PRECO']])
        forn = texto(r[ix['FORNECEDOR']]).upper()
        if d is None or preco is None or preco <= 0 or not forn:   # preço zerado = lançamento vazio
            continue
        cn['data'].append((d - epoca).days)
        cn['fornecedor'].append(dn['fornecedor'](forn))
        cn['produto'].append(dn['produto'](texto(r[ix['PRODUTO']]).upper()))
        cn['unidade'].append(dn['unidade'](texto(r[ix['UNIDADE']]).upper()))
        cn['preco'].append(round(preco, 4))
    return {'dic': {k: v.lista for k, v in dn.items()}, 'col': cn}


def ler_bomba_interna(caminho, tmp):
    """CONTROLES\\Negociação bomba interna.xlsx (só leitura, por cópia): a aba das negociações (a que tem DATA e PRECO no
    cabeçalho) e a aba Fornecedores (FORNECEDOR, PRODUTO, UNIDADE, ATIVO, CNPJ) -> (negociacao, [[forn, produto, unidade, ativo, cnpj]])
    (cnpj só com os números; vazio = None)."""
    copia = os.path.join(tmp, 'bomba.xlsx')
    shutil.copy2(caminho, copia)
    wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
    try:
        negociacao, fornecedores = None, None
        for ws in wb.worksheets:
            ws.reset_dimensions()
            cab = [texto(c).upper() for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True), ())]
            if negociacao is None and {'DATA', 'FORNECEDOR', 'PRODUTO', 'PRECO', 'UNIDADE'} <= set(cab):
                negociacao = ler_aba_negociacao(ws)
            elif fornecedores is None and ws.title.upper() == 'FORNECEDORES' and {'FORNECEDOR', 'PRODUTO', 'UNIDADE'} <= set(cab):
                i = {k: cab.index(k) for k in ('FORNECEDOR', 'PRODUTO', 'UNIDADE')}
                ia = cab.index('ATIVO') if 'ATIVO' in cab else None
                ic = cab.index('CNPJ') if 'CNPJ' in cab else None
                fornecedores = []
                for r in ws.iter_rows(min_row=2, values_only=True):
                    if not r or not texto(r[i['FORNECEDOR']]):
                        continue
                    ativo = texto(r[ia]).upper() not in ('NAO', 'NÃO', 'N') if ia is not None and ia < len(r) else True
                    cnpj = ''.join(ch for ch in texto(r[ic]) if ch.isdigit()) if ic is not None and ic < len(r) else ''
                    fornecedores.append([texto(r[i['FORNECEDOR']]).upper(), texto(r[i['PRODUTO']]).upper(), texto(r[i['UNIDADE']]).upper(), ativo,
                                         cnpj if len(cnpj) == 14 else None])
        return negociacao, fornecedores
    finally:
        wb.close()


def main():
    origem = sys.argv[1] if len(sys.argv) > 1 else BASE_PADRAO
    try:
        r = gerar(origem)
    except FileNotFoundError as e:
        sys.exit(str(e))
    print('\n'.join(r['resumo']))


def gerar(origem=BASE_PADRAO, locais_path=LOCAIS_PADRAO, negociacoes_path=NEGOCIACOES_PADRAO, orcamento_path=ORCAMENTO_PADRAO):
    """Lê a Base (e a planilha de localização dos postos) e grava .dados/abastecimentos.json.
    Devolve {caminho, versao, linhas, resumo}."""
    if not os.path.isfile(origem):
        raise FileNotFoundError(f'Base não encontrada: {origem}')

    tmp = tempfile.mkdtemp(prefix='base-')
    copia = os.path.join(tmp, 'Base.xlsx')
    shutil.copy2(origem, copia)
    try:
        wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)

        # ---- Metas (uma linha por placa) ----
        wm = wb['Metas']
        wm.reset_dimensions()
        cab = [texto(c) for c in next(wm.iter_rows(min_row=1, max_row=1, values_only=True))]
        im = {nome: cab.index(nome) for nome in ('PLACA', 'CATEGORIA', 'UNIDADE', 'MODELO', 'META', 'CAP TANQUE')}
        im['ANO'] = cab.index('ANO') if 'ANO' in cab else None
        im['PONTO CRITICO'] = cab.index('PONTO CRITICO') if 'PONTO CRITICO' in cab else None   # km/L usado no roteirizador
        veiculos = {}
        for r in wm.iter_rows(min_row=2, values_only=True):
            r = tuple(r) + (None,) * (len(cab) - len(r))  # linhas com células finais vazias vêm curtas
            placa = texto(r[im['PLACA']]).upper()
            placa = PLACAS_CORRIGIDAS.get(placa, placa)   # ex.: PVH7231 na aba Metas = PVH7C31 dos abastecimentos
            if not placa or placa in veiculos:
                continue
            veiculos[placa] = {
                'categoria': texto(r[im['CATEGORIA']]).upper() or None,
                'modelo': texto(r[im['MODELO']]) or None,
                'unidade': texto(r[im['UNIDADE']]) or None,
                'meta': arred(num(r[im['META']]), 4),
                'tanque': arred(num(r[im['CAP TANQUE']]), 2),
                'ano': (texto(r[im['ANO']]).split('.')[0] or None) if im['ANO'] is not None else None,
                'pc': arred(num(r[im['PONTO CRITICO']]), 3) if im['PONTO CRITICO'] is not None else None,
            }

        # ---- Transações ----
        wt = wb['Transações']
        wt.reset_dimensions()  # a dimensão gravada no arquivo pode estar desatualizada
        linhas = wt.iter_rows(values_only=True)
        cab = [texto(c) for c in next(linhas)]
        it = {k: cab.index(v) for k, v in C.items()}

        # cartão usado (Cartões frota: última transação de cada cartão): coluna FORMA DE PAGAMENTO, se existir
        i_forma = cab.index('FORMA DE PAGAMENTO') if 'FORMA DE PAGAMENTO' in cab else None
        # serviço: o Real x Orçado só conta "Abastecimento" (as poucas outras linhas são guardadas pelo índice)
        i_servico = cab.index('SERVICO') if 'SERVICO' in cab else None
        fora_abastecimento = []
        # endereço de cada posto (o da transação mais recente): o cadastro de coordenadas do Mapa de calor mostra
        i_end = cab.index('ENDERECO') if 'ENDERECO' in cab else None
        i_bairro = cab.index('BAIRRO') if 'BAIRRO' in cab else None
        enderecos = {}
        dics = {k: Dicionario() for k in ('placa', 'motorista', 'combustivel', 'fornecedor', 'cidade', 'cc', 'tipo_estab', 'cartao')}
        col = {k: [] for k in ('data', 'placa', 'motorista', 'combustivel', 'litros', 'vl_litro',
                               'hodometro', 'km', 'despesa', 'fornecedor', 'cidade', 'cc', 'campanha', 'tipo_estab', 'seg', 'cartao')}
        epoca = dt.date(1970, 1, 1)
        ignoradas = 0
        for r in linhas:
            if r is None or all(c is None for c in r[:20]):
                continue
            r = tuple(r) + (None,) * (len(cab) - len(r))
            d = data_iso(r[it['data']])
            litros = num(r[it['litros']])
            if d is None or litros is None:
                ignoradas += 1
                continue
            km = num(r[it['km']])
            hod = num(r[it['hodometro']])
            cidade = texto(r[it['cidade']])
            uf = texto(r[it['uf']])
            if i_servico is not None and texto(r[i_servico]) != 'Abastecimento':
                fora_abastecimento.append(len(col['data']))
            col['data'].append((d - epoca).days)
            col['seg'].append(segundos_do_dia(r[it['data']]))
            col['placa'].append(dics['placa'](texto(r[it['placa']]).upper()))
            col['motorista'].append(dics['motorista'](texto(r[it['motorista']]).upper()))
            col['combustivel'].append(dics['combustivel'](texto(r[it['combustivel']]).upper()))
            col['litros'].append(round(litros, 4))
            col['vl_litro'].append(arred(num(r[it['vl_litro']]), 4))
            col['hodometro'].append(None if hod is None else round(hod))
            col['km'].append(None if km is None else round(km))  # o Power BI trata KM como inteiro
            col['despesa'].append(arred(num(r[it['despesa']]), 4))
            col['fornecedor'].append(dics['fornecedor'](texto(r[it['fornecedor']])))
            col['cidade'].append(dics['cidade'](f'{cidade} - {uf}' if cidade and uf else cidade))
            col['cc'].append(dics['cc'](texto(r[it['cc']]).upper()))
            camp = texto(r[it['campanha']]).upper()
            col['campanha'].append(1 if camp in ('SIM', 'S') else 0 if camp in ('NÃO', 'NAO', 'N') else None)
            col['tipo_estab'].append(dics['tipo_estab'](texto(r[it['tipo_estab']]).upper()))
            col['cartao'].append(dics['cartao'](cartao_usado(r[i_forma] if i_forma is not None else None, d)))
            if i_end is not None:
                end = ', '.join(t for t in (texto(r[i_end]), texto(r[i_bairro]) if i_bairro is not None else '') if t)
                if end:
                    enderecos[texto(r[it['fornecedor']]).upper()] = end

        corrigir_km_impossivel(col, dics)

        # ---- Negociação bomba interna (preço dos fornecedores para as bombas próprias) ----
        # desde 07/10/2026 numa planilha própria (CONTROLES\Negociação bomba interna.xlsx); a aba da Base só se ela faltar
        if os.path.isfile(BOMBA_PADRAO):
            negociacao, fornecedores_bomba = ler_bomba_interna(BOMBA_PADRAO, tmp)
        else:
            negociacao = ler_aba_negociacao(wb['Negociação bomba interna']) if 'Negociação bomba interna' in wb.sheetnames else None
            fornecedores_bomba = None
        wb.close()

        # ---- coordenadas dos postos (planilha LOCALIZAÇÃO DOS POSTOS, só leitura) ----
        locais, locais_suspeitos = {}, []
        if locais_path and os.path.isfile(locais_path):
            copia_loc = os.path.join(tmp, 'locais.xlsx')
            # LOCALIZAÇÃO estragada (já aconteceu na pasta do ownCloud) não pode parar a atualização: usa a última cópia boa
            import planilha_cartoes as pc
            boa, aviso_loc = pc.legivel(locais_path, 'locais')
            if aviso_loc:
                print('  AVISO: ' + aviso_loc)
            shutil.copy2(boa, copia_loc)
            wl = openpyxl.load_workbook(copia_loc, read_only=True, data_only=True)
            aba = 'Localização dos postos' if 'Localização dos postos' in wl.sheetnames else wl.sheetnames[-1]
            sl = wl[aba]
            sl.reset_dimensions()
            ll = sl.iter_rows(values_only=True)
            cabl = [texto(c).upper() for c in next(ll)]
            il = {k: cabl.index(k) for k in ('NOME ESTABELECIMENTO', 'LATITUDE', 'LONGITUDE')}
            ic, iu = (cabl.index('CIDADE') if 'CIDADE' in cabl else None), (cabl.index('UF') if 'UF' in cabl else None)
            sedes = sedes_municipios()
            for r in ll:
                if r is None:
                    continue
                r = tuple(r) + (None,) * (len(cabl) - len(r))
                nome = texto(r[il['NOME ESTABELECIMENTO']])
                lat, lon = coordenada(r[il['LATITUDE']], True), coordenada(r[il['LONGITUDE']], False)
                if not (nome and lat is not None and lon is not None) or nome.upper() in locais:
                    continue
                # coordenada longe da cidade da própria linha: erro de digitação/cópia na planilha; fica fora do mapa
                cid, uf = (texto(r[ic]) if ic is not None else ''), (texto(r[iu]).upper() if iu is not None else '')
                sede = sedes.get((chave_cidade(cid), uf))
                km = distancia_km(lat, lon, sede[0], sede[1]) if sede else None
                if km is not None and km > LIMITE_KM_CIDADE:
                    locais_suspeitos.append({'nome': nome.upper(), 'cidade': cid.upper(), 'uf': uf,
                                             'lat': round(lat, 6), 'lng': round(lon, 6), 'km': round(km)})
                    continue
                locais[nome.upper()] = [round(lat, 6), round(lon, 6)]
            wl.close()

        # ---- negociações com os postos externos (planilha "Gestão de negociações de preço", só leitura) ----
        neg_postos = ler_negociacoes(negociacoes_path, tmp)
        # ---- orçamento de despesas da frota (planilha "Banco_Orçamento_Despesas_Frota", só leitura) ----
        orcamento = ler_orcamento(orcamento_path, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    n = len(col['data'])
    agora = dt.datetime.now()
    saida = {
        'versao': agora.strftime('%Y%m%d%H%M%S'),
        'geradoEm': agora.strftime('%Y-%m-%dT%H:%M:%S'),
        'origem': 'planilha Base',
        'linhas': n,
        'dic': {k: d.lista for k, d in dics.items()},
        'veiculos': veiculos,
        'col': col,
        'negociacao': negociacao,   # planilha CONTROLES\Negociação bomba interna (antes, aba da Base)
        'fornecedoresBomba': fornecedores_bomba,   # aba Fornecedores dela: [[fornecedor, produto, unidade, ativo, cnpj]] (None = ainda não existe)
        'locais': locais,           # NOME DO POSTO (maiúsculas) -> [latitude, longitude]
        'locaisSuspeitos': locais_suspeitos,   # coordenada longe da cidade da linha: fora do mapa até corrigir
        'enderecos': enderecos,     # NOME DO POSTO (maiúsculas) -> "endereço, bairro" da transação mais recente
        'negPostos': neg_postos,    # planilha "Gestão de negociações de preço" (postos externos)
        'orcamento': orcamento,     # planilha "Banco_Orçamento_Despesas_Frota" (dashboard Real x Orçado)
        'foraAbastecimento': fora_abastecimento,   # índices das linhas com SERVICO diferente de "Abastecimento"
    }
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))

    # ---- conferência: mesmos filtros da aba "Operação p/ Motorista" do Power BI ----
    # todo tipo de diesel (S-10, S-10 aditivado, comum...) conta junto, como no portal (lib/dados.js ehDiesel)
    km_t = lit_t = desp_t = lsm = 0.0
    qtd = 0
    for i in range(n):
        if 'DIESEL' not in str(dics['combustivel'].lista[col['combustivel'][i]] or '').upper():
            continue
        v = veiculos.get(dics['placa'].lista[col['placa'][i]])
        if not v or v['categoria'] in (None, 'PICAPE', 'VENDA'):
            continue
        qtd += 1
        k = col['km'][i] or 0
        km_t += k
        lit_t += col['litros'][i]
        desp_t += col['despesa'][i] or 0
        if v['meta']:
            lsm += k / v['meta']
    tam = os.path.getsize(SAIDA) / 1024 / 1024
    resumo = [
        f'Base lida: {n} abastecimentos ({ignoradas} linhas sem data/litros ignoradas), {len(veiculos)} placas em Metas.',
        f'Negociação bomba interna: {len(negociacao["col"]["data"]) if negociacao else 0} preços; '
        f'postos com coordenadas: {len(locais)} (suspeitas, fora do mapa: {len(locais_suspeitos)}); negociações de postos externos: '
        f'{len(neg_postos["col"]["data"]) if neg_postos else 0}.',
        f'Arquivo gerado: {os.path.relpath(SAIDA, PASTA_PROJETO)} ({tam:.1f} MB)',
    ]
    if lit_t:
        resumo += [
            'Conferência "Operação p/ Motorista" (todos os filtros em Todos):',
            f'  abastecimentos {qtd} | km {km_t:,.0f} | litros {lit_t:,.2f} | valor R$ {desp_t:,.2f}',
            f'  economia de litros {lsm - lit_t:,.2f} | % meta {(km_t / lit_t) / (km_t / lsm):.2%}',
        ]
    return {'caminho': SAIDA, 'versao': saida['versao'], 'geradoEm': saida['geradoEm'], 'linhas': n, 'resumo': resumo}


if __name__ == '__main__':
    main()
