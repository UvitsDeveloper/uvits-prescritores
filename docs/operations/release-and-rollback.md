# Release e restauracao

## Versoes protegidas

- `v2.0.0`: baseline anterior a integracao ampliada com o Portal Shopify.
- `v2.1.0`: cadastro publico como ponte da Shopify e notificacoes transacionais atualizadas.
- `v2.1.1`: contato de suporte pelo WhatsApp nas mensagens e no site publico.
- `v2.1.2`: mensagem do WhatsApp identifica explicitamente o prescritor.
- `v2.1.3`: reorganizacao de documentacao, banco legado e scripts auxiliares.
- `v2.1.4`: e-mail transacional especifico para reativacao de prescritores.

## Publicar uma versao

1. Selecionar a tag desejada em uma arvore limpa.
2. Instalar dependencias com `npm ci`.
3. Validar sintaxe e os fluxos de cadastro, sincronizacao e notificacao.
4. Publicar o commit ou a tag na Vercel.
5. Confirmar o dominio `prescritores.uvits.com.br` e o endpoint de saude.

## Restaurar sem reescrever o historico

```bash
git fetch origin --tags
git switch -c rollback/v2.0.0 v2.0.0
npm ci
```

Publique a branch de restauracao apenas depois da validacao. Para manter a `main` auditavel,
prefira `git revert` do commit de release e publique um novo patch; nao use force push.

## Dados e segredos

Este repositorio e publico. Tokens, arquivos `.env`, exports, backups e dados pessoais de
clientes nao podem ser adicionados ao Git. A restauracao de codigo nao deve sobrescrever nem
apagar dados mantidos na Shopify.
