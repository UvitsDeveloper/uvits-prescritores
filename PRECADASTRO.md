# 🔗 Formulário de pré-cadastro — componente embutido

O formulário de cadastro em `public/index.html` (seção `#form`) não é mais
código próprio deste repositório. Ele foi substituído por um **componente
compartilhado**, hospedado no Worker do Portal de Prescritores
(`uvits-portal-prescritores`, repositório separado), e é o **mesmo**
componente usado na página exclusiva `/pre-cadastro` desse outro projeto.

## O que mudou

- `public/index.html`: a seção `#form-fields` (campos, botão, máscaras,
  validação, `fetch('/api/cadastro')`) foi removida. No lugar, ficou só
  `<div id="uvits-pre-cadastro-root"></div>`, e três tags novas:
  - `<link rel="stylesheet" href="https://uvits-portal-prescritores.uvits.workers.dev/pre-cadastro/form.css">`
  - `<script src="https://uvits-portal-prescritores.uvits.workers.dev/pre-cadastro/form.js"></script>`
  - Uma chamada a `mountPublicPrescriberRegistrationForm(container, { origin: 'pagina_conversao', endpoint, availabilityEndpoint })`
    dentro do `DOMContentLoaded` já existente (o mesmo listener que já
    inicializava o carrossel da trust bar).
- Tudo o resto da página (hero, seções institucionais, benefícios,
  manifesto, trust bar, rodapé, SEO) **não foi tocado**.
- Uma regra CSS pequena (`#uvits-pre-cadastro-root .prf-card { ... }`)
  neutraliza o cartão próprio do componente para não desenhar um cartão
  branco dentro do `.form-card` que a página já tem.
- `docs/architecture.md` foi atualizado para descrever o novo fluxo.

## Por que carregado de outro domínio, e não copiado para cá

O componente (campos, 5 etapas, máscaras de CPF/telefone/CEP, validações,
resumo com CPF parcialmente oculto etc.) é o mesmo usado na página
`/pre-cadastro` do Worker. Copiá-lo para este repositório criaria duas
implementações que precisariam ser mantidas manualmente em sincronia.
Carregando do mesmo Worker, os dois lugares (esta página e `/pre-cadastro`)
usam **byte a byte o mesmo arquivo**, sempre.

## ⚠️ Isto substitui uma integração que já funcionava, não só código legado

Antes desta mudança, `api/cadastro.js` já validava o formulário e chamava
`api/_shopifySync.js` (ponte **server-to-server**) para criar/vincular o
cliente na Shopify com status `pendente` — uma integração diferente da nova,
já documentada em `docs/architecture.md` e já em produção. Esta mudança
**substitui esse caminho por um novo**: o navegador chama o Worker
diretamente (`POST /prescriber-registration`), sem passar pelo `/api/cadastro`,
com CPF coletado já no pré-cadastro e status inicial `aprovado` (não mais
`pendente`).

`api/cadastro.js` e `api/_shopifySync.js` **não foram removidos** — só
deixaram de ser chamados pelo formulário público. Decidir se devem ser
removidos (e o que fazer com `api/_cpf.js` e o restante dessa cadeia) é uma
decisão separada, fora do escopo desta mudança — ver a seção "Codigo legado"
atualizada em `docs/architecture.md`.

## Dependência: CORS no Worker

O Worker precisa responder com `Access-Control-Allow-Origin` para a origem
`https://prescritores.uvits.com.br` nas rotas `POST /prescriber-registration`
e `GET /prescriber-registration/codigo-disponivel` — sem isso, o navegador
bloqueia as respostas antes de chegarem ao componente, mesmo com o script
carregando normalmente. Isso é configurado do lado do Worker
(`PUBLIC_REGISTRATION_ALLOWED_ORIGIN`), não deste projeto. Já implantado em
produção no Worker no momento desta mudança.

## Checklist antes de considerar isto "no ar"

- [x] Worker (`uvits-portal-prescritores`) com as rotas `/pre-cadastro`,
      `/prescriber-registration` e CORS implantados em produção.
- [ ] Testar o cadastro de ponta a ponta em `prescritores.uvits.com.br`
      (as 5 etapas, envio, mensagem final).
- [ ] Testar em celular, tablet e desktop.
- [ ] Confirmar com o time se `api/cadastro.js`/`_shopifySync.js`/`_cpf.js`
      devem ser removidos agora que nada os chama a partir do formulário
      público, ou se algum outro consumidor ainda depende deles.
