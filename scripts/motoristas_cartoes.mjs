// Cadastro de motoristas integrado aos cartões (Ticket Log e TruckPag). Chamado pelo vigia junto com as APIs dos cartões
// (só no computador que tem as credenciais).
//  1) completar(): para os motoristas da planilha Controle_motoristas_e_placas, preenche o que estiver VAZIO com o que a
//     Ticket devolve (código do motorista no cliente Raja Log, matrícula, CNH, categoria e validade). Nunca troca o que
//     já está preenchido. Consulta até 25 motoristas por vez e cada um no máximo a cada 7 dias.
//  2) criarNovos(): motorista ADICIONADO pelo portal é cadastrado na Ticket (cliente 245364, decisão do usuário) e na
//     TruckPag. DESLIGADO até o teste com um motorista real: só roda com "criar": true em
//     %LOCALAPPDATA%\GestaoCombustivel\motoristas-cartoes.json.
//  3) editarTruckpag(): edição feita no portal (nome, CPF, senha TruckPag, data de nascimento) é repetida na TruckPag pelo
//     ID TruckPag do cadastro. Liga com "editar": true no mesmo arquivo. A TruckPag exige a data de nascimento em toda
//     edição: sem ela no cadastro, vai a que a TruckPag já tem (da exportação "Motoristas", importar_ids_truckpag.mjs).
//     Situação (DESLIGADO etc.) não vai: o código de "inativo" da TruckPag não está na documentação.
//     Na Ticket ("editarTicket": true): PUT do motorista pelo código Ticket com tudo o que o cadastro tem (nome, CPF,
//     matrícula, CNH, data de nascimento) e, se a senha Ticket mudou, a troca de senha (endereço próprio).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'apis-cartoes.json');
const CHAVE_CRIAR = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'motoristas-cartoes.json');
const ESTADO = path.join(PROJETO, '.dados', 'cartoes-api', 'motoristas-consulta.json');   // hash do CPF -> última consulta / criação
// fora do ownCloud (dados pessoais): datas de nascimento que a TruckPag tem e o andamento das edições
export const DATAS_TRUCKPAG = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'datas-nascimento-truckpag.json');
const ESTADO_EDICAO = path.join(process.env.LOCALAPPDATA || '', 'GestaoCombustivel', 'motoristas-edicao-truckpag.json');
// tipo de senha na Ticket: IU = informada pelo usuário (o gestor define a senha). IE = impressa em envelope (exige o código de
// controle do envelope: INFORME_CODIGO_CONTROLE_ENVELOPE); IM = informada pelo motorista. Valores achados em 06/11/2026.
const TIPO_SENHA = 'IU';
const CLIENTE_TICKET = 245364;      // RAJA LOG - FILIAIS: o único em que o portal cadastra (decisão do usuário)
const EMPRESA_TRUCKPAG = 25298;     // empresa_id da Raja Log na TruckPag (lido de /veiculo)
const POR_VEZ = 25, DIAS_REPETIR = 7;
const lerJson = (a, p) => { try { return JSON.parse(fs.readFileSync(a, 'utf8')); } catch { return p; } };
export const hash = (cpf) => crypto.createHash('sha256').update('motorista:' + cpf).digest('hex').slice(0, 24);   // o CPF não fica no disco
const so = (v) => String(v ?? '').replace(/\D/g, '');
// motorista de teste (área do motorista): nunca vai para a Ticket nem para a TruckPag (criar, editar ou completar)
const CPFS_TESTE = new Set(['11144477735']);
export const ehTeste = (m) => CPFS_TESTE.has(so(m && m.cpf)) || /^(MOTORISTA\s+)?(TESTE|FANTASMA)\b/i.test(String((m && m.nome) || '').trim());
const p2 = (x) => String(x).padStart(2, '0');
const isoDia = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const brDeIso = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : null; };
const isoDeBr = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };

