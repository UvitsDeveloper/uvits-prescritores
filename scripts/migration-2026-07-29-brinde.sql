-- ============================================================
--  Migração — coluna própria pra "brinde dado" (antes só vivia em
--  dados_migracao.brinde_legado, congelado, pros 51 registros da
--  migração da planilha legada). Agora vira campo editável real,
--  disponível pra qualquer prescritor, com um backfill de uma vez só
--  pros registros já migrados.
--  Executar uma vez no Vercel Postgres via: vercel postgres query
-- ============================================================

ALTER TABLE prescritores
  ADD COLUMN IF NOT EXISTS brinde VARCHAR(200);

-- Backfill não-destrutivo: só preenche quando ainda vazio, nunca
-- sobrescreve um valor já existente.
UPDATE prescritores
SET brinde = dados_migracao->>'brinde_legado'
WHERE brinde IS NULL
  AND dados_migracao->>'brinde_legado' IS NOT NULL
  AND dados_migracao->>'brinde_legado' <> '';
