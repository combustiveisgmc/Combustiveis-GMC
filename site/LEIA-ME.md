# Postos autorizados + Gestão de combustível

Um site só, no Cloudflare Pages:

- `/` — lista de postos para os motoristas (sem login).
- `/gestao/` — área da gestão. Só abre com usuário e senha; sem login o servidor devolve para a tela inicial.

## Pastas

```
public/            o que vai para o ar (HTML, CSS, JS, ícones, postos.csv)
  gestao/          telas da gestão (protegidas)
functions/         código que roda na Cloudflare (login, sessão, proteção de /gestao)
lib/auth.js        senhas (PBKDF2) e sessões
migrations/        estrutura do banco D1
scripts/           criar-usuario.mjs
```

## Primeira publicação (uma vez só)

Precisa do Node.js instalado. Abra o terminal nesta pasta:

1. `npm install`
2. `npx wrangler login` — abre o navegador para entrar na conta Cloudflare.
3. `npx wrangler d1 create gestao-combustivel` — copie o `database_id` mostrado e cole em `wrangler.toml`.
4. `npm run criar-projeto` — cria o projeto novo `gestao-combustivel` no Cloudflare Pages.
   O site antigo dos motoristas não é alterado.
5. `npm run db:remoto` — cria as tabelas no banco da Cloudflare.
6. Crie o seu usuário de administrador:
   `npm run criar-usuario -- seu.usuario "Seu Nome" admin --remoto`
   A senha aparece uma única vez no terminal. Guarde.
7. `npm run publicar` — o site novo fica em https://gestao-combustivel.pages.dev
   (se esse nome já estiver em uso, o terminal mostra o endereço gerado).

## Trocar os motoristas para o site novo (quando estiver pronto)

Enquanto isso não for feito, os motoristas continuam usando o site antigo normalmente.

- **Com domínio próprio** (ex.: postos.suaempresa.com.br): no painel, remova o domínio do projeto antigo
  (Custom domains) e adicione no `gestao-combustivel`. O endereço dos motoristas não muda.
- **Só com endereço .pages.dev:** publique no projeto antigo apenas um arquivo `_redirects` com a linha
  `/*  https://gestao-combustivel.pages.dev/:splat  301`. Quem abrir o endereço antigo (inclusive pelo
  app instalado no celular) cai no site novo.

## Dia a dia

- **Atualizar postos:** edite `public/postos.csv` (mesmo formato de antes, separado por `;`) e rode `npm run publicar`.
- **Novo membro da gestão:** `npm run criar-usuario -- usuario "Nome Completo" gestor --remoto`
- **Esqueceu a senha:** rode o mesmo comando com o mesmo usuário; gera senha nova e desconecta as sessões antigas.

## Testar no computador

```
npm run db:local
npm run criar-usuario -- teste "Teste" admin
npm run dev
```

Abra http://127.0.0.1:8788. Se aparecer `SQLITE_CANTOPEN`, a pasta está com caminho longo demais para o
Windows: use `--persist-to C:\temp\d1` nos comandos do wrangler e defina `D1_LOCAL_DIR=C:\temp\d1`
antes do `criar-usuario`.

## Segurança

- Senhas guardadas só como hash PBKDF2-SHA256 (100 mil iterações) com sal.
- Sessão em cookie `HttpOnly`, `Secure`, `SameSite=Strict`, válida por 12 horas.
- 5 senhas erradas seguidas bloqueiam aquele usuário por 15 minutos.
- O service worker do app nunca guarda `/api` nem `/gestao` em cache.