// a Ticket só aceita data com hora ("yyyy-MM-dd'T'HH:mm:ss"); nascimento sem data no cadastro: a que a TruckPag tem
// semValidade: no cadastro novo a Ticket recusa com a validade da CNH ("Falha ao gerar offset ... TYPE_PINPAD", 06/11/2026);
// sem ela o cadastro passa (a restrição de vencimento fica a padrão da Ticket)
function corpoTicket(m, { semValidade = false } = {}) {
  const nasc = isoDeBr(m.dataNascimento) || lerJson(DATAS_TRUCKPAG, {})[hash(so(m.cpf))];
  return { codigoCliente: CLIENTE_TICKET, codigoProduto: 4, nomeMotorista: m.nome, cpf: so(m.cpf), descricaoResponsavel: 'GESTOR FROTA',   // Gestor responsável: fixo (decisão do usuário)
   
    ...(nasc ? { dataNascimento: nasc + 'T00:00:00' } : {}), ...(m.matricula ? { numeroMatricula: Number(m.matricula) } : {}),
    ...(m.cnh ? { numeroCarteiraMotorista: String(m.cnh) } : {}), ...(m.cnhCategoria ? { categoriaCarteiraMotorista: m.cnhCategoria } : {}),
    ...(m.cnhValidade && !semValidade ? { dataVencimentoCarteira: isoDeBr(m.cnhValidade) + 'T00:00:00' } : {}) };
}

function ticket() {
  const c = lerJson(CONFIG, {}).ticket;
  const H = { Authorization: 'Basic ' + c.basic, 'Content-Type': 'application/json', Accept: 'application/json' };
  const chamar = async (metodo, rota, corpo) => {
    const r = await fetch(c.host + rota, { method: metodo, headers: H, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(60_000) });
    return r.json().catch(() => ({ sucesso: false, mensagem: 'HTTP ' + r.status }));
  };
  return {
    async codigo(cpf) {   // código do motorista no cliente Raja Log (null se não existe)
      const j = await chamar('GET', `/ticketlog-servicos/ebs/motorista/${CLIENTE_TICKET}/4/${cpf}`);
      return j.sucesso && j.informacoes && j.informacoes[0] ? j.informacoes[0].codigo : null;
    },
    async detalhes(codigo) {   // matrícula e CNH da transação mais recente (janela de 32 dias, até ~3 meses atrás)
      for (let k = 0; k < 3; k++) {
        const fim = new Date(Date.now() - k * 32 * 864e5), ini = new Date(fim.getTime() - 31 * 864e5);
        const j = await chamar('POST', '/ticketlog-servicos/ebs/transacaoMotorista/search', { codigoCliente: CLIENTE_TICKET, codigoTipoCartao: 4, codigoProduto: 4,
          codigoMotorista: codigo, considerarTransacao: 'T', ordem: 'T', dataTransacaoInicial: isoDia(ini) + 'T00:00:00', dataTransacaoFinal: isoDia(fim) + 'T23:59:59' });
        const ls = (j.listaTransacoesPorMotorista || []).sort((a, b) => String(b.dataTransacao).localeCompare(String(a.dataTransacao)));
        if (ls.length) return ls[0];
      }
      return null;
    },
    async alterar(codigo, m) {   // a alteração substitui o cadastro: vai tudo o que o portal sabe do motorista
      return chamar('PUT', '/ticketlog-servicos/ebs/motorista/' + codigo + '?version=new', corpoTicket(m));
    },
    async senha(codigo, senha) {
      return chamar('PUT', '/ticketlog-servicos/ebs/motorista/' + codigo + '/senha?version=new', { codigoCliente: CLIENTE_TICKET, codigoProduto: 4, tipoSenha: TIPO_SENHA, senha: String(senha) });
    },
    async criar(m) {
      return chamar('POST', '/ticketlog-servicos/ebs/motorista?version=new', { ...corpoTicket(m, { semValidade: true }), tipoSenha: TIPO_SENHA, senha: String(m.senhaTicket) });
    },
  };
}

