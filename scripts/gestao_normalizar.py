"""Regras de normalização do modelo novo (schema `gestao` no Supabase), usadas por scripts/gestao_carga.py.

As planilhas escrevem a mesma coisa de jeitos diferentes (JEQUIÉ / JEQUIE / RAJA JEQUIE; "DIESEL S-10 COMUM" / "Arla 32" /
"arla 32"; "Cartao Fisico" = Ticket). Aqui fica a tradução para os cadastros únicos. Tudo é função pura: testado em
tests/py/test_gestao_normalizar.py.
"""
import re
import unicodedata

PLACA_RE = re.compile(r'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')   # antiga (ABC1234) e Mercosul (ABC1D23)


def chave(texto):
    """Texto para comparar: sem acento, maiúsculo, espaços simples. None/'' -> ''."""
    if texto is None:
        return ''
    s = unicodedata.normalize('NFKD', str(texto)).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'\s+', ' ', s).strip().upper()


def placa(texto):
    """Placa sem traço/espaço, maiúscula. Devolve (placa, valida)."""
    p = re.sub(r'[\s\-]', '', str(texto or '')).upper()
    return p, bool(PLACA_RE.match(p))


# ---------------- unidades ----------------
# nome curto (orçamento, negociações, contratos) -> unidade do centro de custo (INFORMAÇÃO ADICIONAL 3 da Base)
UNIDADE_CURTA = {
    'BELEM': 'RAJA LOG BELEM', 'CONQUISTA': 'RAJA VITORIA DA CONQUISTA', 'VITORIA DA CONQUISTA': 'RAJA VITORIA DA CONQUISTA',
    'GRANEL': 'RAJA LOG GRANEL', 'ILHEUS': 'RAJA LOG ILHEUS', 'JEQUIE': 'RAJA JEQUIE', 'MARANHAO': 'RAJA MARANHAO',
    'SAO LUIS': 'RAJA MARANHAO', 'RECIFE': 'RAJA RECIFE', 'SALVADOR': 'RAJA SALVADOR', 'SERRA': 'RAJA SERRA',
    'TEIXEIRA': 'RAJA LOG TEIXEIRA DE FREITAS', 'TEIXEIRA DE FREITAS': 'RAJA LOG TEIXEIRA DE FREITAS',
    'VALADARES': 'RAJA GOVERNADOR VALADARES', 'GOVERNADOR VALADARES': 'RAJA GOVERNADOR VALADARES', 'GOIANIA': 'RAJA GOIANIA',
    # RAJA SÃO PAULO é a mesma unidade que o Granel (usuário, 17/11/2026)
    'SAO PAULO': 'RAJA LOG GRANEL', 'RAJA SAO PAULO': 'RAJA LOG GRANEL', 'RAJA LOG SAO PAULO': 'RAJA LOG GRANEL', 'ADM': 'RAJA ADM',
    'NANUQUE': 'KEMIGAS NANUQUE',
}
# o que aparece no campo de unidade mas não é unidade (situação do veículo)
NAO_E_UNIDADE = {'VENDA', ''}


def unidade(texto):
    """Nome da unidade (chave do cadastro `gestao.unidades.nome`) ou None. Ex.: 'Jequié' -> 'RAJA JEQUIE'."""
    k = chave(texto)
    if k in NAO_E_UNIDADE:
        return None
    if k in UNIDADE_CURTA:
        return UNIDADE_CURTA[k]
    if k.startswith('GRANEL - '):          # contratos: "GRANEL - BETIM" = praça do Granel
        return 'RAJA LOG GRANEL'
    return k


def empresa_da_unidade(nome):
    """RAJA LOG / KEMIGAS pelo nome da unidade (KEMIGAS GV, KEMIGAS NANUQUE...); o resto é Raja."""
    return 'KEMIGAS' if chave(nome).startswith('KEMIGAS') else 'RAJA LOG'


# ---------------- combustíveis ----------------
COMBUSTIVEIS = {   # nome no cadastro -> grupo
    'DIESEL S10': 'diesel', 'DIESEL S10 ADITIVADO': 'diesel', 'DIESEL COMUM': 'diesel', 'ARLA 32': 'arla',
    'GASOLINA COMUM': 'gasolina', 'GASOLINA ADITIVADA': 'gasolina', 'ETANOL': 'etanol', 'GNV': 'gnv',
}


