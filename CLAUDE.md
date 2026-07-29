# CLAUDE.md — Uvits Prescritores

Contexto completo do projeto para o Claude Code. Leia este arquivo antes de qualquer tarefa.

---

## O que é este projeto

Landing page do programa **Uvits Pro Prescritor**, com formulário de cadastro e disparo automático de e-mails. Desenvolvido para a **Uvits Vitaminas** (`uvits.com.br`), marca brasileira de vitaminas líquidas.

O painel administrativo **não vive mais aqui** — a única interface de gestão dos cadastros é o app embedded na Shopify (repositório `uvits-portal-prescritores`), que chama a API deste projeto server-to-server via `PRESCRITORES_SERVICE_KEY`. Não há login direto neste repositório.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JS vanilla (sem framework) |
| Backend | Node.js — Serverless Functions do Vercel |
| Banco de dados | Neon Postgres (via `@vercel/postgres`) |
| E-mail | Resend SDK v3 |
| Autenticação | Bearer token único (`PRESCRITORES_SERVICE_KEY`) — sem login direto, só o app embedded na Shopify chama a API |
| Hospedagem | Vercel |

---

## Estrutura de arquivos

```
prescritores/
├── api/
│   ├── _auth.js          # Verifica o Bearer token (PRESCRITORES_SERVICE_KEY) — reutilizado por todas as rotas protegidas
│   ├── cadastro.js       # POST /api/cadastro — recebe form, salva no banco, envia e-mails
│   └── prescritores.js   # GET + PATCH /api/prescritores — listagem e atualização (chamado pelo app embedded)
├── public/
│   └── index.html        # Landing page pública (página de cadastro) — único front-end deste repositório
├── scripts/
│   └── schema.sql        # DDL completo — tabelas, índices, trigger de timestamp
├── .env.example          # Modelo de variáveis de ambiente
├── package.json
├── vercel.json           # Rotas + headers de segurança HTTP
└── CLAUDE.md             # Este arquivo
```

---

## Banco de dados

### Tabelas

**`usuarios`** — legado do antigo login por e-mail+senha do painel administrativo, removido. A tabela **não foi apagada** (decisão de banco de dados fica fora do escopo de mudanças de interface), mas nenhum código deste projeto a consulta mais.

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
| `PRESCRITORES_SERVICE_KEY` | ✅ | Segredo compartilhado com o app embedded na Shopify — única forma de autenticação das rotas administrativas |
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

## Fluxo de autenticação das rotas administrativas

Não existe login neste repositório. A única identidade administrativa do sistema é a conta do app embedded na Shopify (`uvits-portal-prescritores`), autenticada lá por token fixo ou sessão do Shopify Admin. Esse app chama a API deste projeto server-to-server:

```
App embedded (Shopify) → chama /api/prescritores
        │
        ▼
Authorization: Bearer <PRESCRITORES_SERVICE_KEY>
        │
        ▼
api/_auth.js compara o token em tempo constante
Retorna 401 se não bater
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
| Timing attack | Comparação do `PRESCRITORES_SERVICE_KEY` sempre em tempo constante (`timingSafeEqual`) |
| Duplo submit | Flag `enviando = true` no frontend previne resubmissão |

---

## Regras de negócio

- **Apenas Médico(a) e Nutricionista** são aceitos — validado em frontend e backend
- **CRM ou CRN** são obrigatórios no cadastro
- **WhatsApp é obrigatório** — a equipe contata via WhatsApp após validação
- O programa **não tem portal de login para prescritores** — o contato é feito manualmente pela equipe Uvits
- A gestão administrativa dos cadastros acontece **exclusivamente** pelo app embedded na Shopify (`uvits-portal-prescritores`) — este repositório não tem interface administrativa própria

---

## Como rodar localmente

```bash
npm install
cp .env.example .env
# editar .env com os valores reais
vercel dev
```

Acesse `http://localhost:3000` (landing). Para testar as rotas administrativas localmente, chame a API diretamente com `Authorization: Bearer <PRESCRITORES_SERVICE_KEY>` (não há tela própria neste repositório — use o app embedded ou `curl`).

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