// cria (sem id) ou atualiza (com id) o motorista na TruckPag
async function truckpag(m, { id, dataIso } = {}) {
  if (!/^\d{1,4}$/.test(String(m.senhaTruckpag ?? ''))) return { erro: 'senha TruckPag inválida (precisa ter de 1 a 4 números)' };   // nunca manda senha vazia
  const c = lerJson(CONFIG, {}).truckpag;
  const host = c.hosts.find((h) => /prd/.test(h)) || c.hosts[0];
  const r = await fetch(host + '/api/integracao-clientes/motorista' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ empresa_id: EMPRESA_TRUCKPAG, nome: m.nome, motorista_senha: Number(m.senhaTruckpag), cpf: so(m.cpf),   // a TruckPag exige número inteiro (texto é recusado)
      motorista_data_nascimento: dataIso || isoDeBr(m.dataNascimento), status_id: 1 }) });
  const j = await r.json().catch(() => ({}));
  if (id && r.status >= 200 && r.status < 300) return { id };
  if (r.status === 201 && j.data && j.data.id) return { id: j.data.id };
  const erros = j.errors ? Object.values(j.errors).flat().join(' ') : j.message || 'HTTP ' + r.status;
  return { erro: erros.slice(0, 300) };
}

// lista dos motoristas da planilha (com CPF): o mesmo arquivo do Cadastro, apagado logo depois de ler
function motoristasDaPlanilha() {
  const r = spawnSync('py', ['scripts/planilha_cadastros.py', 'gerar'], { cwd: PROJETO, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 5 * 60 * 1000 });
  const arq = path.join(PROJETO, '.dados', 'cadastros.json');
  try {
    if (r.status !== 0) throw new Error('planilha_cadastros.py gerar falhou');
    return JSON.parse(fs.readFileSync(arq, 'utf8')).motoristas || [];
  } finally { try { fs.unlinkSync(arq); } catch {} }
}

export async function completar({ api, log }) {
  if (!fs.existsSync(CONFIG)) return;
  const estado = lerJson(ESTADO, {});
  const agora = Date.now();
  const faltam = (m) => ['codigoTicket', 'matricula', 'cnh', 'cnhCategoria', 'cnhValidade'].filter((k) => m[k] === null || m[k] === undefined || m[k] === '');
  const fila = motoristasDaPlanilha().filter((m) => !ehTeste(m) && so(m.cpf).length === 11 && m.situacao !== 'DESLIGADO' && faltam(m).length)
    .filter((m) => !((estado[hash(so(m.cpf))] || {}).consultado > agora - DIAS_REPETIR * 864e5)).slice(0, POR_VEZ);
  if (!fila.length) return;
  const T = ticket(), itens = [];
  for (const m of fila) {
    const cpf = so(m.cpf), falta = faltam(m), dados = {};
    try {
      const codigo = m.codigoTicket || (await T.codigo(cpf));
      if (codigo && !m.codigoTicket) dados.codigoTicket = Number(codigo);
      if (codigo && falta.some((k) => k !== 'codigoTicket')) {
        const t = await T.detalhes(Number(codigo));
        if (t) {
          if (falta.includes('matricula') && Number(t.numeroMatricula) > 0) dados.matricula = Number(t.numeroMatricula);
          if (falta.includes('cnh') && t.numeroCarteiraMorotista) dados.cnh = String(t.numeroCarteiraMorotista).trim().slice(0, 20);
          if (falta.includes('cnhCategoria') && /^[A-E]{1,2}$/i.test(String(t.categoriaCarteira || '').trim())) dados.cnhCategoria = String(t.categoriaCarteira).trim().toUpperCase();
          if (falta.includes('cnhValidade') && brDeIso(t.dataVencimentoCarteira)) dados.cnhValidade = brDeIso(t.dataVencimentoCarteira);
        }
      }
      estado[hash(cpf)] = { ...(estado[hash(cpf)] || {}), consultado: agora };
      if (Object.keys(dados).length) itens.push({ cpf, dados });
    } catch (e) { log('Cadastro x cartões: Ticket não respondeu (' + String(e.message || e).slice(0, 120) + '); tenta na próxima.'); break; }
  }
  if (itens.length) {
    const j = await api('POST', '/api/sync/cadastros/cartoes', { itens });
    log(`Cadastro x cartões: ${j.inseridos} motorista(s) completado(s) com dados da Ticket (de ${fila.length} consultados).`);
  }
  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify(estado));
}

