-- Migration number: 0034  2026-07-28
-- Idempotencia para gastos creados desde integraciones externas.

ALTER TABLE movements ADD COLUMN external_source TEXT;
ALTER TABLE movements ADD COLUMN external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_movements_external_request
  ON movements (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