def combustivel(texto):
    """Nome do combustível no cadastro. 'DIESEL S-10 COMUM' -> 'DIESEL S10'; 'arla 32' -> 'ARLA 32'."""
    k = chave(texto).replace('-', '')
    if not k:
        return None
    if 'ARLA' in k:
        return 'ARLA 32'
    if 'S10' in k or 'S 10' in k:
        return 'DIESEL S10 ADITIVADO' if 'ADITIV' in k else 'DIESEL S10'
    if 'DIESEL' in k:
        return 'DIESEL COMUM'           # "DIESEL" sem especificação (S500) nas transações antigas
    if 'GASOLINA' in k:
        return 'GASOLINA ADITIVADA' if 'ADITIV' in k else 'GASOLINA COMUM'
    if 'ETANOL' in k or 'ALCOOL' in k:
        return 'ETANOL'
    if 'GAS NATURAL' in k or k == 'GNV':
        return 'GNV'
    return k


# ---------------- origem do abastecimento ----------------
def emissora(forma_pagamento, tipo_estabelecimento=None):
    """De onde veio o abastecimento: ticket, truckpag, veloe, vibra, bomba (bomba interna) ou manual."""
    k = chave(forma_pagamento)
    if k in ('CARTAO FISICO', 'TICKET', 'TICKETLOG', 'TICKET LOG'):
        return 'ticket'
    if k == 'TRUCKPAG':
        return 'truckpag'
    if k in ('VELOE', 'VELOEGO', 'VELOE GO'):
        return 'veloe'
    if k == 'VIBRA':
        return 'vibra'
    t = chave(tipo_estabelecimento)
    if 'INTERNO' in t:
        return 'bomba'
    if 'CAIS' in t:
        return 'vibra'
    return 'manual'


def tipo_posto(tipo_estabelecimento, nome=''):
    t, n = chave(tipo_estabelecimento), chave(nome)
    if 'CAIS' in t:
        return 'cais'
    if 'INTERNO' in t or n.startswith('POSTO INT ') or n.startswith('BOMBA INTERNA'):
        return 'interno'
    return 'externo'


# ---------------- situações ----------------
def situacao_cartao(texto):
    k = chave(texto)
    return {'ATIVO': 'ativo', 'PERDIDO': 'perdido', 'AGUARDANDO ENVIO': 'aguardando envio',
            'ENVIO PARA BASE': 'envio para base', 'CANCELADO': 'cancelado', 'BLOQUEADO': 'bloqueado'}.get(k, 'outro' if k else None)


def situacao_veiculo(situacao, unidade_txt=None, categoria=None):
    """ativo / desabilitado / vendido. VENDA na unidade ou na categoria = vendido."""
    if 'VENDA' in (chave(unidade_txt), chave(categoria)) or chave(situacao) in ('VENDIDO', 'VENDIDA'):
        return 'vendido'
    return 'desabilitado' if chave(situacao) == 'DESABILITADA' else 'ativo'


def sim_nao(texto):
    k = chave(texto)
    if k in ('SIM', 'S', 'TRUE', '1'):
        return True
    if k in ('NAO', 'N', 'FALSE', '0'):
        return False
    return None


UF_DE_ESTADO = {
    'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF',
    'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO', 'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
    'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
    'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RORAIMA': 'RR',
    'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO',
}


def uf(estado):
    k = chave(estado)
    return k if len(k) == 2 else UF_DE_ESTADO.get(k)


def cidade_uf(texto):
    """'TAILANDIA - PA' -> ('TAILANDIA', 'PA'); 'BOM JESUS DA LAPA' -> ('BOM JESUS DA LAPA', None)."""
    k = chave(texto)
    m = re.match(r'^(.*?)\s*[-/]\s*([A-Z]{2})$', k)
    return (m.group(1), m.group(2)) if m else (k or None, None)


# ---------------- lançamentos sem placa ----------------
# o que vem no campo da placa e é desperdício de combustível (usuário, 17/11/2026). FAZENDA, CARRO ALUGADO e outros textos
# NÃO são desperdício: continuam como abastecimento (sem veículo), com o texto na descrição
DESPERDICIOS = ('VAZAMENTO', 'LAVAGEM', 'LIMPEZA NO TANQUE', 'LIMPEZA DO TANQUE', 'PRIMEIRO ABASTECIMENTO DO TANQUE')


def tipo_lancamento(texto_placa):
    """('abastecimento' | 'desperdicio', descrição ou None) pelo que veio no campo da placa."""
    p, ok = placa(texto_placa)
    if ok:
        return 'abastecimento', None
    k = chave(texto_placa)
    return ('desperdicio' if any(k.startswith(d) for d in DESPERDICIOS) else 'abastecimento'), (k or None)
