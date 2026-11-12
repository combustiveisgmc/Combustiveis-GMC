"""Grava na planilha LOCALIZAÇÃO DOS POSTOS (pasta Dashboars Logística) as coordenadas cadastradas no Mapa de calor.

    py scripts/planilha_locais.py gravar <coordenadas.json>

coordenadas.json = [{"id": 1, "nome": "POSTO X", "cidade": "JEQUIE", "uf": "BA", "lat": -13.85, "lon": -40.08}, ...]
Quem chama é o vigia (scripts/sincronizar.mjs). Aba "Localização dos postos", alterada direto no XML (só as células
necessárias, como a planilha dos cartões):
  - posto que já está na aba (mesmo NOME ESTABELECIMENTO): troca só LATITUDE (H) e LONGITUDE (I);
  - posto novo: entra na linha depois do último posto com NOME ESTABELECIMENTO (A), CIDADE (D), UF (E), PAIS (F),
    LATITUDE e LONGITUDE, no formato das células da linha de cima;
  - coordenada gravada como as digitadas na planilha: inteiro sem a vírgula decimal (-19883025 = -19,883025);
  - planilha aberta no Excel: não grava e devolve "aguardando"; antes de gravar, guarda uma cópia (as 5 mais recentes).
Para testar numa cópia: PLANILHA_LOCAIS=<caminho>. Saída: uma linha JSON no stdout.
"""
import datetime as dt
import glob
import json
import os
import re
import shutil
import sys
import zipfile

import planilha_cartoes as pc   # leitura do pacote xlsx, textos compartilhados, planilha aberta

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COPIAS = os.path.join(PASTA_PROJETO, '.dados', 'copias-planilha')
GUARDAR_COPIAS = 5
ABA = 'Localização dos postos'
PADRAO = os.path.join(os.path.dirname(PASTA_PROJETO), 'LOCALIZAÇÃO DOS POSTOS.xlsx')


def planilha():
    return os.environ.get('PLANILHA_LOCAIS') or PADRAO


def saida(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + '\n')


def chave(s):
    return ' '.join(str(s or '').upper().split())


def guardar_copia(caminho):
    os.makedirs(COPIAS, exist_ok=True)
    destino = os.path.join(COPIAS, 'locais-' + dt.datetime.now().strftime('%Y%m%d-%H%M%S') + '.xlsx')
    shutil.copy2(caminho, destino)
    for velho in sorted(glob.glob(os.path.join(COPIAS, 'locais-*.xlsx')))[:-GUARDAR_COPIAS]:
        try:
            os.remove(velho)
        except OSError:
            pass
    return destino


def erro_todos(itens, msg, estado='erro'):
    return saida({'itens': [{'id': i['id'], 'estado': estado, 'mensagem': msg} for i in itens]})


