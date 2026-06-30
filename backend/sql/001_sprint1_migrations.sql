-- ============================================================
-- Sprint 1 — Migrations
-- Rodar uma vez no banco antes de iniciar a Sprint 1
-- ============================================================

-- 1. Justificativa no histórico de status
ALTER TABLE pgd_acao_status
  ADD COLUMN IF NOT EXISTS justificativa TEXT;

-- 2. Tabela de comprovação principal
CREATE TABLE IF NOT EXISTS pgd_acao_comprovacao (
  comprovacao_id         SERIAL PRIMARY KEY,
  acao_id                INT     NOT NULL REFERENCES pgd_acao(acao_id),
  vlr_investido_ar       NUMERIC(15,2),
  vlr_investido_forn     NUMERIC(15,2),
  sem_vlr_investido_ar   BOOLEAN NOT NULL DEFAULT FALSE,
  sem_vlr_investido_forn BOOLEAN NOT NULL DEFAULT FALSE,
  publico_realizado      INT,
  obs                    TEXT,
  atividade_justificativa TEXT,
  usuario                VARCHAR(50) NOT NULL,
  dt_comprovacao         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_comprovacao_acao UNIQUE (acao_id)
);

-- 3. Fotos da comprovação
CREATE TABLE IF NOT EXISTS pgd_acao_foto (
  foto_id    SERIAL PRIMARY KEY,
  acao_id    INT         NOT NULL REFERENCES pgd_acao(acao_id),
  tipo       VARCHAR(50) NOT NULL,  -- 'lista_presenca_1/2/3' | 'rel_desenv_lavoura'
  filename   VARCHAR(255) NOT NULL,
  filepath   TEXT        NOT NULL,
  usuario    VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Corrigir conflito de ordem no pgd_status (dois itens com ordem=10)
UPDATE pgd_status SET ordem = 10 WHERE status_id = 15; -- INFO PENDENTES
UPDATE pgd_status SET ordem = 11 WHERE status_id = 11; -- FINALIZADA - ESTÁ PAGO

-- 5. Garantir exibe_lista no status 15
UPDATE pgd_status SET exibe_lista = 'S' WHERE status_id = 15 AND (exibe_lista IS NULL OR exibe_lista = '');

-- Verificar resultado
SELECT status_id, nome, ativo, ordem, exibe_lista
FROM pgd_status
ORDER BY ordem;
