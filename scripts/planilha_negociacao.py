"""Planilha "Gestão de negociações de preço.xlsx" <-> portal.

    py scripts/planilha_negociacao.py gravar <alteracoes.json>   acrescenta as alterações do portal como linhas novas
    py scripts/planilha_negociacao.py gerar-postos               monta a lista dos motoristas (.dados/postos.csv)

Quem chama é o vigia (scripts/sincronizar.mjs). Cuidados ao gravar:
  - nunca altera linhas existentes: cada alteração é uma negociação nova no fim da aba "Base de dados de negociações";
  - se a planilha estiver aberta no Excel, não grava e devolve "aguardando" (o vigia tenta de novo);
  - antes de gravar, guarda uma cópia em .dados\\copias-planilha (as 30 mais recentes);
  - copia as fórmulas das colunas N, O e P da linha anterior e estende validações e formatação condicional.
Saída: uma linha JSON no stdout.
"""
import csv
import datetime as dt
import glob
import json
import os
import re
import shutil
import sys
import tempfile
import unicodedata

import openpyxl
from openpyxl.formatting.formatting import ConditionalFormattingList

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importar_base import coordenada   # noqa: E402  (mesma regra de leitura das coordenadas)
import planilha_cartoes as pc          # noqa: E402  (substituir: confere a planilha depois de gravar; legivel)
from openpyxl.worksheet.cell_range import MultiCellRange

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_DADOS_BI = os.path.dirname(PASTA_PROJETO)
PLANILHA = os.environ.get('PLANILHA_NEGOCIACAO') or os.path.join(PASTA_DADOS_BI, 'Gestão de negociações de preço.xlsx')
LOCAIS = os.path.join(PASTA_DADOS_BI, 'LOCALIZAÇÃO DOS POSTOS.xlsx')
ABA = 'Base de dados de negociações'
# fora do AppData: o Python da Microsoft Store virtualiza essa pasta e as cópias ficariam escondidas
COPIAS = os.path.join(PASTA_PROJETO, '.dados', 'copias-planilha')
COORDS_EXTRAS = os.path.join(PASTA_PROJETO, '.dados', 'coordenadas-postos.json')   # coordenadas digitadas no portal
POSTOS_SAIDA = os.path.join(PASTA_PROJETO, '.dados', 'postos.csv')
POSTOS_SEMENTE = os.path.join(PASTA_PROJETO, 'public', 'postos.csv')                 # coordenadas da lista antiga
DADOS_BASE = os.path.join(PASTA_PROJETO, '.dados', 'abastecimentos.json')
DATA_CORTE = dt.date(2026, 9, 15)   # último lote antes de a lista passar a ser gerada da planilha (71 postos)

NOME_UNIDADE = {
    'BELEM': 'Belém', 'CONQUISTA': 'Conquista', 'GOIANIA': 'Goiânia', 'GOVERNADOR VALADARES': 'Governador Valadares',
    'ILHEUS': 'Ilhéus', 'JEQUIE': 'Jequié', 'MARANHAO': 'Maranhão', 'RECIFE': 'Recife', 'SALVADOR': 'Salvador',
    'SAO PAULO': 'São Paulo', 'SERRA': 'Serra', 'TEIXEIRA': 'Teixeira',
}


def chave(s):
    return ' '.join(unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper().split())


def texto(v):
    return '' if v is None else ' '.join(str(v).split())


def saida(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + '\n')


def planilha_aberta():
    """Excel aberto: existe o arquivo-trava ~$ ou o arquivo não pode ser aberto para escrita."""
    pasta, nome = os.path.split(PLANILHA)
    if os.path.exists(os.path.join(pasta, '~$' + nome)) or os.path.exists(os.path.join(pasta, '~$' + nome[2:])):
        return True
    try:
        with open(PLANILHA, 'r+b'):
            return False
    except PermissionError:
        return True


def guardar_copia():
    os.makedirs(COPIAS, exist_ok=True)
    destino = os.path.join(COPIAS, 'negociacoes-' + dt.datetime.now().strftime('%Y%m%d-%H%M%S') + '.xlsx')
    shutil.copy2(PLANILHA, destino)
    for velho in sorted(glob.glob(os.path.join(COPIAS, 'negociacoes-*.xlsx')))[:-30]:
        try:
            os.remove(velho)
        except OSError:
            pass
    return destino


