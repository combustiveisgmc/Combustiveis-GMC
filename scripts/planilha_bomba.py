"""Grava na planilha CONTROLES\\Negociação bomba interna.xlsx as negociações e os fornecedores lançados no site
(Operacional > Preço bomba interna) e repete o preço do Arla todo dia.

    py scripts/planilha_bomba.py gravar <alteracoes.json>   negociações e fornecedores pendentes do site
    py scripts/planilha_bomba.py arla                       repete o último preço do Arla até hoje (fornecedores ativos)

alteracoes.json = [{"id": 1, "tipo": "negociacao", "dados": {"data": "2026-10-07", "fornecedor": "VIBRA", "produto": "DIESEL",
                    "unidade": "SP", "preco": 5.2825}},
                   {"id": 2, "tipo": "fornecedor", "dados": {"fornecedor": "NOVO", "produto": "ARLA", "unidades": ["SP"], "ativo": true}}]
Abas:
  - negociações (a que tem DATA, FORNECEDOR, PRODUTO, PRECO, UNIDADE no cabeçalho; hoje "Plan1"): uma linha por preço;
    negociação do mesmo dia, fornecedor, produto e unidade troca o preço em vez de criar outra linha;
  - "Fornecedores" (FORNECEDOR, PRODUTO, UNIDADE, ATIVO, CNPJ): quem é cotado em cada produto e unidade; o CNPJ (de cada
    unidade do fornecedor) liga o fornecedor às notas do Rateio das NFs. A coluna CNPJ é criada se faltar. Se não existir, é
    criada a partir do histórico (ATIVO = SIM para quem cotou nos últimos 30 dias). Negociação de um fornecedor que não
    está na aba acrescenta a linha dele.
Arla: para cada fornecedor ATIVO de Arla, se a última linha dele naquela unidade é de antes de hoje, acrescenta uma linha
por dia (até 31 dias) com o mesmo preço. Diesel não repete. Linhas novas copiam o formato da linha de cima.
Planilha aberta no Excel: não grava e devolve "aguardando"; antes de gravar, guarda uma cópia (as 10 mais recentes).
Para testar numa cópia: PLANILHA_BOMBA=<caminho>. Saída: uma linha JSON no stdout.
"""
import copy
import datetime as dt
import glob
import json
import os
import re
import shutil
import sys
import unicodedata

import openpyxl

import planilha_cartoes as pc   # planilha_aberta()

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PADRAO = os.path.join(PASTA_PROJETO, 'CONTROLES', 'Negociação bomba interna.xlsx')
COPIAS = os.path.join(PASTA_PROJETO, '.dados', 'copias-planilha')
GUARDAR_COPIAS = 10
CAB_NEG = ('DATA', 'FORNECEDOR', 'PRODUTO', 'PRECO', 'UNIDADE')
CAB_FORN = ('FORNECEDOR', 'PRODUTO', 'UNIDADE', 'ATIVO')
ATIVO_DIAS = 30        # ao criar a aba Fornecedores: ativo quem cotou nos últimos 30 dias
ARLA_MAX_DIAS = 31     # repetição do Arla: no máximo um mês de linhas de uma vez


def planilha():
    return os.environ.get('PLANILHA_BOMBA') or PADRAO


def saida(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, default=str) + '\n')


def chave(s):
    return ' '.join(unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper().split())


