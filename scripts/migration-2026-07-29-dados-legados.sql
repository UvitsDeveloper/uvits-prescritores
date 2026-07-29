-- ============================================================
--  Migração — suporte a dados legados (planilha de prescritores
--  recrutados via chat antes do sistema existir)
--  Executar uma vez no Vercel Postgres via: vercel postgres query
--  ou diretamente no painel: Storage → banco → Query
-- ============================================================
--
-- email vira opcional: 5 dos 51 registros legados não têm e-mail
-- nenhum na fonte original — inventar um e-mail pra satisfazer a
-- constraint seria pior do que aceitar a ausência. O índice único
-- em email já tolera múltiplos NULL nativamente no Postgres (NULL
-- nunca é igual a NULL), então nenhuma outra mudança é necessária
-- ali. Nenhum fluxo existente é afetado: o formulário público
-- (api/cadastro.js) já exige e-mail antes de inserir.
ALTER TABLE prescritores
  ALTER COLUMN email DROP NOT NULL;

-- id_legado: chave de reexecução idempotente da migração (ex.
-- 'UVITS-0001') — permite rodar o script de novo sem duplicar
-- ninguém. linha_origem_planilha: rastreabilidade até a aba
-- "Importação Uvits" da planilha original, pra auditoria.
ALTER TABLE prescritores
  ADD COLUMN IF NOT EXISTS id_legado             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS linha_origem_planilha INT,
  ADD COLUMN IF NOT EXISTS data_nascimento       DATE,
  ADD COLUMN IF NOT EXISTS instagram             VARCHAR(150),
  ADD COLUMN IF NOT EXISTS endereco              TEXT,
  ADD COLUMN IF NOT EXISTS dados_migracao        JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_prescritores_id_legado
  ON prescritores (id_legado) WHERE id_legado IS NOT NULL;

-- dados_migracao guarda o que não virou coluna própria (histórico,
-- não dado operacional): brinde_legado, cupom_legado ("OK" é só um
-- indicador histórico, nunca um código de cupom de verdade),
-- enviado_legado, e observações — ex. o valor bruto original da
-- data de nascimento quando corrompido na planilha.
