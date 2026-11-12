# Handoff Spec: Tela de login (tela inicial do site `/`)

Protótipo: `prototipos/login/index.html` (preview "prototipo-login", porta 8791). Login simulado; no portal real o
envio vai para `POST /api/login` (`functions/api/login.js`), que já decide sozinho se é motorista (CPF) ou gestão.
Tokens e componentes seguem o design v2 (`design-system/MASTER.md`).

### Overview
Hoje a página inicial (`/`) é a lista aberta de postos dos motoristas, com um "Entrar" escondido no canto. Os postos
autorizados passam a ficar **dentro do login do motorista**, então a primeira tela vira o login, **um só para todos**:
- **Motorista** (celular, na estrada, às vezes com sinal fraco): entra com o CPF; senha = 6 primeiros números do CPF;
  fica conectado 30 dias. Depois do login vai para a área do motorista (postos da unidade + Minha média).
- **Gestão** (desktop no escritório): entra com usuário e senha; "Manter conectado" por 48 h. Vai para `/gestao/`
  (ou para Trocar senha, se `trocar_senha`).
- **Sem login**: "Falta cartão no caminhão?" continua aberto — hoje ele fica na página pública dos motoristas e não
  pode sumir quando ela virar login.

Nome do site: **Gestão de frotas · RajaLog Transportes** (`<title>`: "Entrar · Gestão de frotas RajaLog";
`manifest.json` `name`/`short_name` e `apple-mobile-web-app-title` precisam acompanhar — hoje são "Raja frota").

### Layout
| Região | Desktop (> 1100 px) | Regra |
|---|---|---|
| Tela | grade 2 colunas `minmax(0,1.15fr) minmax(440px,1fr)`, altura `100dvh`, fundo `--fundo` | sem rolagem no desktop |
| Vitrine (fundo) | camada absoluta com **74 %** da largura (passa por baixo do formulário; a camada do degradê passa 3 px da foto para não sobrar borda); foto `object-fit: cover`, foco `70% 50%` | **sem divisa**: degradê horizontal transparente até 42 % → 55 % em 62 % → 90 % em 82 % → `#161616` sólido em 100 % (igual ao fundo do formulário); degradê de baixo para cima (95 % → 0 % em 60 %) para o texto |
| Assinatura + texto | canto inferior esquerdo, respiro 48 px, 68 % da vitrine (máx. 640 px) | **bloco único**: logo 56 px + "RajaLog Transportes" 34/600 com "GESTÃO DE FROTAS" logo abaixo (16/600, caixa alta, espaçamento .08em, `--verde`) → frase 16 `--texto-2` → 3 etiquetas (Postos autorizados, Média e meta, Painéis da gestão) |
| Lado do formulário | coluna 2, sem fundo próprio (a página já é `--fundo`), respiro 40/48/24 | cartão centralizado; rodapé. Sem marca duplicada no topo (a assinatura já está na foto) |
| Formulário | máx. 380 px, **sem cartão**: sem fundo, borda, sombra nem desfoque | fica direto sobre o fundo; o degradê da foto já deixa a área atrás dele escura o bastante para ler. Título "Entrar" 30/600 (26 no celular) (sem legenda abaixo). Únicos contornos: os campos (necessários para saber onde digitar) |

**Foto**: `caminhao-1200.webp` (1200×2139, 80 KB) e `caminhao-720.webp` (720×1283, 40 KB) via `srcset`
(`sizes="(max-width: 820px) 100vw, 74vw"`), geradas do original de 1536×2738 (2,1 MB). `fetchpriority="low"`.
A foto fica só como vitrine (sem texto essencial dependendo dela) — se não carregar, a tela continua completa.