def ultima_transacao_por_posto():
    """Data da última transação de cada posto na Base (preenche a coluna K, usada para o preço)."""
    try:
        with open(DADOS_BASE, encoding='utf-8') as f:
            d = json.load(f)
    except Exception:
        return {}
    nomes, col = d['dic']['fornecedor'], d['col']
    ult = {}
    for i in range(d['linhas']):
        k = chave(nomes[col['fornecedor'][i]])
        if col['data'][i] > ult.get(k, -1):
            ult[k] = col['data'][i]
    return {k: dt.datetime(1970, 1, 1) + dt.timedelta(days=v) for k, v in ult.items()}


def data_transacao(v):
    """'2026-09-22T13:11:15' -> datetime (coluna K); vazio ou inválido -> None."""
    try:
        return dt.datetime.fromisoformat(v) if v else None
    except (TypeError, ValueError):
        return None


def estender_intervalo(sqref, ultima):
    """'F2:F1805' -> 'F2:F<ultima>' (só aumenta)."""
    partes = []
    for faixa in str(sqref).split():
        m = re.fullmatch(r'([A-Z]+)(\d+):([A-Z]+)(\d+)', faixa)
        if m and int(m.group(4)) < ultima:
            faixa = f'{m.group(1)}{m.group(2)}:{m.group(3)}{ultima}'
        partes.append(faixa)
    return ' '.join(partes)


def indice_linhas(ws, ultima):
    """(unidade, posto) -> linhas da aba, em ordem."""
    idx = {}
    for r in range(2, ultima + 1):
        p = ws.cell(r, 4).value
        if p not in (None, ''):
            idx.setdefault((chave(ws.cell(r, 3).value), chave(p)), []).append(r)
    return idx


def ultimo_valor(ws, linhas):
    """Valor negociado (H) da linha mais recente que tem valor."""
    for r in reversed(linhas):
        v = ws.cell(r, 8).value
        if isinstance(v, (int, float)) and v > 0:
            return v
    return None


def marcar_novo_contato(ws, linhas):
    """Coluna J ("Novo contato feito?"): "Sim" nas negociações substituídas por uma mais nova do mesmo posto.
    É o que tira delas os avisos de DESATUALIZADO / RENEGOCIAÇÃO OBRIGATÓRIA (fórmulas N a P). Devolve quantas mudou."""
    n = 0
    for r in linhas:
        if str(ws.cell(r, 10).value or '').strip().upper() != 'SIM':
            ws.cell(r, 10).value = 'Sim'
            n += 1
    return n


