# Handoff Spec: Tela de login v2 (tela inicial do site `/`)

Protótipo: `prototipos/login-v2/index.html` (preview "prototipo-login-v2", porta 8792). Substitui a proposta anterior
(`prototipos/login/`, mantida só para comparação). Login simulado; no portal real o envio vai para `POST /api/login`
(`functions/api/login.js`).

**Base do layout:** Figma "Login Page Perfect UI (Freebie)", arquivo `UahfOdeMpGpP5V6sc8BW8n`, página "🦄 Freebie",
frames `Sign-In-Form-Desktop-Layout-1440x900` (401:3987) e `Sign-In-Form-Mobile-Layout-375x812` (401:3762).
**Identidade:** Grupo Miranda Coelho, como no portal desde 18/11/2026 (`design-system/MASTER.md`) — escuro, **laranja #F6A42B** com texto escuro em cima (8,8:1), logo `logo-grupo-negativo.png`, Plus Jakarta Sans. Verde/vermelho só como bom/ruim.

### Overview
Um login para todos. **Motorista** entra com o usuário de 6 números (os 6 primeiros do CPF; o CPF não é guardado) e a
senha inicial é o mesmo número; fica 30 dias conectado e vai para a área do motorista (postos autorizados + média).
**Gestão** entra com o usuário dela; "Manter conectado" por 48 h; vai para `/gestao/` (ou Trocar senha).
"Falta cartão no caminhão?" continua sem login.

