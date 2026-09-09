-- Migration number: 0035    2026-09-09
-- Recordatorios: la insistencia pasa de horas a minutos, para poder avisar
-- cada 5/10/15 minutos en casos que no aguantan una hora (ej. una pastilla).
-- Los valores existentes se convierten (horas * 60) para no perder el ajuste
-- de nadie.

ALTER TABLE reminders ADD COLUMN repetir_minutos INTEGER
  CHECK (repetir_minutos IS NULL OR repetir_minutos BETWEEN 5 AND 1440);

UPDATE reminders SET repetir_minutos = repetir_horas * 60 WHERE repetir_horas IS NOT NULL;

ALTER TABLE reminders DROP COLUMN repetir_horas;

UPDATE notification_settings
  SET clave = 'recordatorios_repetir_minutos', valor = CAST(CAST(valor AS INTEGER) * 60 AS TEXT)
  WHERE clave = 'recordatorios_repetir_horas';
