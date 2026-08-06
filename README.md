# Uvits Pro Prescritor — site publico

Landing page e API serverless do cadastro publico do programa Uvits Pro
Prescritor. Este repositorio recebe o formulario, encaminha o perfil ao Portal
Shopify e entrega e-mails transacionais pelo Resend.

## Papel deste repositorio

- Servir as paginas publicas de cadastro e agradecimento.
- Validar e limitar tentativas do formulario.
- Encaminhar novos cadastros ao Worker `uvits-portal-prescritores`.
- Enviar confirmacoes, avisos de ativacao e alteracoes de cupom.
- Expor endpoints legados protegidos enquanto a transicao do Postgres existir.

A Shopify e a fonte de verdade dos dados atuais do prescritor. O painel
administrativo fica exclusivamente no app embedded `uvits-portal-prescritores`.

## Comeco rapido

```bash
npm ci
copy .env.example .env.local
npx vercel dev
```

Acesse `http://localhost:3000`. Nunca use dados reais em arquivos versionados.

## Estrutura principal

| Caminho | O que contem | Observacao |
|---|---|---|
| `api/` | Serverless Functions CommonJS | A Vercel exige esta pasta na raiz |
| `public/` | Landing e pagina de agradecimento | Conteudo estatico servido pela Vercel |
| `database/` | Schema e migracoes historicas do Postgres legado | Nao e a fonte cadastral atual |
| `scripts/migrations/` | Ferramentas manuais de migracao | Dry-run por padrao |
| `docs/` | Arquitetura, operacao e material historico | Documentacao nao executavel |
| `vercel.json` | Rotas e headers HTTP | Necessario para o deploy |

Veja o inventario completo em [docs/project-structure.md](docs/project-structure.md).

## Endpoints

| Rota | Uso |
|---|---|
| `POST /api/cadastro` | Recebe o formulario publico e cria/vincula o perfil na Shopify |
| `POST /api/notificar` | Entrega eventos de e-mail solicitados pelo Worker |
| `GET/PATCH/DELETE /api/prescritores` | Compatibilidade com o cadastro Postgres legado |

Arquivos iniciados por `_` em `api/` sao modulos internos compartilhados e nao
devem ser tratados como telas ou APIs publicas de negocio.

## Documentacao

- [Indice da documentacao](docs/README.md)
- [Arquitetura atual](docs/architecture.md)
- [Mapa de pastas e arquivos](docs/project-structure.md)
- [Deploy na Vercel](docs/operations/deploy-vercel.md)
- [Release e restauracao](docs/operations/release-and-rollback.md)
- [Contexto historico arquivado](docs/archive/legacy-claude-context.md)
- [Historico de versoes](CHANGELOG.md)

## Variaveis de ambiente

Use `.env.example` como catalogo. Os grupos principais sao:

- Resend: `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_NAME`, `TO_EMAIL`;
- Worker: `WORKER_API_URL`, `SHOPIFY_SYNC_SERVICE_KEY`;
- seguranca: `PRESCRITORES_SERVICE_KEY`, `ALLOWED_ORIGIN`;
- limite de uso: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`;
- legado: variaveis `POSTGRES_*` injetadas pela Vercel/Neon.

Arquivos `.env*`, exports, backups e planilhas com dados pessoais nao podem ser
adicionados ao Git.

## Validacao e deploy

```bash
node --check api/cadastro.js
node --check api/notificar.js
node --check api/prescritores.js
npx vercel --prod
```

O procedimento completo e o rollback estao em
[docs/operations/release-and-rollback.md](docs/operations/release-and-rollback.md).