### Layout (do Figma)
| Região | Medida | Regra |
|---|---|---|
| Tela (desktop) | grade `1fr 456px`, altura `100dvh` | sem rolagem em 1440×900 |
| Foto | toda a altura, `object-fit: cover`, foco `75% 55%` | sem degradê (como no modelo); legenda 12/500 no canto inferior esquerdo, 48 px das bordas |
| Painel | 456 px, fundo `--fundo`, respiro 48 px, coluna com `space-between` | topo (marca + formulário, 48 px entre eles) e rodapé |
| Marca | logo do Grupo Miranda Coelho negativa, 40 px de altura (208 px) + "GESTÃO DE FROTAS" 12/600 laranja, caixa alta, 10 px abaixo | no lugar da logo do modelo |
| Formulário | 360 px | título 20/600 (28 px de linha) → 24 → campos → 32 → botões |
| Campos | rótulo 12/500 acima, recuo 16 px, 8 px até o campo; campo **preenchido** 48 px, fundo `--cartao`, borda 1 px `rgba(255,255,255,.08)`, canto 6 | 16 px entre os campos; 20 px até a linha de opções |
| Opções | interruptor 40×20 + "Manter conectado" 12 à esquerda; "Esqueci a senha" 12/500 laranja à direita | |
| Botões | Entrar 40 px laranja `--primaria` (texto `--sobre-primaria` #161616, 15/700); divisória 1 px `--borda`; botão escuro 40 px `--cartao-2` com ícone de cartão âmbar | 32 px entre eles |
| Linha de apoio | "Não tem acesso? **Fale com a gestão de combustível**" 12, centralizada, 24 px abaixo | no lugar de "Sign up now" |
| Rodapé | "Gestão de frotas" à esquerda, "© 2026 Grupo Miranda Coelho" à direita, 12 `--suave` | |

### O que veio do modelo e o que mudou
| Modelo | Portal |
|---|---|
| Fundo branco, campos #F2F2F2, azul #007AFF | escuro `--fundo`, campos `--cartao`, laranja `--primaria` |
| Poppins / Roboto / SF Pro | Plus Jakarta Sans |
| Logo UI Unicorn, foto do farol, "Photo by…" | logo do Grupo Miranda Coelho, foto do caminhão, legenda "RajaLog Transportes · Grupo Miranda Coelho" |
| "Nice to see you again" | "Que bom te ver de novo" |
| Login / "Email or phone number" | Usuário / "Digite seu usuário" |
| Botão "Or sign in with Google" | "Falta cartão no caminhão? Avisar" (abre o formulário de aviso sem login) |
| Abas Sign in / Sign up (invisíveis no modelo) | removidas |
| Celular: barra do navegador desenhada | não entra (é o próprio navegador) |

### Design Tokens Used
| Token | Valor | Uso |
|---|---|---|
| `--fundo` | #161616 | painel e página |
| `--cartao` / `--cartao-2` | #262626 / #2E2E2E | campos (e passar o mouse) / botão escuro, interruptor desligado |
| `--texto` / `--texto-2` / `--suave` | #FFF / #D0D0D0 / #9A9A9A | título / rótulos e apoio / rodapé |
| `--primaria` / `--primaria-escura` / `--sobre-primaria` / `--primaria-suave` | #F6A42B / #E0921C / #161616 / rgba(246,164,43,.16) | Entrar, links, interruptor ligado, foco / hover / texto do botão (8,8:1) / fundo da pílula "Motorista" |
| `--alerta` | #F6C25E | ícone do cartão, Caps Lock, bloqueio |
| `--erro` | #FF5A5A | borda do campo inválido, faixa de erro |
| placeholder | #8A8A8A | 5,3:1 sobre o campo |

### States and Interactions
| Elemento | Estado | Comportamento |
|---|---|---|
| Usuário | 6 números | pílula "Motorista" no rótulo; senha abre teclado numérico; "Manter conectado" some (motorista já fica 30 dias) |
| Campo | passar o mouse / foco | fundo `--cartao-2` / borda laranja + anel 3 px |
| Enviar vazio | inválido | borda vermelha + mensagem abaixo; foco no primeiro vazio |
| Entrar | enviando | anel girando + "Entrando…", desabilitado |
| 401 | erro | faixa vermelha "Usuário ou senha incorretos."; **se for motorista**, aparece a dica "o usuário são os 6 primeiros números do seu CPF, e a senha é o mesmo número, se você ainda não trocou" (antes do erro, a regra não aparece) |
| 429 | bloqueio | faixa âmbar com relógio |
| 403 | desligado | faixa vermelha "Seu acesso não está liberado…" |
| Senha | Caps Lock | aviso âmbar abaixo |
| Olho | clique | mostra/esconde, troca ícone e rótulo |
| Esqueci a senha | clique | caixa de ajuda: motorista → pedir à gestão a senha inicial; gestão → pedir ao administrador |
| Interruptor | clique | desliza 180 ms; laranja quando ligado; `role="switch"` |
| Foto e logo | clique direito / dedo pressionado | sem menu "Copiar/Salvar imagem" (`pointer-events: none`, `draggable=false`) |

### Responsive Behavior
| Largura | Mudanças |
|---|---|
| > 900 px | foto + painel de 456 px |
| ≤ 900 px (Figma mobile) | **sem foto**; formulário no topo (máx. 400 px, respiro 16); logo centralizada abaixo do formulário (64 px); rodapé no fim; texto mínimo 14 px; botões e alvos 44 px |

### Edge Cases
- Foto não carrega: fundo #0D0D0D; o painel não depende dela. Foto 40–80 KB (`srcset`).
- Usuário da gestão só com 6 números seria tratado como motorista (mesma regra do servidor, `usuarioMotorista`).
- Mensagens longas quebram linha na faixa; nunca cortadas.
- Sessão válida ao abrir `/`: pular o login e ir direto para a área certa.

### Accessibility Notes
- Ordem do foco: usuário → senha → olho → Manter conectado → Esqueci a senha → Entrar → Falta cartão.
- Faixa de aviso `role="alert"`; Caps Lock `aria-live`; campos com `aria-describedby` (erro e dica).
- Contraste: título e campos > 11:1; rótulos `--texto-2` > 9:1; botão 8,8:1; links laranja ~9:1 sobre #161616.
- `prefers-reduced-motion` desliga as animações; `color-scheme: dark`.

### Implementação no portal
1. `public/index.html`: a página pública de postos sai; entra este login (reaproveitar `#dialog-cartao` e o envio do
   `app.js` para "Falta cartão").
2. Postos e unidades passam para a área do motorista (`/motorista/`), com sessão.
3. `functions/api/login.js`: sem mudança de regra.
4. Copiar `foto-caminhao-1200.webp` e `foto-caminhao-720.webp` para `public/` (a logo `logo-grupo-negativo.png` já está lá).
5. Registrar a tela no `design-system/MASTER.md`; atualizar `briefing.md`, `CHANGELOG.md` e `CHECKLIST.md`;
   `npm run verificar`.

### Tela fixa, sem rolagem (18/11/2026)
- No computador (> 900 px) a tela tem a altura exata da janela (`height: 100dvh`, `overflow: hidden`): nunca rola.
- Os espaços do painel encolhem com a altura disponível (`clamp(…, vh, …)`): no tamanho do Figma (900 px de altura)
  ficam iguais ao modelo (respiro 48, 48 entre marca e formulário, 24/20/16/32 no formulário); em telas baixas descem
  até 24/20/12/12/10/16 px.
- Em telas com até 640 px úteis: respiro 20 px, logo com 32 px e título 18 px.
- Medido sem rolagem e sem corte: 1920×937 (Full HD com o navegador), 1440×900, 1366×657 (notebook com o
  navegador), 1366×600 e 1280×585.
- No celular (≤ 900 px) a página continua podendo rolar: quando o teclado abre, o campo precisa subir.

### Foto nova (18/11/2026)
- Foto do caminhão refeita pelo usuário (1536×2752, Downloads/Gemini_Generated_Image_fbc8…): `foto-caminhao-1200.webp`
  (84 KB) e `foto-caminhao-720.webp` (42 KB). Nomes novos para o navegador não mostrar a foto antiga do cache.
