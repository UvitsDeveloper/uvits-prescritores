# Changelog

Todas as alteracoes relevantes deste projeto sao registradas aqui. O projeto usa
[Versionamento Semantico](https://semver.org/lang/pt-BR/).

## [2.1.0] - 2026-08-06

### Adicionado

- Integracao ampliada entre o cadastro publico e o Portal de Prescritores da Shopify.
- Templates transacionais para ativacao e alteracoes relevantes do perfil do prescritor.
- Suporte a contexto de alteracao anterior e posterior nas notificacoes administrativas.

### Alterado

- Dados de clientes e prescritores passam a ser consultados e atualizados prioritariamente
  na Shopify; este servico atua como entrada publica e ponte de notificacoes.
- O cadastro publico delega ao Portal a persistencia do perfil e o controle de estado.
- A sincronizacao com a Shopify ficou tolerante a campos opcionais do fluxo administrativo.

### Removido

- Duplicacao de regras e persistencia local que competiam com a Shopify como fonte de verdade.
- Elementos administrativos antigos da pagina publica que ja pertencem ao app embarcado.

## [2.0.0] - 2026-08-06

- Marco de restauracao anterior a integracao ampliada com o Portal e as notificacoes
  transacionais desta release.

[2.1.0]: https://github.com/UvitsDeveloper/uvits-prescritores/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/UvitsDeveloper/uvits-prescritores/releases/tag/v2.0.0