def gravar(arquivo_json):
    with open(arquivo_json, encoding='utf-8-sig') as f:
        itens = json.load(f)
    if not itens:
        return saida({'itens': []})
    caminho = planilha()
    if not os.path.isfile(caminho):
        return erro_todos(itens, 'Planilha LOCALIZAÇÃO DOS POSTOS não encontrada.')
    if pc.planilha_aberta(caminho):
        return erro_todos(itens, 'A planilha LOCALIZAÇÃO DOS POSTOS está aberta no Excel. A coordenada será gravada quando ela for fechada.', 'aguardando')
    with zipfile.ZipFile(caminho) as arq:
        try:
            arq_aba = pc.caminho_aba(arq, ABA)
        except ValueError as e:
            return erro_todos(itens, str(e))
        textos, xml_sst = pc.ler_compartilhados(arq)
        xml = arq.read(arq_aba)
        entradas = [(i, arq.read(i.filename)) for i in arq.infolist()]

    dados = pc.ler_aba(xml, textos, {'A', 'H', 'I'})
    cab = dados.get(1, {})
    if chave(cab.get('A')) != 'NOME ESTABELECIMENTO' or chave(cab.get('H')) != 'LATITUDE' or chave(cab.get('I')) != 'LONGITUDE':
        return erro_todos(itens, 'As colunas da aba "Localização dos postos" mudaram (esperado A = NOME ESTABELECIMENTO, H = LATITUDE, I = LONGITUDE). Nada foi gravado.')
    linha_de = {}
    for r, v in sorted(dados.items()):
        if r > 1 and v.get('A') not in (None, ''):
            linha_de.setdefault(chave(v['A']), r)
    ultima = max(linha_de.values()) if linha_de else 1
    sst = pc.Compartilhados(textos, xml_sst)
    ordem = lambda c: (len(c), c)

    def celula(col, r, v, s):
        attr = f' s="{s}"' if s else ''
        if v is None or v == '':
            return f'<c r="{col}{r}"{attr}/>'.encode()
        if isinstance(v, int):
            return f'<c r="{col}{r}"{attr}><v>{v}</v></c>'.encode()
        if isinstance(v, float):
            return f'<c r="{col}{r}"{attr}><v>{repr(round(v, 7))}</v></c>'.encode()
        return f'<c r="{col}{r}"{attr} t="s"><v>{sst(str(v))}</v></c>'.encode()

    def escrever(xml, r, valores):
        pos = pc.achar_linha(xml, r)
        if not pos:
            xml = pc.criar_linha(xml, r, pc.achar_linha(xml, r - 1))
            pos = pc.achar_linha(xml, r)
        ini, fim, tag = pos
        corpo = b'' if tag.endswith(b'/>') else xml[ini + len(tag):fim - len(b'</row>')]
        cels = {m.group(1).decode(): m.group(0) for m in pc.RE_CELULA.finditer(corpo)}
        acima = pc.achar_linha(xml, r - 1)
        est_acima = {m.group(1).decode(): pc.estilo(m.group(0)) for m in pc.RE_CELULA.finditer(xml[acima[0]:acima[1]])} if acima else {}
        for col, v in valores.items():
            cels[col] = celula(col, r, v, pc.estilo(cels.get(col)) or est_acima.get(col))
        abre = tag[:-2] + b'>' if tag.endswith(b'/>') else tag
        return xml[:ini] + abre + b''.join(cels[c] for c in sorted(cels, key=ordem)) + b'</row>' + xml[fim:]

    resultado, mexeu = [], False
    for it in itens:
        nome = chave(it.get('nome'))
        lat, lon = it.get('lat'), it.get('lon')
        if not nome or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            resultado.append({'id': it['id'], 'estado': 'erro', 'mensagem': 'Coordenada ou nome do posto inválido.'})
            continue
        # como as linhas digitadas na planilha: número inteiro sem a vírgula decimal (-19883025 = -19,883025), que o
        # importar_base.py já lê (coordenada()) e que aparece certo no formato das colunas H e I
        h, i = int(round(lat * 1e6)), int(round(lon * 1e6))
        it['_h'], it['_i'] = h, i
        r = linha_de.get(nome)
        if r:
            xml = escrever(xml, r, {'H': h, 'I': i})
        else:
            ultima += 1
            r = ultima
            xml = escrever(xml, r, {'A': nome, 'D': chave(it.get('cidade')) or None, 'E': chave(it.get('uf')) or None,
                                    'F': 'BRASIL', 'H': h, 'I': i})
            linha_de[nome] = r
        resultado.append({'id': it['id'], 'estado': 'aplicada', 'linha': r})
        mexeu = True
    if not mexeu:
        return saida({'itens': resultado})

    # filtro e dimensão da aba passam a cobrir as linhas novas
    def ate(m):
        return m.group(1) + str(max(int(m.group(2)), ultima)).encode()
    xml = re.sub(rb'(<autoFilter ref="[A-Z]+\d+:[A-Z]+)(\d+)', ate, xml, count=1)
    xml = re.sub(rb'(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)', ate, xml, count=1)
    trocas = {arq_aba: xml}
    novo_sst = sst.xml_novo()
    if novo_sst is not None:
        trocas['xl/sharedStrings.xml'] = novo_sst.encode('utf-8')
    copia = guardar_copia(caminho)
    tmp = os.path.join(os.path.dirname(COPIAS), 'gravando-locais.xlsx')
    with zipfile.ZipFile(tmp, 'w') as zout:
        for info, conteudo in entradas:
            zout.writestr(info, trocas.get(info.filename, conteudo), compress_type=info.compress_type)
    # confere: cada linha gravada tem o nome e a coordenada nova
    with zipfile.ZipFile(tmp) as arq:
        conf = pc.ler_aba(arq.read(arq_aba), pc.ler_compartilhados(arq)[0], {'A', 'H', 'I'})
    for it, res in zip(itens, resultado):
        if res['estado'] != 'aplicada':
            continue
        v = conf.get(res['linha'], {})
        if chave(v.get('A')) != chave(it['nome']) or v.get('H') != it['_h'] or v.get('I') != it['_i']:
            os.remove(tmp)
            os.remove(copia)
            return erro_todos(itens, 'A conferência depois de gravar falhou; a planilha LOCALIZAÇÃO não foi alterada.')
    if pc.planilha_aberta(caminho):
        os.remove(tmp)
        return erro_todos(itens, 'A planilha LOCALIZAÇÃO foi aberta no Excel durante a gravação; tenta de novo quando ela for fechada.', 'aguardando')
    try:
        pc.substituir(tmp, caminho, copia)   # confere o arquivo depois de gravar (ownCloud)
    finally:
        os.remove(tmp)
    saida({'itens': resultado, 'copia': copia})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) >= 3 and sys.argv[1] == 'gravar':
        gravar(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
