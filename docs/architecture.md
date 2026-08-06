# Arquitetura atual

## Limite de responsabilidade

Este repositorio e a borda publica do programa. Ele nao e mais o cadastro
mestre nem possui painel administrativo proprio.

| Componente | Responsabilidade |
|---|---|
| `public/` | Formulario e comunicacao publica |
| Vercel Functions | Validacao, rate limit, ponte server-to-server e e-mails |
| Portal Cloudflare | Regras administrativas e integracoes de negocio |
| Shopify | Cliente e metacampos que formam o perfil atual do prescritor |
| Resend | Entrega dos e-mails transacionais |
| Neon/Postgres | Compatibilidade e dados historicos legados |

## Fluxo do formulario

```text
public/index.html
  -> POST /api/cadastro
  -> valida campos e aplica rate limit
  -> POST interno no Worker
  -> Worker cria ou vincula o cliente Shopify
  -> status pendente no perfil Shopify
  -> Resend confirma o recebimento e avisa a equipe
```

Se a pessoa havia sido excluida do programa, o Worker reutiliza o cliente
Shopify e abre uma nova analise. Status, cupom e beneficios anteriores nao sao
restaurados automaticamente.

## E-mails

`api/_notificacoes.js` concentra os templates. `api/notificar.js` recebe eventos
autenticados do Worker. O link de suporte usa o numero `(19) 99856-6115` e a
mensagem identifica que o contato e de um prescritor.

## Codigo legado

`api/prescritores.js` e `database/` existem para compatibilidade com o antigo
cadastro Postgres. Novos dados do formulario nao devem ser persistidos ali.
Qualquer remocao futura desse legado exige inventario, backup e verificacao de
que nenhum consumidor ainda chama esses endpoints.

## Seguranca

- chamadas administrativas e internas usam Bearer tokens server-to-server;
- secrets ficam nas variaveis da Vercel;
- o formulario tem validacao, rate limit e restricao de Content-Type;
- `vercel.json` define headers HTTP de seguranca;
- dados pessoais, planilhas e backups nunca sao versionados.
