"""Junta as fábricas dos clientes (scripts/clientes/clientes-*.json) em public/gestao/mapas/clientes.json,
a lista que o roteirizador oferece como origem, destino e parada.

    py scripts/montar_clientes.py

Cada arquivo de entrada é uma lista de {empresa, nome, endereco, cidade, uf, lat, lng, confianca, como, fontes}
(pesquisa feita em 01/10/2026; fontes e o motivo de cada coordenada ficam nos arquivos de entrada).
Conferência: a coordenada tem de cair a até LIMITE_KM da sede do município informado (lista do IBGE em
public/gestao/mapas/municipios.json); o que passar disso fica de fora e é listado na saída.
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importar_base import chave_cidade, distancia_km, MUNICIPIOS   # noqa: E402

PASTA = os.path.dirname(os.path.abspath(__file__))
ENTRADAS = os.path.join(PASTA, 'clientes', 'clientes-*.json')
SAIDA = os.path.join(os.path.dirname(PASTA), 'public', 'gestao', 'mapas', 'clientes.json')
LIMITE_KM = 60          # fábrica fica em distrito industrial, às vezes longe do centro, mas não em outra região
CONFIANCAS = ('alta', 'media', 'baixa')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    with open(MUNICIPIOS, encoding='utf-8') as f:
        sedes = {(chave_cidade(n), uf): (n, lat, lng) for n, uf, lat, lng in json.load(f)}
    saida, fora = [], []
    for arq in sorted(glob.glob(ENTRADAS)):
        with open(arq, encoding='utf-8-sig') as f:
            for c in json.load(f):
                uf = str(c.get('uf') or '').strip().upper()
                sede = sedes.get((chave_cidade(c.get('cidade')), uf))
                try:
                    lat, lng = float(c['lat']), float(c['lng'])
                except (KeyError, TypeError, ValueError):
                    fora.append((c.get('nome'), 'sem coordenada'))
                    continue
                if not sede:
                    fora.append((c.get('nome'), f'município não achado: {c.get("cidade")}/{uf}'))
                    continue
                km = distancia_km(lat, lng, sede[1], sede[2])
                if km > LIMITE_KM:
                    fora.append((c.get('nome'), f'{km:.0f} km da sede de {sede[0]}/{uf}'))
                    continue
                conf = str(c.get('confianca') or 'baixa').lower()
                saida.append({
                    'empresa': c['empresa'], 'nome': ' '.join(str(c['nome']).split()),
                    'cidade': sede[0], 'uf': uf, 'lat': round(lat, 6), 'lng': round(lng, 6),
                    'confianca': conf if conf in CONFIANCAS else 'baixa',
                    'endereco': ' '.join(str(c.get('endereco') or '').split()),
                })
    saida.sort(key=lambda x: (x['empresa'], x['uf'], x['nome']))
    with open(SAIDA, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
    por = {}
    for c in saida:
        por.setdefault(c['empresa'], {k: 0 for k in CONFIANCAS})[c['confianca']] += 1
    print(f'{len(saida)} fábricas gravadas em {os.path.relpath(SAIDA)}')
    for e, n in por.items():
        print(f'  {e}: {sum(n.values())} (alta {n["alta"]}, média {n["media"]}, baixa {n["baixa"]})')
    for nome, motivo in fora:
        print(f'  FORA: {nome} ({motivo})')


if __name__ == '__main__':
    main()
