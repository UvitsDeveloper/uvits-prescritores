# CLAUDE.md — Uvits Prescritores

Contexto completo do projeto para o Claude Code. Leia este arquivo antes de qualquer tarefa.

---

## O que é este projeto

Landing page do programa **Uvits Pro Prescritor**, com formulário de cadastro, disparo automático de e-mails e painel administrativo. Desenvolvido para a **Uvits Vitaminas** (`uvits.com.br`), marca brasileira de vitaminas líquidas.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JS vanilla (sem framework) |
| Backend | Node.js — Serverless Functions do Vercel |
| Banco de dados | Neon Postgres (via `@vercel/postgres`) |
| E-mail | Resend SDK v3 |
| Autenticação | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Hospedagem | Vercel |

---

## Estrutura de arquivos

```
prescritores/
├── api/
│   ├── _auth.js          # Middleware JWT — reutilizado por todas as rotas protegidas
│   ├── login.js          # POST /api/login — autenticação do painel admin
│   ├── cadastro.js       # POST /api/cadastro — recebe form, salva no banco, envia e-mails
│   └── prescritores.js   # GET + PATCH /api/prescritores — listagem e atualização (protegido)
├── public/
│   ├── index.html        # Landing page pública (página de cadastro)
│   └── admin.html        # Painel administrativo (requer login JWT)
├── scripts/
│   ├── schema.sql        # DDL completo — tabelas, índices, trigger de timestamp
│   └── hash-senha.js     # Script CLI para gerar hash bcrypt do usuário admin
├── .env.example          # Modelo de variáveis de ambiente
├── package.json
├── vercel.json           # Rotas + headers de segurança HTTP
└── CLAUDE.md             # Este arquivo
```

---

## Banco de dados

### Tabelas

**`usuarios`** — usuários do painel administrativo
- Cadastro feito diretamente no banco (não há tela de criação de usuários)
- Senha armazenada como hash bcrypt com custo 12
- Para criar um usuário: `node scripts/hash-senha.js` → copiar INSERT gerado → executar no Neon

**`prescritores`** — cadastros recebidos pelo formulário público
- `status` com CHECK constraint: `aguardando_contato | contato_realizado | aprovado | reprovado`
- `email_enviado` — booleano atualizado após tentativa de envio pelo Resend
- `atualizado_em` — atualizado automaticamente por trigger PostgreSQL
- `notas` — campo livre para anotações internas da equipe

### Regras de negócio do banco
- Não há soft delete — registros são permanentes
- `atualizado_em` nunca deve ser alterado manualmente (é responsabilidade do trigger)
- Índices em `status`, `criado_em DESC` e `email` para performance nas queries do painel

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `RESEND_API_KEY` | ✅ | Chave do Resend |
| `FROM_EMAIL` | ✅ | E-mail remetente (domínio verificado no Resend) |
| `FROM_NAME` | Não | Nome do remetente (padrão: `Uvits Pro Prescritor`) |
| `TO_EMAIL` | ✅ | E-mail que recebe aviso de novo cadastro |
| `JWT_SECRET` | ✅ | String aleatória longa (mín. 64 chars) para assinar tokens |
| `ALLOWED_ORIGIN` | ✅ | Origem permitida no CORS (ex: `https://prescritores.uvits.com.br`) |
| `POSTGRES_URL` | ✅ | Injetada automaticamente pelo Neon/Vercel |

As variáveis `POSTGRES_*` são injetadas automaticamente pelo Vercel ao conectar o Neon. Nunca commitar o `.env` real.

---

## Fluxo de cadastro

```
Usuário preenche o form (index.html)
        │
        ▼
Validação no frontend (JS inline)
  - nome ≥ 3 chars
  - e-mail válido (regex)
  - whatsapp obrigatório e válido
  - conselho obrigatório
  - profissão: apenas Médico(a) ou Nutricionista
        │
        ▼
POST /api/cadastro
  1. Rate limit por IP (5 req/hora, em memória)
  2. Verificação de Content-Type
  3. Sanitização de todos os campos (escape HTML)
  4. Validação server-side (espelha o frontend)
  5. INSERT no banco (status = aguardando_contato)
  6. Promise.allSettled([email_prescritor, email_uvits])
  7. UPDATE email_enviado no banco
        │
        ▼
Resposta ao frontend: { success: true }
```

---

## Fluxo de autenticação do painel

```
POST /api/login  { email, senha }
        │
        ▼
Busca usuário no banco
Compara senha com bcrypt.compare (timing-safe)
Gera JWT com expiração de 8h
        │
        ▼
Frontend armazena token no localStorage
Todas as requisições ao painel incluem:
  Authorization: Bearer <token>
        │
        ▼
api/_auth.js verifica e decodifica o JWT
Retorna 401 se inválido ou expirado
```

---

## Segurança (OWASP aplicado)

| Item | Implementação |
|---|---|
| Injection | `sanitize()` escapa `< > " ' /` em todos os campos antes de usar em templates HTML |
| Rate limiting | Map em memória por IP, 5 req/hora, retorna 429 |
| CORS | `ALLOWED_ORIGIN` via env — restrito ao domínio em produção |
| Headers HTTP | `vercel.json`: `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy`, `Permissions-Policy` |
| Content-Type | API rejeita `415` se não for `application/json` |
| Timing attack | Login sempre roda `bcrypt.compare` mesmo quando usuário não existe |
| Duplo submit | Flag `enviando = true` no frontend previne resubmissão |
| JWT | Expiração de 8h, secret via env, verificado em toda rota protegida |

---

## Painel administrativo (`/admin.html`)

- Login com e-mail + senha → JWT armazenado no `localStorage`
- Listagem paginada (20 por página) com busca por nome/e-mail/profissão
- Filtro por status via badges clicáveis
- Modal de detalhes: edição de status e notas internas
- Indicador visual de e-mail enviado (✓ / ✗)
- Logout limpa o token do `localStorage`

---

## Regras de negócio

- **Apenas Médico(a) e Nutricionista** são aceitos — validado em frontend e backend
- **CRM ou CRN** são obrigatórios no cadastro
- **WhatsApp é obrigatório** — a equipe contata via WhatsApp após validação
- O programa **não tem portal de login para prescritores** — o contato é feito manualmente pela equipe Uvits
- Status do prescritor deve seguir a ordem lógica: `aguardando_contato → contato_realizado → aprovado | reprovado`
- Usuários do painel são criados **exclusivamente via banco** — não há interface de criação

---

## Como rodar localmente

```bash
npm install
cp .env.example .env
# editar .env com os valores reais
vercel dev
```

Acesse `http://localhost:3000` (landing) e `http://localhost:3000/admin.html` (painel).

---

## Padrões de código

- **CommonJS** (`require/module.exports`) — não usar ESM (`import/export`)
- Serverless functions em `api/` exportam `module.exports = async function handler(req, res)`
- Sem TypeScript, sem bundler, sem framework frontend
- CSS via variáveis custom properties (`:root { --primary: #2EC4A5; ... }`)
- Queries ao banco sempre via template literals do `@vercel/postgres`: `` sql`SELECT...` ``
- Nunca interpolar variáveis diretamente em queries SQL — sempre usar os placeholders do `sql` tag

---

## Contexto da empresa

- **Uvits Vitaminas** — marca de vitaminas líquidas, suplementos em cápsulas e pó
- Canais de venda: Mercado Livre, Amazon, Shopee, Magalu, Grupo RD e site próprio (Shopify)
- E-mail comercial: `contato@uvits.com.br`
- Site: `uvits.com.br`
- Este projeto é hospedado separado do site principal (Vercel independente)
