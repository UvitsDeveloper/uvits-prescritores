# 🚀 Como atualizar o Uvits Pro Prescritor — passo a passo

Guia prático para publicar as mudanças (Redis, rate limit, monitor de uso, segurança)
e deixar tudo funcionando na Vercel.

> A Vercel faz deploy **automático** a cada `git push` na branch `main`.
> Ou seja: publicar = enviar o código + configurar as variáveis no painel.

---

## ✅ Pré-requisitos (uma vez só)
- Estar logado na Vercel com o projeto `uvits-prescritores` conectado a este repositório.
- Conta no **Upstash** (via Vercel Marketplace) — criada no passo 2.
- Conta no **Resend** já configurada (já tem: `RESEND_API_KEY`, `FROM_EMAIL`, `TO_EMAIL`).

---

## Passo 1 — Enviar o código (deploy)

No terminal, dentro da pasta do projeto:

```bash
git push
```

Isso dispara o deploy automático na Vercel. Acompanhe em **Vercel → seu projeto → Deployments**
(leva ~1 min). Enquanto o Redis não estiver conectado (passo 2), o rate limit roda em
**modo fallback (memória)** — o site funciona normalmente.

---

## Passo 2 — Criar e conectar UM Upstash Redis

> ⚠️ Crie **apenas um** banco e conecte o **mesmo** banco a TODOS os projetos
> (prescritores **e** API de Frete). É isso que faz o contador de uso ser
> compartilhado. **Não** crie um Redis por projeto.

1. Vercel → projeto `uvits-prescritores` → aba **Storage**.
2. **Create Database** → **Upstash** → **Redis** (tem plano grátis: 500 mil comandos/mês).
3. Nome: ex. `uvits-redis`. Região: a mais próxima das functions (ex.: `Washington / iad1`).
4. Após criar, clique **Connect Project** → selecione `uvits-prescritores` →
   ambientes **Production, Preview e Development**.
5. Repita o **Connect Project** para o projeto da **API de Frete** (mesmo banco).

Isso injeta automaticamente `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
nos dois projetos. **Não precisa colar nada à mão.**

---

## Passo 3 — Configurar as variáveis de ambiente

Vercel → projeto → **Settings → Environment Variables**. Adicione (Production + Preview):

| Variável | Valor | Observação |
|---|---|---|
| `REDIS_COMMAND_LIMIT` | `500000` | **Use o MESMO valor na API de Frete** |
| `USAGE_PROJECT` | `uvits-prescritores` | Nome que aparece no e-mail de alerta |
| `ALLOWED_ORIGIN` | `https://uvits-prescritores.vercel.app` | **https, SEM barra no final** ⚠️ |

> E-mail de alerta: **nada a fazer** — já usa o `RESEND_API_KEY` + `TO_EMAIL`/`FROM_EMAIL`
> existentes. (Opcional: defina `ALERT_EMAIL_TO` se quiser um destinatário diferente.)

> `REDIS_CMDS_PER_REQUEST` é opcional (padrão `3`).

---

## Passo 4 — Redeploy

Depois de mexer nas variáveis, é preciso um novo deploy para elas valerem:

- **Vercel → Deployments → ⋯ (no último deploy) → Redeploy**, **ou**
- faça qualquer novo `git push`.

Faça o mesmo na **API de Frete** se você ajustou variáveis lá.

---

## Passo 5 — Verificar se deu certo

No terminal:

```bash
# 1) Header CSP presente?
curl -sS -D - -o /dev/null https://uvits-prescritores.vercel.app/ | grep -i content-security-policy

# 2) CORS reflete seu domínio (não "*") nas rotas de API?
curl -sS -D - -o /dev/null -H "Origin: https://evil.example.com" \
  https://uvits-prescritores.vercel.app/api/prescritores | grep -i access-control-allow-origin
```

Outras conferências:
- **Rate limit:** tente fazer login com senha errada ~11 vezes seguidas → a 11ª deve responder `429`.
- **Contador compartilhado:** no **console do Upstash**, após alguns acessos, veja a chave
  `cmdusage:2026-06` (ano-mês atual) crescendo — somando prescritores + Frete.
- **Alerta:** o e-mail só dispara ao cruzar 80% e 95% do limite (1 e-mail por limiar/mês).

---

## 🔁 Atualizações futuras (resumo rápido)

Para qualquer mudança de código daqui pra frente:

```bash
git add -A
git commit -m "feat: descrição da mudança"
git push
```

A Vercel faz o resto. Só volte aos passos 2–3 se mudar **variáveis de ambiente** ou
adicionar um **novo serviço** (banco, Redis, etc.).

---

## 🧯 Se algo der errado

- **Site fora do ar após deploy:** Vercel → Deployments → abra o deploy → **Logs / Functions**
  para ver o erro. É possível dar **Rollback** para o deploy anterior (⋯ → Promote/Rollback).
- **Rate limit não bloqueia:** confira se o Upstash está conectado (passo 2) e se houve
  redeploy (passo 4). Sem Redis, ele cai no fallback em memória (por instância).
- **E-mail de alerta não chega:** confira `RESEND_API_KEY` e se o remetente
  (`FROM_EMAIL`) é um domínio verificado no Resend.
- **CORS ainda `*`:** confira `ALLOWED_ORIGIN` (https, sem barra) e redeploy.

---

## 📌 Pendências conhecidas (backlog)
- Otimizar o Redis na **API de Frete** (validar HMAC antes do rate limit, `fixedWindow`
  + `ephemeralCache`, amostragem, contagem real de comandos). Não afeta este projeto.
