# Uvits Pro Prescritor — Landing Page

Landing page institucional do programa de prescritores da **Uvits Vitaminas**, com formulário de cadastro e disparo automático de e-mails de confirmação via [Resend](https://resend.com).

---

## Índice

- [Visão geral](#visão-geral)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Pré-requisitos](#pré-requisitos)
- [Instalação e execução local](#instalação-e-execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Deploy no Vercel](#deploy-no-vercel)
- [Fluxo de envio de e-mails](#fluxo-de-envio-de-e-mails)
- [Configuração do domínio no Resend](#configuração-do-domínio-no-resend)
- [Personalização](#personalização)
- [Problemas comuns](#problemas-comuns)

---

## Visão geral

O projeto consiste em uma página estática (`public/index.html`) servida pelo Vercel, com uma API serverless (`api/cadastro.js`) responsável por:

1. Receber os dados do formulário via `POST /api/cadastro`
2. Enviar um **e-mail de confirmação** para o profissional de saúde que se cadastrou
3. Enviar um **e-mail de aviso** para a equipe Uvits com os dados do novo cadastro

Toda a lógica de envio utiliza o serviço [Resend](https://resend.com), o mesmo já utilizado no projeto de frete da Uvits.

---

## Estrutura do projeto

```
prescritores/
├── api/
│   └── cadastro.js         # Serverless function — processa o form e envia os e-mails
├── public/
│   └── index.html          # Landing page completa (HTML + CSS + JS inline)
├── .env.example            # Modelo das variáveis de ambiente necessárias
├── package.json            # Dependências do projeto (Resend SDK)
├── vercel.json             # Configuração de rotas do Vercel
└── README.md               # Este arquivo
```

### Detalhamento dos arquivos

| Arquivo | Função |
|---|---|
| `api/cadastro.js` | Serverless function Node.js. Recebe o POST do formulário, valida os campos obrigatórios e dispara dois e-mails via Resend SDK. |
| `public/index.html` | Página completa autocontida: hero, seção sobre o programa, quem pode participar, benefícios, formulário, manifesto e barra de confiança. CSS e JS estão inline para simplificar o deploy. |
| `vercel.json` | Garante que requisições para `/api/*` sejam roteadas para as serverless functions, e o restante sirva os arquivos estáticos de `public/`. |
| `.env.example` | Documento de referência das variáveis de ambiente. **Nunca commitar o `.env` real no repositório.** |

---

## Pré-requisitos

- [Node.js](https://nodejs.org) v18 ou superior
- [Vercel CLI](https://vercel.com/docs/cli) instalado globalmente
- Conta no [Resend](https://resend.com) com domínio verificado
- Conta no [Vercel](https://vercel.com) conectada ao GitHub

---

## Instalação e execução local

**1. Clone o repositório**
```bash
git clone https://github.com/uvits-projects/prescritores.git
cd prescritores
```

**2. Instale as dependências**
```bash
npm install
```

**3. Configure as variáveis de ambiente**
```bash
cp .env.example .env
```
Edite o arquivo `.env` com os valores reais (veja a seção [Variáveis de ambiente](#variáveis-de-ambiente)).

**4. Inicie o servidor local**
```bash
vercel dev
```

A aplicação estará disponível em `http://localhost:3000`.

> O comando `vercel dev` simula o ambiente de produção do Vercel localmente, incluindo as serverless functions em `/api`.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição | Exemplo |
|---|---|---|---|
| `RESEND_API_KEY` | ✅ Sim | Chave de API do Resend | `re_xxxxxxxxxxxxxxxx` |
| `FROM_EMAIL` | ✅ Sim | E-mail remetente (deve ser de domínio verificado no Resend) | `contato@uvits.com.br` |
| `FROM_NAME` | Não | Nome exibido como remetente | `Uvits Pro Prescritor` |
| `TO_EMAIL` | ✅ Sim | E-mail da equipe Uvits que receberá os avisos de novo cadastro | `contato@uvits.com.br` |

### No Vercel (produção)

Acesse **Project → Settings → Environment Variables** e cadastre cada variável acima.

### Localmente

Crie o arquivo `.env` na raiz do projeto (nunca commitar):
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
FROM_EMAIL=contato@uvits.com.br
FROM_NAME=Uvits Pro Prescritor
TO_EMAIL=contato@uvits.com.br
```

> **Dica para testes sem domínio verificado:** use `FROM_EMAIL=onboarding@resend.dev`, um domínio de sandbox disponível em todas as contas Resend. Lembre de trocar antes de ir ao ar.

---

## Deploy no Vercel

**1. Suba o projeto para o GitHub**
```bash
git init
git add .
git commit -m "feat: landing page prescritores"
git remote add origin https://github.com/uvits-projects/prescritores.git
git push -u origin main
```

**2. Importe no Vercel**
- Acesse [vercel.com/new](https://vercel.com/new)
- Selecione o repositório
- Framework Preset: **Other**
- Root Directory: deixe em branco (raiz)
- Clique em **Deploy**

**3. Configure as variáveis de ambiente**
- Vá em **Settings → Environment Variables**
- Cadastre todas as variáveis listadas acima
- Acione um novo deploy em **Deployments → Redeploy**

**4. (Opcional) Domínio customizado**
- **Settings → Domains → Add**
- Insira `prescritores.uvits.com.br`
- Adicione o registro CNAME no seu provedor DNS:
  ```
  Tipo:  CNAME
  Nome:  prescritores
  Valor: cname.vercel-dns.com
  ```

---

## Fluxo de envio de e-mails

```
Usuário preenche o formulário
        │
        ▼
POST /api/cadastro
        │
        ├─► E-mail para o PROFISSIONAL
        │     • Confirmação de recebimento
        │     • Resumo dos dados enviados
        │     • Prazo de resposta (24h úteis)
        │
        └─► E-mail para a UVITS (TO_EMAIL)
              • Dados completos do cadastro
              • Nome, e-mail, WhatsApp, profissão, conselho
              • Data/hora do cadastro (fuso São Paulo)
```

### Campos do formulário

| Campo | Obrigatório | Tipo |
|---|---|---|
| Nome completo | ✅ Sim | Texto livre |
| E-mail | ✅ Sim | E-mail válido |
| WhatsApp | Não | Telefone |
| Número do conselho | Não | Texto livre |
| Profissão / Especialidade | Não | Select |

---

## Configuração do domínio no Resend

Para enviar e-mails a partir de `@uvits.com.br`:

1. Acesse [resend.com/domains](https://resend.com/domains)
2. Clique em **Add Domain** → insira `uvits.com.br`
3. Adicione os registros DNS fornecidos no seu provedor (Registro.br, Cloudflare, etc.):
   - **SPF** — registro TXT na raiz do domínio
   - **DKIM** — registro TXT com prefixo `resend._domainkey`
   - **DMARC** — registro TXT `_dmarc` (recomendado)
4. Clique em **Verify Domain**
5. A verificação pode levar até 48h dependendo do TTL do DNS

> ⚠️ Sem o domínio verificado, o Resend retorna erro `403 — Domain not verified` e nenhum e-mail é enviado.

---

## Personalização

### Textos e conteúdo
Todos os textos estão diretamente em `public/index.html`. Busque pelas seções comentadas (`<!-- HERO -->`, `<!-- INTRO -->`, etc.) para localizar o que deseja alterar.

### Cores
As variáveis CSS estão no topo do `<style>` em `public/index.html`:
```css
:root {
  --primary:  #2EC4A5;  /* teal principal */
  --dark:     #1C2620;  /* verde escuro */
  --cream:    #F5F1EC;  /* fundo creme */
  --border:   #E8E3DD;  /* bordas */
  --text:     #5a6b5e;  /* texto secundário */
}
```

### Campos do formulário
Para adicionar ou remover campos, edite:
1. O HTML do formulário em `public/index.html` (seção `<!-- FORMULÁRIO -->`)
2. A desestruturação no início de `api/cadastro.js`:
   ```js
   const { nome, email, whatsapp, profissao, conselho } = req.body;
   ```
3. Os templates de e-mail dentro de `api/cadastro.js`

### E-mail de destino
Altere a variável `TO_EMAIL` nas configurações de ambiente — sem necessidade de alterar código.

---

## Problemas comuns

| Erro | Causa | Solução |
|---|---|---|
| `403 Domain not verified` | Domínio remetente não verificado no Resend | Verificar domínio em resend.com/domains ou usar `onboarding@resend.dev` para testes |
| `404` na rota `/api/cadastro` | Serverless function não encontrada | Confirmar que o arquivo está em `api/cadastro.js` (raiz do projeto) e que o Vercel foi reimplantado |
| Formulário sem resposta | Erro silencioso no JS | Abrir DevTools → aba Network → verificar a requisição POST e o status retornado |
| E-mail não chega | Filtro de spam ou domínio incorreto | Verificar logs em resend.com/logs e checar pasta de spam |
| `vercel dev` não funciona | Vercel CLI não instalado | Executar `npm install -g vercel` e fazer login com `vercel login` |

---

## Tecnologias utilizadas

- **Frontend:** HTML5, CSS3 (variáveis CSS, Grid, Flexbox), JavaScript vanilla
- **Backend:** Node.js (Serverless Functions via Vercel)
- **E-mail:** [Resend](https://resend.com) SDK v3
- **Hospedagem:** [Vercel](https://vercel.com)

---

## Licença

Uso interno — Uvits Vitaminas. Todos os direitos reservados.