def gravar(arquivo_json):
    with open(arquivo_json, encoding='utf-8-sig') as f:   # -sig: aceita o arquivo com ou sem BOM
        alteracoes = json.load(f)
    if not alteracoes:
        return saida({'itens': []})
    if not os.path.isfile(PLANILHA):
        return saida({'itens': [{'id': a['id'], 'estado': 'erro', 'mensagem': 'Planilha não encontrada.'} for a in alteracoes]})
    if planilha_aberta():
        return saida({'itens': [{'id': a['id'], 'estado': 'aguardando',
                                 'mensagem': 'A planilha está aberta no Excel. A alteração será gravada quando ela for fechada.'}
                                for a in alteracoes]})
    copia = guardar_copia()
    wb = openpyxl.load_workbook(PLANILHA)
    ws = wb[ABA]
    ultima = ws.max_row
    while ultima > 1 and ws.cell(ultima, 4).value in (None, ''):
        ultima -= 1
    modelo = ultima
    ult_transacao = ultima_transacao_por_posto()
    linhas_do_posto = indice_linhas(ws, ultima)
    itens = []
    try:
        with open(COORDS_EXTRAS, encoding='utf-8') as f:
            extras = json.load(f)
    except Exception:
        extras = {}
    for a in alteracoes:
        d = a['dados']
        r = ultima + 1
        for c in range(1, 18):   # formato igual ao da linha anterior (A..Q)
            origem, destino = ws.cell(modelo, c), ws.cell(r, c)
            if origem.has_style:
                destino._style = origem._style
        valores = {
            1: dt.datetime.combine(dt.date.today(), dt.time()),
            2: d.get('contato') or (texto(a.get('usuario_nome')).upper() + ' (PORTAL)'),
            3: d['unidade'], 4: d['posto'], 5: d['cidade'],
            6: d.get('tipo') or None, 7: d['plataforma'], 8: d.get('valor'),
            9: d.get('combustivel') or 'DIESEL S-10 COMUM', 10: None,
            # rodada de preços: a transação que deu o preço vem do portal (com a hora); senão, a última do posto
            11: data_transacao(d.get('transacao')) or ult_transacao.get(chave(d['posto'])),
            12: d['status'], 13: d.get('aviso') or None,
        }
        if d.get('variacao') is not None:   # Q: variação % contra a negociação anterior (só na rodada)
            valores[17] = d['variacao']
        k = (chave(d['unidade']), chave(d['posto']))
        movidas = []
        if d.get('unidade_anterior') or d.get('posto_anterior'):
            # correção de cadastro: posto na unidade errada e/ou com o nome diferente do que está no portal do cartão.
            # As linhas do cadastro antigo passam a ter a unidade (C) e o nome (D) novos, para ele sair da lista com o
            # cadastro antigo; a negociação nova entra logo abaixo, como numa edição normal
            ka = (chave(d.get('unidade_anterior') or d['unidade']), chave(d.get('posto_anterior') or d['posto']))
            if ka != k:
                movidas = linhas_do_posto.pop(ka, [])
                for rr in movidas:
                    ws.cell(rr, 3).value = d['unidade']
                    ws.cell(rr, 4).value = d['posto']
                linhas_do_posto[k] = sorted(linhas_do_posto.get(k, []) + movidas)
                # coordenada digitada no portal para o nome antigo vale para o nome novo (se ele não tiver uma)
                if d.get('posto_anterior') and chave(d['posto_anterior']) in extras and chave(d['posto']) not in extras:
                    extras[chave(d['posto'])] = extras[chave(d['posto_anterior'])]
        anteriores = linhas_do_posto.get(k, [])
        if valores[8] is None:   # valor em branco (ex.: só mudou o tipo ou a situação): mantém o da última negociação
            valores[8] = ultimo_valor(ws, anteriores)
        for c, v in valores.items():
            ws.cell(r, c).value = v
        marcar_novo_contato(ws, anteriores)   # J = "Sim" nas linhas anteriores do posto, como na rotina manual
        linhas_do_posto.setdefault(k, []).append(r)
        for c in (14, 15, 16):   # N, O, P: fórmulas da linha anterior com o número da linha trocado
            f = ws.cell(modelo, c).value
            if isinstance(f, str) and f.startswith('='):
                ws.cell(r, c).value = re.sub(r'(?<![$A-Z])([A-Z]{1,3})' + str(modelo) + r'(?!\d)', r'\g<1>' + str(r), f)
        if d.get('latitude') is not None and d.get('longitude') is not None:
            extras[chave(d['posto'])] = [d['latitude'], d['longitude']]
        itens.append({'id': a['id'], 'estado': 'aplicada', 'linha': r, **({'movidas': movidas} if movidas else {})})
        modelo = r
        ultima = r

    # validações e formatação condicional passam a cobrir as linhas novas
    for dv in ws.data_validations.dataValidation:
        dv.sqref = MultiCellRange(estender_intervalo(dv.sqref, ultima))
    nova = ConditionalFormattingList()
    for cf in ws.conditional_formatting:
        faixa = estender_intervalo(cf.sqref, ultima)
        for regra in cf.rules:
            nova.add(faixa, regra)
    ws.conditional_formatting = nova

    # o openpyxl não guarda o resultado das fórmulas: o Excel recalcula tudo ao abrir a planilha
    wb.calculation.fullCalcOnLoad = True

    # grava num arquivo temporário e só então substitui a planilha (se algo falhar, a original fica intacta)
    tmp = os.path.join(os.path.dirname(COPIAS), 'gravando-negociacoes.xlsx')
    wb.save(tmp)
    openpyxl.load_workbook(tmp, read_only=True).close()   # confere que o arquivo abre
    if planilha_aberta():
        return saida({'itens': [{'id': i['id'], 'estado': 'aguardando',
                                 'mensagem': 'A planilha foi aberta no Excel durante a gravação; tenta de novo quando ela for fechada.'}
                                for i in itens]})
    try:
        pc.substituir(tmp, PLANILHA, copia)   # confere o arquivo depois de gravar (ownCloud)
    finally:
        os.remove(tmp)
    os.makedirs(os.path.dirname(COORDS_EXTRAS), exist_ok=True)
    with open(COORDS_EXTRAS, 'w', encoding='utf-8') as f:
        json.dump(extras, f, ensure_ascii=False)
    saida({'itens': itens, 'copia': copia})


