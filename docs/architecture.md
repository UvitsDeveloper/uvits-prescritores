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

O formulario de `public/index.html` (secao `#form`) e um componente
compartilhado, carregado diretamente do Worker (Portal de Prescritores) —
mesmo componente usado na pagina exclusiva `/pre-cadastro` desse outro
repositorio, so muda a origem enviada (`pagina_conversao`). Ver
`PRECADASTRO.md`.

```text
public/index.html
  -> <script src=".../pre-cadastro/form.js"> (Worker, nao copiado aqui)
  -> formulario em 5 etapas: dados pessoais (com CPF), dados profissionais,
     endereco, programa, revisao
  -> POST direto no Worker: /prescriber-registration (CORS liberado so para
     este dominio)
  -> Worker valida de novo, verifica duplicidade de e-mail/CPF, cria ou
     vincula o cliente Shopify
  -> status "aprovado" no perfil Shopify (equivalente a "pronto para ativar";
     nunca ativa beneficio, tag de desconto, cupom ou notificacao — isso
     continua manual, pelo painel do Worker)
```

Se a pessoa havia sido excluida do programa, o Worker reutiliza o cliente
Shopify e abre uma nova analise (status volta a "pendente" nesse caso
especifico, nunca "aprovado"). Status, cupom e beneficios anteriores nao sao
restaurados automaticamente. Se o e-mail ou CPF ja pertencer a um cadastro
existente e ativo, o Worker recusa em vez de sobrescrever.

## E-mails

`api/_notificacoes.js` concentra os templates. `api/notificar.js` recebe eventos
autenticados do Worker. O link de suporte usa o numero `(19) 99856-6115` e a
mensagem identifica que o contato e de um prescritor.

## Codigo legado

`api/prescritores.js` e `database/` existem para compatibilidade com o antigo
cadastro Postgres. Novos dados do formulario nao devem ser persistidos ali.

`api/cadastro.js` e `api/_shopifySync.js` (ponte server-to-server que este
endpoint usava para criar/vincular o cliente Shopify) deixaram de ser
chamados pelo formulario publico desde que ele passou a chamar o Worker
diretamente do navegador (ver "Fluxo do formulario" acima). Continuam no
repositorio, intactos; decidir se devem ser removidos e o que fazer com
`api/_cpf.js` e o restante da cadeia antiga e uma decisao separada.

Qualquer remocao futura desse legado exige inventario, backup e verificacao de
que nenhum consumidor ainda chama esses endpoints.

## Seguranca

- chamadas administrativas e internas usam Bearer tokens server-to-server;
- secrets ficam nas variaveis da Vercel;
- o formulario tem validacao, rate limit e restricao de Content-Type;
- `vercel.json` define headers HTTP de seguranca;
- dados pessoais, planilhas e backups nunca sao versionados.
