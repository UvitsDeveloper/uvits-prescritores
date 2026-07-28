-- ============================================================
--  Uvits Pro Prescritor — Schema do banco de dados
--  Executar no Vercel Postgres via: vercel postgres query
--  ou diretamente no painel: Storage → seu banco → Query
-- ============================================================

-- Tabela de usuários do painel administrativo
CREATE TABLE IF NOT EXISTS usuarios (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(120)        NOT NULL,
  email      VARCHAR(254) UNIQUE NOT NULL,
  senha_hash VARCHAR(255)        NOT NULL,
  criado_em  TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Tabela de cadastros de prescritores
--
-- Modelo de status (regras de negócio definidas na especificação funcional
-- do programa, 2026-07-28) — substitui o modelo antigo de 4 status
-- (aguardando_contato/contato_realizado/aprovado/reprovado):
--   pendente      cadastro recebido (formulário público ou manual), aguardando revisão
--   pendente_cpf  dados profissionais já conferidos, falta CPF
--   aprovado      CPF preenchido, administrador confirmou explicitamente
--   ativo         aprovado + tag "prescritor" na Shopify + cupom de indicação criado
--   reprovado     não atende às regras do programa
--   suspenso      ativo com cupom/benefícios removidos temporariamente (ação mínima)
--   inativo       tag leve de referência — participação encerrada, reversível
--
-- O CPF NÃO é armazenado nesta tabela: fica exclusivamente como metafield no
-- cliente Shopify correspondente (fonte única, evita duplicação de dado
-- sensível sob a LGPD) — ver shopify_customer_id abaixo. cpf_confirmado é só
-- uma flag booleana (nunca o valor) indicando que o metafield já foi gravado
-- com sucesso — usada pra não exigir o CPF de novo numa segunda tentativa de
-- aprovação (ver api/prescritores.js, PATCH).
CREATE TABLE IF NOT EXISTS prescritores (
  id                  SERIAL PRIMARY KEY,
  nome                VARCHAR(120)  NOT NULL,
  email               VARCHAR(254)  NOT NULL,
  whatsapp            VARCHAR(30),
  profissao           VARCHAR(60),
  conselho            VARCHAR(60),
  email_enviado       BOOLEAN       NOT NULL DEFAULT FALSE,
  status              VARCHAR(30)   NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','pendente_cpf','aprovado','ativo','reprovado','suspenso','inativo')),
  shopify_customer_id VARCHAR(60),
  cpf_confirmado      BOOLEAN       NOT NULL DEFAULT FALSE,
  origem              VARCHAR(20)   NOT NULL DEFAULT 'formulario'
                        CHECK (origem IN ('formulario','manual','importado')),
  notas               TEXT,
  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prescritores_status              ON prescritores (status);
CREATE INDEX IF NOT EXISTS idx_prescritores_criado_em           ON prescritores (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_prescritores_shopify_customer_id ON prescritores (shopify_customer_id);

-- Unicidade: um e-mail e um registro de conselho (CRM/CRN) por prescritor
-- (também serve de índice para busca por e-mail). Conselho é gravado em MAIÚSCULAS.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_prescritores_email    ON prescritores (email);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_prescritores_conselho ON prescritores (conselho);

-- Trigger para atualizar automaticamente atualizado_em
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prescritores_atualizado_em
  BEFORE UPDATE ON prescritores
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- ============================================================
--  INSERIR USUÁRIO ADMINISTRADOR
--  Substitua o hash abaixo pelo gerado via: node scripts/hash-senha.js
-- ============================================================
-- INSERT INTO usuarios (nome, email, senha_hash)
-- VALUES ('Sergio', 'contato@uvits.com.br', '$2a$12$HASH_GERADO_AQUI');