### Design Tokens Used
| Token | Valor | Uso |
|---|---|---|
| `--lateral` | #121212 | fundo da página e do lado do formulário no celular |
| `--fundo` | #161616 | lado do formulário no desktop |
| `--cartao` / `--cartao-2` | #262626 / #2E2E2E | cartão do login / caixa de ajuda da senha |
| `--texto` / `--texto-2` / `--suave` | #FFF / #D0D0D0 / #9A9A9A | títulos / textos de apoio / notas, rodapé, separador |
| `--contorno` | rgba(255,255,255,.85) | borda dos campos e da caixinha "Manter conectado" |
| `--borda` | #333333 | separador "Está na estrada?" e borda do cartão "Falta cartão" |
| `--verde` / `--sobre-verde` | #41B06E / #0B1A12 | botão Entrar (texto escuro 6,5:1), links, foco, etiqueta "Motorista" |
| `--verde-escuro` | #369A5E | botão Entrar ao passar o mouse (**novo**, entra no MASTER) |
| `--foco` | rgba(65,176,110,.5) | anel de foco 3 px (campos e botões) |
| `--erro` / `--erro-fundo` | #FF5A5A / rgba(249,47,47,.12) | borda do campo inválido, faixa de erro |
| `--alerta` / `--alerta-fundo` | #F6C25E / rgba(246,194,94,.12) | faixa de bloqueio, Caps Lock, ícone do "Falta cartão" |
| `--campo` | 44 px | altura de campos e do botão (alvo de toque da área dos motoristas) |
| `--r` / `--r-pilula` | 5 / 25 px | cantos de cartão/campos / pílulas |
| `--e-1…5` | 5 / 10 / 15 / 20 / 25 px | espaços |
| Tipo | Plus Jakarta Sans | 24/600 título · 16 campos (evita zoom no iPhone) e botão 16/700 · 14/500 rótulos · 13 mensagens · 12 notas |

### Components
| Componente | Variante | Props / atributos | Notas |
|---|---|---|---|
| Campo "CPF ou usuário" | normal / motorista / inválido | `autocomplete="username"`, `autocapitalize="none"`, `spellcheck=false`, `maxlength=64` | ícone de pessoa à esquerda; ao detectar CPF aplica máscara `000.000.000-00`, mostra a pílula **Motorista** no rótulo. A dica "A senha são os 6 primeiros números do seu CPF." **só aparece depois de um erro com CPF** (a regra não fica exposta na tela pública) |
| Campo "Senha" | normal / inválido / visível | `type=password`, `autocomplete="current-password"`, `inputmode` numérico quando for motorista | botão do olho 44 px (`aria-pressed`, rótulo Mostrar/Esconder senha); aviso de Caps Lock |
| Manter conectado | só gestão | checkbox 20 px, rótulo só "Manter conectado" (sem nota de prazo; a sessão continua de 48 h) | escondido para motorista (já fica 30 dias) — o servidor já ignora `manter` para CPF |
| Esqueci a senha | gestão / motorista | `aria-expanded`, `aria-controls` | abre caixa `--cartao-2` com a orientação certa para cada tipo (não há recuperação por e-mail hoje) |
| Faixa de aviso | erro / bloqueio | `role="alert"` | ícone + texto do servidor; bloqueio em âmbar com relógio |
| Botão Entrar | normal / hover / carregando | `type=submit` | carregando: anel girando + "Entrando…", `disabled` |
| "Falta cartão no caminhão?" | — | botão | linha simples sem caixa (ícone âmbar + texto + seta); ao passar o mouse ganha fundo `rgba(255,255,255,.05)` e a seta fica verde; abre o diálogo atual `#dialog-cartao` (mesmo formulário de hoje, sem login) |
| Sucesso | — | `role="status"` | só no protótipo; no portal real redireciona direto |