def como_data(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def guardar_copia(caminho):
    os.makedirs(COPIAS, exist_ok=True)
    destino = os.path.join(COPIAS, 'bomba-' + dt.datetime.now().strftime('%Y%m%d-%H%M%S') + '.xlsx')
    shutil.copy2(caminho, destino)
    for velho in sorted(glob.glob(os.path.join(COPIAS, 'bomba-*.xlsx')))[:-GUARDAR_COPIAS]:
        try:
            os.remove(velho)
        except OSError:
            pass
    return destino


class Planilha:
    def __init__(self, caminho):
        self.caminho = caminho
        self.wb = openpyxl.load_workbook(caminho)
        self.neg, self.col = None, None
        for ws in self.wb.worksheets:
            cab = [chave(c.value) for c in ws[1]]
            if set(CAB_NEG) <= set(cab):
                self.neg, self.col = ws, {k: cab.index(k) + 1 for k in CAB_NEG}
                break
        if self.neg is None:
            raise ValueError('Não achei a aba das negociações (cabeçalho DATA, FORNECEDOR, PRODUTO, PRECO, UNIDADE). Nada foi gravado.')
        # índice: (dia, fornecedor, produto, unidade) -> linha; e a última linha de cada (fornecedor, produto, unidade)
        self.linha_de, self.ultima, self.fim = {}, {}, 1
        for r in range(2, self.neg.max_row + 1):
            v = lambda k: self.neg.cell(row=r, column=self.col[k]).value
            d = como_data(v('DATA'))
            if d is None or not v('FORNECEDOR'):
                continue
            k = (chave(v('FORNECEDOR')), chave(v('PRODUTO')), chave(v('UNIDADE')))
            self.linha_de[(d, *k)] = r
            preco = v('PRECO')
            # preço zerado é lançamento vazio: não vira o "último preço" (que o Arla repete)
            if isinstance(preco, (int, float)) and preco > 0 and (k not in self.ultima or d >= self.ultima[k][0]):
                self.ultima[k] = (d, preco, r)
            self.fim = r
        self.forn = self.wb['Fornecedores'] if 'Fornecedores' in self.wb.sheetnames else None
        self.criou_fornecedores = False
        if self.forn is None:
            self.criar_fornecedores()
        cab = [chave(c.value) for c in self.forn[1]]
        if not set(CAB_FORN) <= set(cab):
            raise ValueError('A aba Fornecedores precisa das colunas FORNECEDOR, PRODUTO, UNIDADE e ATIVO. Nada foi gravado.')
        self.fcol = {k: cab.index(k) + 1 for k in CAB_FORN}
        if 'CNPJ' in cab:
            self.fcol['CNPJ'] = cab.index('CNPJ') + 1
        else:   # coluna nova depois da última, no formato do cabeçalho
            col = len([c for c in cab if c]) + 1
            modelo = self.forn.cell(row=1, column=1)
            c = self.forn.cell(row=1, column=col, value='CNPJ')
            c.font, c.fill, c.border, c.alignment = copy.copy(modelo.font), copy.copy(modelo.fill), copy.copy(modelo.border), copy.copy(modelo.alignment)
            self.forn.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 20
            self.fcol['CNPJ'] = col
        self.forn_linha = {}
        for r in range(2, self.forn.max_row + 1):
            v = lambda k: self.forn.cell(row=r, column=self.fcol[k]).value
            if v('FORNECEDOR'):
                self.forn_linha[(chave(v('FORNECEDOR')), chave(v('PRODUTO')), chave(v('UNIDADE')))] = r

    def criar_fornecedores(self):
        ws = self.wb.create_sheet('Fornecedores')
        modelo = self.neg.cell(row=1, column=1)
        for i, t in enumerate(CAB_FORN, start=1):
            c = ws.cell(row=1, column=i, value=t)
            c.font, c.fill, c.border, c.alignment = copy.copy(modelo.font), copy.copy(modelo.fill), copy.copy(modelo.border), copy.copy(modelo.alignment)
        hoje = dt.date.today()
        for k in sorted(self.ultima):
            d = self.ultima[k][0]
            ws.append([*k, 'SIM' if (hoje - d).days <= ATIVO_DIAS else 'NAO'])
        for col, larg in zip('ABCD', (22, 12, 14, 8)):
            ws.column_dimensions[col].width = larg
        ws.auto_filter.ref = 'A1:D%d' % max(ws.max_row, 1)
        self.forn, self.criou_fornecedores = ws, True

    def garantir_fornecedor(self, forn, produto, unidade, ativo=True, cnpj=None):
        k = (chave(forn), chave(produto), chave(unidade))
        r = self.forn_linha.get(k)
        if r is None:
            r = self.forn.max_row + 1
            for nome, v in zip(CAB_FORN, (*k, 'SIM' if ativo else 'NAO')):
                c = self.forn.cell(row=r, column=self.fcol[nome], value=v)
                if r > 2:
                    c._style = copy.copy(self.forn.cell(row=r - 1, column=self.fcol[nome])._style)
            self.forn_linha[k] = r
            if self.forn.auto_filter.ref:
                self.forn.auto_filter.ref = 'A1:%s%d' % (openpyxl.utils.get_column_letter(max(self.fcol.values())), r)
        else:
            self.forn.cell(row=r, column=self.fcol['ATIVO'], value='SIM' if ativo else 'NAO')
        if cnpj is not None:   # '' apaga; 14 números viram 00.000.000/0000-00
            n = re.sub(r'\D', '', str(cnpj))
            c = self.forn.cell(row=r, column=self.fcol['CNPJ'], value=(f'{n[:2]}.{n[2:5]}.{n[5:8]}/{n[8:12]}-{n[12:]}' if len(n) == 14 else None))
            if r > 2:
                c._style = copy.copy(self.forn.cell(row=r - 1, column=self.fcol['ATIVO'])._style)
        return r

    def negociacao(self, dia, forn, produto, unidade, preco):
        k = (chave(forn), chave(produto), chave(unidade))
        r = self.linha_de.get((dia, *k))
        if r is None:
            self.fim += 1
            r = self.fim
            for col in range(1, self.neg.max_column + 1):   # formato da linha de cima (data, R$ com 4 casas...)
                if r > 2:
                    self.neg.cell(row=r, column=col)._style = copy.copy(self.neg.cell(row=r - 1, column=col)._style)
            for nome, v in (('DATA', dt.datetime(dia.year, dia.month, dia.day)), ('FORNECEDOR', k[0]), ('PRODUTO', k[1]), ('UNIDADE', k[2])):
                self.neg.cell(row=r, column=self.col[nome], value=v)
            self.linha_de[(dia, *k)] = r
        self.neg.cell(row=r, column=self.col['PRECO'], value=round(float(preco), 4))
        if k not in self.ultima or dia >= self.ultima[k][0]:
            self.ultima[k] = (dia, round(float(preco), 4), r)
        self.garantir_fornecedor(*k)
        return r

    def excluir(self, dia, forn, produto, unidade):
        # preço lançado por engano: a célula do preço fica vazia ("cotação zerada é lançamento vazio" para a página e o Arla);
        # a linha fica (não desloca as outras) e um lançamento novo no mesmo dia reaproveita ela
        k = (chave(forn), chave(produto), chave(unidade))
        r = self.linha_de.get((dia, *k))
        if r is None:
            return None
        self.neg.cell(row=r, column=self.col['PRECO']).value = None   # cell(..., value=None) não apaga (o openpyxl ignora o None)
        if k in self.ultima and self.ultima[k][2] == r:   # era o último preço (o Arla repete): volta ao anterior com preço
            outras = [(d, l) for (d, *kk), l in self.linha_de.items() if tuple(kk) == k and l != r]
            com_preco = [(d, self.neg.cell(row=l, column=self.col['PRECO']).value, l) for d, l in outras]
            com_preco = [x for x in com_preco if isinstance(x[1], (int, float)) and x[1] > 0]
            if com_preco:
                self.ultima[k] = max(com_preco)
            else:
                del self.ultima[k]
        return r

    def repetir_arla(self, ate):
        novas = []
        for k, r in list(self.forn_linha.items()):
            if k[1] != 'ARLA' or chave(self.forn.cell(row=r, column=self.fcol['ATIVO']).value) in ('NAO', 'N'):
                continue
            ult = self.ultima.get(k)
            if not ult or ult[1] in (None, '') or ult[0] >= ate:
                continue
            d = max(ult[0] + dt.timedelta(days=1), ate - dt.timedelta(days=ARLA_MAX_DIAS - 1))
            while d <= ate:
                if (d, *k) not in self.linha_de:
                    novas.append({'data': d.isoformat(), 'fornecedor': k[0], 'unidade': k[2], 'preco': ult[1],
                                  'linha': self.negociacao(d, k[0], 'ARLA', k[2], ult[1])})
                d += dt.timedelta(days=1)
        return novas

    def salvar(self):
        copia = guardar_copia(self.caminho)
        tmp = os.path.join(os.path.dirname(COPIAS), 'gravando-bomba.xlsx')
        self.wb.save(tmp)
        openpyxl.load_workbook(tmp, read_only=True).close()   # o arquivo novo abre
        if pc.planilha_aberta(self.caminho):
            os.remove(tmp)
            return None
        try:
            pc.substituir(tmp, self.caminho, copia)   # confere o arquivo depois de gravar (ownCloud)
        finally:
            os.remove(tmp)
        return copia


def abrir_ou_erro(itens):
    caminho = planilha()
    if not os.path.isfile(caminho):
        return None, {'itens': [{'id': i['id'], 'estado': 'erro', 'mensagem': 'Planilha Negociação bomba interna não encontrada na pasta CONTROLES.'} for i in itens]}
    if pc.planilha_aberta(caminho):
        return None, {'itens': [{'id': i['id'], 'estado': 'aguardando', 'mensagem': 'A planilha Negociação bomba interna está aberta no Excel; grava quando ela for fechada.'} for i in itens]}
    try:
        return Planilha(caminho), None
    except ValueError as e:
        return None, {'itens': [{'id': i['id'], 'estado': 'erro', 'mensagem': str(e)} for i in itens]}


def gravar(arquivo_json):
    with open(arquivo_json, encoding='utf-8-sig') as f:
        itens = json.load(f)
    if not itens:
        return saida({'itens': []})
    p, erro = abrir_ou_erro(itens)
    if erro:
        return saida(erro)
    resultado = []
    for it in itens:
        d = it.get('dados') or {}
        try:
            if it['tipo'] == 'negociacao' and d.get('excluir'):
                dia = como_data(d.get('data'))
                if not dia or not d.get('fornecedor') or not d.get('produto') or not d.get('unidade'):
                    raise ValueError('exclusão incompleta')
                resultado.append({'id': it['id'], 'estado': 'aplicada', 'linha': p.excluir(dia, d['fornecedor'], d['produto'], d['unidade'])})
            elif it['tipo'] == 'negociacao':
                dia = como_data(d.get('data'))
                if not dia or not d.get('fornecedor') or not d.get('produto') or not d.get('unidade') or not (float(d.get('preco') or 0) > 0):
                    raise ValueError('negociação incompleta')
                resultado.append({'id': it['id'], 'estado': 'aplicada', 'linha': p.negociacao(dia, d['fornecedor'], d['produto'], d['unidade'], d['preco'])})
            elif it['tipo'] == 'fornecedor':
                unidades = d.get('unidades') or []
                if not d.get('fornecedor') or not d.get('produto') or not unidades:
                    raise ValueError('fornecedor incompleto')
                cnpjs = d.get('cnpjs') or {}
                for u in unidades:
                    p.garantir_fornecedor(d['fornecedor'], d['produto'], u, d.get('ativo', True), cnpjs.get(u))
                resultado.append({'id': it['id'], 'estado': 'aplicada'})
            else:
                raise ValueError('tipo desconhecido')
        except (ValueError, TypeError) as e:
            resultado.append({'id': it['id'], 'estado': 'erro', 'mensagem': 'Não gravado: ' + str(e)})
    if not any(r['estado'] == 'aplicada' for r in resultado):
        return saida({'itens': resultado})
    copia = p.salvar()
    if copia is None:
        return saida({'itens': [{'id': r['id'], 'estado': 'aguardando', 'mensagem': 'A planilha foi aberta no Excel durante a gravação; tenta de novo.'} for r in resultado]})
    saida({'itens': resultado, 'copia': copia, 'criouFornecedores': p.criou_fornecedores})


def arla():
    caminho = planilha()
    if not os.path.isfile(caminho):
        return saida({'erro': 'Planilha Negociação bomba interna não encontrada na pasta CONTROLES.'})
    if pc.planilha_aberta(caminho):
        return saida({'aguardando': True})
    try:
        p = Planilha(caminho)
    except ValueError as e:
        return saida({'erro': str(e)})
    novas = p.repetir_arla(dt.date.today())
    if not novas and not p.criou_fornecedores:
        return saida({'novas': []})
    copia = p.salvar()
    if copia is None:
        return saida({'aguardando': True})
    saida({'novas': novas, 'copia': copia, 'criouFornecedores': p.criou_fornecedores})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) >= 3 and sys.argv[1] == 'gravar':
        gravar(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == 'arla':
        arla()
    else:
        print(__doc__)
        sys.exit(1)
