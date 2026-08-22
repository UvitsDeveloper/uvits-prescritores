# Onboarding por convite — página pública e proxy da API

Implementa o Prompt 10 do plano `PROMPTS_ONBOARDING_PRESCRITORES.md` (mora no
repositório do Worker, `uvits-portal-prescritores`, junto dos demais prompts
00-18). Toda a lógica de negócio (convite, código por e-mail, formulário,
cupom, ativação) já existe pronta e testada no Worker, exposta em
`/internal/onboarding/*`. Este repositório só serve a página pública e uma
camada fina de proxy autenticado — nunca decide regra de negócio.

## Como funciona

1. A equipe aprova o prescritor e gera o convite pelo painel administrativo
   (Worker), copia o link e manda pelo WhatsApp.
2. O link tem a forma `https://prescritores.uvits.com.br/onboarding/{token}`.
   `vercel.json` reescreve `/onboarding/:token` para `public/onboarding.html`
   — uma página estática só, sem roteamento de framework; o token é lido do
   `window.location.pathname` no cliente.
3. `public/onboarding.html` é um fluxo de passos único (vanilla JS, sem
   build), reaproveitando os tokens visuais e componentes (`.form-card`,
   `.field`, `.btn-submit`, `.form-error`) já usados em `public/index.html`.
4. Cada ação do fluxo chama uma rota própria em `/api/onboarding/*`, que só
   repassa pro Worker com o segredo compartilhado — o navegador nunca vê
   `SHOPIFY_SYNC_SERVICE_KEY` nem fala com o Worker diretamente (mesmo
   princípio de `api/_shopifySync.js`, replicado em `api/_onboardingSync.js`).

## Rotas

| Rota nesta app | Chama no Worker | Rate limit aqui |
|---|---|---|
| `POST /api/onboarding/status` | `POST /internal/onboarding/invite/status` | `limitarOnboardingLeitura` (60/h) |
| `POST /api/onboarding/otp-request` | `POST /internal/onboarding/otp/request` | `limitarOnboardingOtp` (30/h) |
| `POST /api/onboarding/otp-verify` | `POST /internal/onboarding/otp/verify` | `limitarOnboardingOtp` (30/h) |
| `POST /api/onboarding/profile` | `POST /internal/onboarding/profile` | `limitarOnboardingEscrita` (30/15min) |
| `POST /api/onboarding/coupon-availability` | `POST /internal/onboarding/coupon/availability` | `limitarOnboardingLeitura` |
| `POST /api/onboarding/coupon-suggestions` | `POST /internal/onboarding/coupon/suggestions` | `limitarOnboardingLeitura` |
| `POST /api/onboarding/coupon-reserve` | `POST /internal/onboarding/coupon/reserve` | `limitarOnboardingEscrita` |
| `POST /api/onboarding/complete` | `POST /internal/onboarding/complete` | `limitarOnboardingEscrita` |

Os limites aqui são deliberadamente **mais folgados** que os do Worker — a
régua de verdade (10/hora por IP pra pedir código, 5 tentativas de código, 3
reenvios, etc.) já é aplicada lá; esta camada só existe pra proteger contra
flood bruto nesta app antes mesmo de chegar no Worker. Detalhes completos das
regras de negócio, durações e códigos de erro: ver
`docs/operations/onboarding-technical.md` no repositório do Worker.

## Repasse de IP

`api/_onboardingSync.js` encaminha o IP do visitante (`X-Forwarded-For` da
requisição recebida pela Vercel) como `X-Forwarded-For` na chamada ao
Worker — é o que ativa a camada de rate limit por IP lá. Sem isso, essa
camada específica fica inativa (o limite por convite/sessão, todo dentro do
D1 do Worker, continua valendo de qualquer jeito).

## O que NUNCA fazer aqui

- Nunca guardar o `sessionToken` ou o código OTP em log, analytics ou
  qualquer lugar além da variável em memória do próprio navegador durante o
  fluxo.
- Nunca aceitar `percent`/status/e-mail vindos do corpo da requisição do
  navegador e repassar pro Worker — os únicos campos aceitos em
  `api/onboarding/profile.js` são os explicitamente listados (proteção
  contra mass assignment, mesmo princípio já usado no Worker).
- Nunca mostrar ao prescritor o texto bruto de um erro técnico (o Worker já
  não devolve `detail` nesta rota especificamente por isso — ver
  `/internal/onboarding/complete` no repositório do Worker); o front sempre
  usa `error`/`code` estruturados, nunca a mensagem crua de uma exceção.

## Testando localmente

Sem framework de testes automatizados neste repositório (mesma situação de
antes desta mudança). Validação disponível:

```bash
node --check api/_onboardingSync.js
for f in api/onboarding/*.js; do node --check "$f"; done
npx vercel dev
# depois, gere um convite de teste pelo painel do Worker e abra
# http://localhost:3000/onboarding/{token}
```
