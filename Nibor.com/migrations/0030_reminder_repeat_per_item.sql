-- Migration number: 0030    2026-07-18
-- Recordatorios: insistencia propia por recordatorio (en horas).
-- NULL = usa el ajuste general recordatorios_repetir_horas.

ALTER TABLE reminders ADD COLUMN repetir_horas INTEGER
  CHECK (repetir_horas IS NULL OR repetir_horas BETWEEN 1 AND 24);