### States and Interactions
| Elemento | Estado | Comportamento |
|---|---|---|
| Campo usuário | digita só números/ponto/traço (≥ 3 dígitos) | vira modo motorista: máscara de CPF, pílula "Motorista", some "Manter conectado", senha com teclado numérico |
| Campo usuário | digita letras | modo gestão (volta tudo) |
| Campo | foco | borda verde + anel `--foco` 3 px |
| Formulário | enviar vazio | borda vermelha + mensagem abaixo do campo vazio; foco no primeiro vazio; não chama o servidor |
| Botão Entrar | hover | `--verde-escuro` |
| Botão Entrar | enviando | anel girando, "Entrando…", desabilitado (evita duplo envio) |
| Resposta 401 | erro | faixa vermelha "CPF ou senha incorretos." / "Usuário ou senha incorretos." (sem repetir a regra da senha); se for CPF, libera a dica abaixo do campo; formulário treme 300 ms; senha selecionada para redigitar |
| Resposta 429 | bloqueio | faixa âmbar "Muitas tentativas erradas. Tente de novo em N minutos." |
| Resposta 403 (motorista desligado) | erro | faixa vermelha "Seu acesso não está liberado. Fale com a gestão de combustível." |
| Resposta 200 | sucesso | motorista → área do motorista; gestão → `/gestao/` ou Trocar senha |
| Senha | Caps Lock ligado | "Caps Lock está ligado." em âmbar abaixo do campo |
| Olho | clique | alterna texto/senha, troca ícone e rótulo, devolve o foco à senha |
| Qualquer campo | volta a digitar | limpa a faixa de erro e a marcação do campo |

### Responsive Behavior
| Largura | Mudanças |
|---|---|
| > 1100 px | foto em 74 % se dissolvendo no formulário; assinatura com frase e 3 etiquetas |
| 820–1100 px | colunas `.9fr / 1fr`, foto em 70 % (a cabine passa atrás do cartão translúcido); logo 44, título 28, nome 14; sem etiquetas; respiro 32 |
| < 820 px | uma coluna: foto vira faixa de 280 px no topo (foco `80% 60%`, cabine) que **se dissolve para baixo** até `--lateral` sólido; assinatura logo 40 + título 24 + nome 14; faixa da foto 250 px; "Entrar" 22 px (menor que a marca); **texto mínimo 14 px** (separador, rodapé, dicas, mensagens); formulário sobe 28 px sobre o fim do degradê, sem caixa; respiro 16; rodapé centralizado |

Motivo: no celular o motorista precisa ver o formulário sem rolar — a foto só identifica a empresa.

### Edge Cases
- **Foto não carrega / conexão lenta**: fundo `#0d0d0d` com o texto da vitrine; formulário independente da foto.
  A foto tem 40–80 KB (webp, `srcset`); `fetchpriority="low"` para não atrasar o formulário.
- **Fonte não carrega**: cai para `system-ui`; nada depende da largura exata do texto.
- **CPF colado com pontuação ou espaços**: a máscara reformata; o servidor já aceita (`soNumeros`).
- **CPF com mais de 11 dígitos**: a máscara corta em 11.
- **Usuário da gestão só com números**: seria tratado como CPF (mesma regra do servidor, `pareceCpf`). Manter
  usuários da gestão com letras.
- **Sessão ainda válida**: ao abrir `/` já logado, pular o login e ir direto para a área certa.
- **Texto longo**: mensagens do servidor quebram linha dentro da faixa; nunca cortadas.
- **Sem JavaScript**: o formulário ainda envia (`method=post` no portal real) e o servidor responde.

### Animation / Motion
| Elemento | Gatilho | Animação | Duração | Easing |
|---|---|---|---|---|
| Faixa de erro/bloqueio | aparece | sobe 6 px + aparece | 220 ms | cubic-bezier(.2,.8,.2,1) |
| Formulário | senha errada | treme ±4 px | 300 ms | ease |
| Botão Entrar | enviando | anel gira | 700 ms (contínuo) | linear |
| Campo | foco | borda e anel | 150 ms | ease |

`prefers-reduced-motion` desliga tudo.

