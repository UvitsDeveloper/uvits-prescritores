# Mapa do repositorio

## Raiz

| Arquivo | Finalidade |
|---|---|
| `README.md` | Visao geral e entrada da documentacao |
| `CHANGELOG.md` | Historico por versao |
| `package.json` / `package-lock.json` | Dependencias reproduziveis |
| `vercel.json` | Rotas, assets e headers do deploy |
| `.env.example` | Catalogo sem valores reais das variaveis |

## API

| Arquivo | Finalidade |
|---|---|
| `api/cadastro.js` | Formulario publico e encaminhamento para a Shopify |
| `api/notificar.js` | Endpoint autenticado de eventos transacionais |
| `api/prescritores.js` | API administrativa legada do Postgres |
| `api/_auth.js` | Autenticacao server-to-server |
| `api/_cpf.js` | Validacao de CPF |
| `api/_notificacoes.js` | Templates e envio pelo Resend |
| `api/_ratelimit.js` | Limites de tentativas |
| `api/_shopifySync.js` | Cliente do Worker do Portal |
| `api/_usage.js` | Medicao e alerta de consumo do Redis |
| `api/_onboardingSync.js` | Cliente do Worker pro onboarding por convite (`/internal/onboarding/*`) |
| `api/onboarding/*.js` | 8 rotas de proxy do onboarding por convite (status, otp, formulario, cupom, conclusao) |

## Frontend

| Arquivo | Finalidade |
|---|---|
| `public/index.html` | Landing page e formulario |
| `public/obrigado.html` | Confirmacao apos cadastro |
| `public/onboarding.html` | Fluxo de onboarding por convite (`/onboarding/:token`) |

## Banco legado

| Caminho | Finalidade |
|---|---|
| `database/schema.sql` | Fotografia consolidada do schema Postgres legado |
| `database/migrations/` | Alteracoes historicas datadas do schema |
| `scripts/migrations/` | Ferramentas manuais; entradas e backups ficam fora do Git |

## Documentacao

| Caminho | Finalidade |
|---|---|
| `docs/architecture.md` | Arquitetura vigente |
| `docs/operations/` | Deploy, release e rollback |
| `docs/archive/` | Material historico explicitamente nao vigente |

Arquivos de runtime permanecem na raiz porque a Vercel descobre `api/`,
`public/` e `vercel.json` por convencao.