export async function criarNovos({ api, log }) {
  if (!fs.existsSync(CONFIG) || !lerJson(CHAVE_CRIAR, {}).criar) return;   // desligado até o teste com um motorista real
  const estado = lerJson(ESTADO, {});
  const { motoristas } = await api('GET', '/api/sync/cadastros/novos-motoristas');
  const pendentes = motoristas.map((x) => x.dados).filter((m) => {
    if (ehTeste(m)) return false;   // motorista de teste: não vai para os cartões
    const cpf = so(m.cpf), e = estado[hash(cpf)] || {};
    return cpf.length === 11 && !(e.ticket && e.truckpag);
  });
  if (!pendentes.length) return;
  // Gravada na planilha, a fila do portal fica com as senhas mascaradas ("••••", functions/api/sync/cadastros/resultado.js):
  // as senhas e o resto vêm da planilha, pelo CPF. Em 10/11/2026 a fila mascarada fez a Ticket recusar (ORA-06502) e a
  // TruckPag criar o motorista com a senha vazia.
  const daPlanilha = new Map(motoristasDaPlanilha().map((p) => [so(p.cpf), p]));
  const T = ticket(), itens = [];
  for (const fila of pendentes) {
    const cpf = so(fila.cpf), h = hash(cpf), e = estado[h] || {};
    const p = daPlanilha.get(cpf);
    if (!p) { log(`Cadastro x cartões: ${fila.nome} ainda não está na lista da planilha; tenta na próxima.`); continue; }
    const m = { ...fila, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
    const senhaTicketOk = /^\d{4,6}$/.test(String(m.senhaTicket ?? '')), senhaTruckpagOk = /^\d{1,4}$/.test(String(m.senhaTruckpag ?? ''));
    if (!e.ticket && !senhaTicketOk) log(`Cadastro x cartões: ${m.nome} sem senha Ticket válida na planilha (só números); não foi para a Ticket.`);
    if (!e.truckpag && !senhaTruckpagOk) log(`Cadastro x cartões: ${m.nome} sem senha TruckPag válida na planilha (1 a 4 números); não foi para a TruckPag.`);
    const dados = {};
    if (!e.ticket && senhaTicketOk) {
      const ja = await T.codigo(cpf);
      const r = ja ? { sucesso: true, codigoEntidade: ja } : await T.criar(m);
      if (r.sucesso && r.codigoEntidade) { dados.codigoTicket = Number(r.codigoEntidade); e.ticket = ja ? 'já existia' : 'criado'; }
      else log(`Cadastro x cartões: Ticket não cadastrou ${m.nome}: ${String(r.mensagem || r.codigoErro || '').slice(0, 200)}`);
    }
    if (!e.truckpag && senhaTruckpagOk) {
      const r = await truckpag(m);
      if (r.id) { dados.idTruckpag = Number(r.id); e.truckpag = 'criado'; }
      else { log(`Cadastro x cartões: TruckPag não cadastrou ${m.nome}: ${r.erro}`); if (/cpf/i.test(r.erro) && /utiliz|existe|cadastr/i.test(r.erro)) e.truckpag = 'já existia'; }
    }
    estado[h] = e;
    if (Object.keys(dados).length) { itens.push({ cpf, dados }); log(`Cadastro x cartões: ${m.nome} -> Ticket ${e.ticket || 'pendente'}, TruckPag ${e.truckpag || 'pendente'}.`); }
  }
  if (itens.length) await api('POST', '/api/sync/cadastros/cartoes', { itens });
  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify(estado));
}
export async function editarTruckpag({ api, log }) {
  const chaves = lerJson(CHAVE_CRIAR, {});
  if (!fs.existsSync(CONFIG) || (!chaves.editar && !chaves.editarTicket)) return;
  const T = ticket();
  const est = lerJson(ESTADO_EDICAO, {});
  if (!est.desde) {   // primeira vez ligado: vale só para edições daqui em diante
    fs.writeFileSync(ESTADO_EDICAO, JSON.stringify({ desde: new Date().toISOString().slice(0, 19) + 'Z' }));
    return;
  }
  const { edicoes } = await api('GET', '/api/sync/cadastros/editados-motoristas?desde=' + encodeURIComponent(est.desde));
  if (!edicoes.length) return;
  const RELEVANTES = ['nome', 'cpf', 'senhaTruckpag', 'dataNascimento'];
  const DA_TICKET = ['nome', 'cpf', 'dataNascimento', 'matricula', 'cnh', 'cnhCategoria', 'cnhValidade', 'senhaTicket'];
  const lista = edicoes.some((e) => RELEVANTES.concat(DA_TICKET).some((k) => k in e.dados)) ? motoristasDaPlanilha() : [];
  const datas = lerJson(DATAS_TRUCKPAG, {});
  for (const e of edicoes) {
    if (ehTeste({ cpf: e.dados.cpf || e.chave, nome: e.dados.nome }) || CPFS_TESTE.has(so(e.chave))) { est.desde = e.aplicada_em; fs.writeFileSync(ESTADO_EDICAO, JSON.stringify(est)); continue; }
    if (chaves.editarTicket && DA_TICKET.some((k) => k in e.dados)) {
      const cpf = so(e.dados.cpf || e.chave), m = lista.find((x) => so(x.cpf) === cpf);
      const codigo = m && (m.codigoTicket || (await T.codigo(so(e.chave))) || (await T.codigo(cpf)));
      if (!m || !codigo) log(`Cadastro x cartões: edição de ${m ? m.nome : 'motorista'} não foi para a Ticket (motorista não encontrado no cliente Raja Log).`);
      else {
        const campos = Object.keys(e.dados).filter((k) => DA_TICKET.includes(k) && k !== 'senhaTicket');
        if (campos.length) {
          const r = await T.alterar(Number(codigo), m);
          log(r.sucesso ? `Cadastro x cartões: ${m.nome} atualizado na Ticket (${campos.join(', ')}).`
            : `Cadastro x cartões: Ticket não aceitou a edição de ${m.nome}: ${String(r.mensagem || r.codigoErro || '').slice(0, 250)}`);
        }
        if ('senhaTicket' in e.dados && m.senhaTicket) {
          const r = await T.senha(Number(codigo), m.senhaTicket);
          log(r.sucesso ? `Cadastro x cartões: senha Ticket de ${m.nome} trocada.` : `Cadastro x cartões: Ticket não trocou a senha de ${m.nome}: ${String(r.mensagem || r.codigoErro || '').slice(0, 250)}`);
        }
      }
    }
    if (chaves.editar && RELEVANTES.some((k) => k in e.dados)) {
      const cpf = so(e.dados.cpf || e.chave), antigo = so(e.chave);
      const m = lista.find((x) => so(x.cpf) === cpf);
      const dataIso = (m && isoDeBr(m.dataNascimento)) || datas[hash(cpf)] || datas[hash(antigo)];
      if (!m || !m.idTruckpag) log(`Cadastro x cartões: edição de ${m ? m.nome : 'motorista'} não foi para a TruckPag (sem ID TruckPag no cadastro).`);
      else if (!/^\d{1,4}$/.test(String(m.senhaTruckpag || ''))) log(`Cadastro x cartões: edição de ${m.nome} não foi para a TruckPag (a senha TruckPag do cadastro precisa ter de 1 a 4 números).`);
      else if (!dataIso) log(`Cadastro x cartões: edição de ${m.nome} não foi para a TruckPag (sem data de nascimento; preencha no cadastro).`);
      else {
        const r = await truckpag(m, { id: Number(m.idTruckpag), dataIso });
        log(r.id ? `Cadastro x cartões: ${m.nome} atualizado na TruckPag (${Object.keys(e.dados).filter((k) => RELEVANTES.includes(k)).join(', ')}).`
          : `Cadastro x cartões: TruckPag não aceitou a edição de ${m.nome}: ${r.erro}`);
      }
    }
    est.desde = e.aplicada_em;   // processada (deu certo ou não): não repete
    fs.writeFileSync(ESTADO_EDICAO, JSON.stringify(est));
  }
}