### Accessibility Notes
- Ordem do foco: CPF ou usuário → senha → olho → Manter conectado → Esqueci a senha → Entrar → Falta cartão.
- Faixa de aviso `role="alert"` (lida na hora); Caps Lock `aria-live="polite"`.
- Campos com `aria-describedby` apontando para a mensagem de erro e a dica (lidas junto com o campo).
- Olho: `aria-pressed` + rótulo que muda (Mostrar/Esconder senha). Esqueci a senha: `aria-expanded`/`aria-controls`.
- Pílula "Motorista" é texto, não só cor; erro tem ícone + texto + borda.
- Contraste: texto do botão `--sobre-verde` sobre `--verde` 6,5:1; `--texto-2` sobre `--cartao` > 9:1.
- Alvos ≥ 44 px (botão, campos, olho, links do formulário).
- `color-scheme: dark` declarado (CSS e meta), como nas páginas dos motoristas.

### Implementação no portal (o que muda)
1. `public/index.html`: a tela atual (lista pública de postos) sai; entra este login. Reaproveitar o diálogo
   `#dialog-cartao` e o envio do `app.js` para "Falta cartão".
2. Lista de postos e unidades: passa para a área do motorista (`/motorista/`), exigindo a sessão de motorista;
   a API dos postos passa a pedir login (hoje é pública).
3. `functions/api/login.js`: sem mudança de regra; só conferir o redirecionamento (`motorista: true` → `/motorista/`).
4. `manifest.json` e títulos: "Gestão de frotas RajaLog".
5. Instalar no celular (faixa "Instale no celular"): mostrar só depois do login do motorista.
6. Registrar o `--verde-escuro` e esta tela no `design-system/MASTER.md`; atualizar o `briefing.md`.

### Revisão (crítica de design, 03/11/2026)
- Celular: texto mínimo 14 px, como manda o MASTER.md para a área dos motoristas.
- Dica da senha do motorista só depois de um erro com CPF; a mensagem de erro não repete a regra.
- Celular: "Entrar" 22 px e marca mais perto do formulário (faixa da foto 250 px).
- Exemplo dentro do campo em #8A8A8A (5,3:1 sobre o fundo; antes #6F6F6F, 3,6:1).

### Revisão de posição (crítica de design, 03/11/2026)
- **820–1100 px**: a foto ocupa `min(57%, 100% - 440px)` e escurece por completo antes de onde os campos começam
  (degradê transparente até 55% → 60% em 78% → 92% em 92% → sólido). Em 1024 px o caminhão fica inteiro à esquerda
  e só os últimos 19 px da foto (já ~pretos) encostam no formulário — antes eram 152 px com a cabine atrás dos campos.
- **Rodapé**: centralizado embaixo do formulário, com a mesma largura (380 px; 420 px em telas grandes), em duas
  linhas — "© 2026 RajaLog Transportes" e "Problemas para entrar? Fale com a gestão de combustível."
- **≥ 1600 px**: formulário e rodapé com 420 px, "Entrar" 34 px.
- Medido: 1024×768, 1366×768 (cabe sem rolar), 1920×1080 e 375×812.

### Escala 80% no computador (03/11/2026)
- A partir de 821 px, o formulário, o rodapé e o texto da foto usam `zoom: .8` (escala escolhida pelo usuário no zoom
  do navegador). A foto, o degradê e a grade continuam em 100%, e os pontos de quebra seguem a largura real da tela.
- Medidas efetivas: formulário 304 px (1366 px) e 336 px (≥ 1600 px); campos e botão 35 px; título 24/27 px.
- Celular (< 821 px) continua em 100%: botão 44 px e texto mínimo 14 px dos motoristas.
- Tablet de toque entre 821 e 1100 px fica com alvos de 35 px — se o portal for usado em tablet, rever.
- Fonte do site inteiro: **Plus Jakarta Sans** (400–800, Google Fonts), via `--fonte`; monoespaçada só em campos de código.

### Foto e logo como parte do visual (09/11/2026)
- A foto do caminhão e a logo da vitrine não abrem o menu "Copiar/Salvar imagem": `pointer-events: none`,
  `user-select: none`, `-webkit-user-drag: none`, `-webkit-touch-callout: none` (celular) e `draggable="false"`.
  O clique direito (ou o dedo pressionado) cai na própria página. Isso evita o aspecto de "foto solta", mas não
  impede quem quiser baixar a imagem pelas ferramentas do navegador — nenhum site consegue impedir isso.