def corrigir_portal():
    """Correção única do que o portal gravou antes desta versão (a partir de 30/09/2026, quando ele passou a gravar):
    valor em branco nas linhas do portal e coluna J vazia nas negociações que essas linhas substituíram."""
    if planilha_aberta():
        return saida({'erro': 'A planilha está aberta no Excel. Feche e rode de novo.'})
    copia = guardar_copia()
    wb = openpyxl.load_workbook(PLANILHA)
    ws = wb[ABA]
    ultima = ws.max_row
    while ultima > 1 and ws.cell(ultima, 4).value in (None, ''):
        ultima -= 1
    inicio_portal = dt.datetime(2026, 9, 30)
    valores, contatos = [], 0
    for k, linhas in indice_linhas(ws, ultima).items():
        for i, r in enumerate(linhas):
            if '(PORTAL)' in str(ws.cell(r, 2).value or '') and ws.cell(r, 8).value in (None, ''):
                v = ultimo_valor(ws, linhas[:i])
                if v is not None:
                    ws.cell(r, 8).value = v
                    valores.append(r)
            # substituída por uma linha gravada pelo portal: J = "Sim"
            depois = linhas[i + 1:]
            if any(isinstance(ws.cell(x, 1).value, dt.datetime) and ws.cell(x, 1).value >= inicio_portal for x in depois):
                contatos += marcar_novo_contato(ws, [r])
    wb.calculation.fullCalcOnLoad = True
    tmp = os.path.join(os.path.dirname(COPIAS), 'gravando-negociacoes.xlsx')
    wb.save(tmp)
    openpyxl.load_workbook(tmp, read_only=True).close()
    if planilha_aberta():
        return saida({'erro': 'A planilha foi aberta no Excel durante a correção. Feche e rode de novo.'})
    try:
        pc.substituir(tmp, PLANILHA, copia)
    finally:
        os.remove(tmp)
    saida({'valores_preenchidos': valores, 'linhas_marcadas_sim': contatos, 'copia': copia})


