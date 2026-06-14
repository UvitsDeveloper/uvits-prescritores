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
CREATE TABLE IF NOT EXISTS prescritores (
  id              SERIAL PRIMARY KEY,
  nome            VARCHAR(120)  NOT NULL,
  email           VARCHAR(254)  NOT NULL,
  whatsapp        VARCHAR(30),
  profissao       VARCHAR(60),
  conselho        VARCHAR(60),
  email_enviado   BOOLEAN       NOT NULL DEFAULT FALSE,
  status          VARCHAR(30)   NOT NULL DEFAULT 'aguardando_contato'
                    CHECK (status IN ('aguardando_contato','contato_realizado','aprovado','reprovado')),
  notas           TEXT,
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prescritores_status    ON prescritores (status);
CREATE INDEX IF NOT EXISTS idx_prescritores_criado_em ON prescritores (criado_em DESC);

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