def gerar_postos():
    tmpdir = tempfile.mkdtemp(prefix='neg-')
    try:
        copia = os.path.join(tmpdir, 'neg.xlsx')
        shutil.copy2(PLANILHA, copia)
        wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
        ws = wb[ABA]
        ws.reset_dimensions()
        linhas = ws.iter_rows(values_only=True)
        cab = [texto(c) for c in next(linhas)]
        ix = {n: cab.index(n) for n in ('Data da negociação', 'Unidade', 'Posto negociado', 'Cidade', 'Plataforma', 'Observação', 'Aviso', 'Tipo')}
        ultimo = {}   # (unidade, posto) -> (data, ordem, linha)
        for ordem, r in enumerate(linhas):
            if r is None:
                continue
            r = tuple(r) + (None,) * (len(cab) - len(r))
            posto = texto(r[ix['Posto negociado']])
            d = r[ix['Data da negociação']]
            if not posto or not isinstance(d, (dt.datetime, dt.date)):
                continue
            d = d.date() if isinstance(d, dt.datetime) else d
            k = (chave(r[ix['Unidade']]), chave(posto))   # o mesmo posto pode atender duas unidades
            if k not in ultimo or (d, ordem) >= ultimo[k][:2]:
                ultimo[k] = (d, ordem, r)
        wb.close()

        # Toda semana entra um lote com o preço atual de cada posto, mas só dos que tiveram transação; os outros
        # ficam sem linha nova. Por isso o posto continua na lista (com a última negociação dele) até ser
        # bloqueado ou renegociado. Negociações de antes da data de corte (quando a lista passou a sair da
        # planilha) não voltam: a lista daquele dia era a que os motoristas já usavam.
        inicio = DATA_CORTE

        coords = {}
        try:
            with open(POSTOS_SEMENTE, encoding='utf-8-sig') as f:
                for p in csv.DictReader(f, delimiter=';'):
                    if p.get('Latitude') and p.get('Longitude'):
                        coords[chave(p['Posto'])] = [p['Latitude'], p['Longitude']]
        except Exception:
            pass
        if os.path.isfile(LOCAIS):
            cl = os.path.join(tmpdir, 'loc.xlsx')
            # LOCALIZAÇÃO estragada não pode parar a lista dos motoristas: usa a última cópia boa
            shutil.copy2(pc.legivel(LOCAIS, 'locais')[0], cl)
            wl = openpyxl.load_workbook(cl, read_only=True, data_only=True)
            sl = wl['Localização dos postos'] if 'Localização dos postos' in wl.sheetnames else wl.worksheets[-1]
            sl.reset_dimensions()
            ll = sl.iter_rows(values_only=True)
            cabl = [texto(c).upper() for c in next(ll)]
            il = {n: cabl.index(n) for n in ('NOME ESTABELECIMENTO', 'LATITUDE', 'LONGITUDE')}
            for r in ll:
                if r is None:
                    continue
                r = tuple(r) + (None,) * (len(cabl) - len(r))
                # mesma leitura do importar_base: aceita coordenada sem a vírgula decimal e descarta fora do Brasil
                lat, lon = coordenada(r[il['LATITUDE']], True), coordenada(r[il['LONGITUDE']], False)
                if lat is not None and lon is not None:
                    coords.setdefault(chave(r[il['NOME ESTABELECIMENTO']]), [round(lat, 6), round(lon, 6)])
            wl.close()
        try:
            with open(COORDS_EXTRAS, encoding='utf-8') as f:
                coords.update(json.load(f))   # o que foi digitado no portal vale mais
        except Exception:
            pass

        # Tipo: POLO (pode completar o tanque) ou MINIMO (pernoite/auxiliar, só o mínimo); vazio = sem classificação
        saida_linhas = ['Unidade;Posto;Cidade;Status;Cartao;Latitude;Longitude;Aviso;Negociado;Tipo']
        limpa = lambda v: texto(v).replace(';', ',')
        n = 0
        ordenados = sorted(ultimo.items(), key=lambda kv: (kv[0][0], chave(kv[1][2][ix['Cidade']]), kv[0][1]))
        for (uni, k), (d, _, r) in ordenados:
            if d < inicio:
                continue
            lat, lon = coords.get(k, ['', ''])
            saida_linhas.append(';'.join([
                NOME_UNIDADE.get(uni, texto(r[ix['Unidade']]).title()), limpa(r[ix['Posto negociado']]), limpa(r[ix['Cidade']]),
                limpa(r[ix['Observação']]), limpa(r[ix['Plataforma']]), str(lat), str(lon), limpa(r[ix['Aviso']]),
                d.isoformat(), limpa(r[ix['Tipo']]).upper(),
            ]))
            n += 1
        os.makedirs(os.path.dirname(POSTOS_SAIDA), exist_ok=True)
        with open(POSTOS_SAIDA, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(saida_linhas) + '\n')
        saida({'postos': n, 'desde': inicio.isoformat(), 'arquivo': POSTOS_SAIDA})
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'gravar':
        gravar(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == 'gerar-postos':
        gerar_postos()
    elif len(sys.argv) >= 2 and sys.argv[1] == 'corrigir-portal':
        corrigir_portal()
    else:
        sys.exit(__doc__)
