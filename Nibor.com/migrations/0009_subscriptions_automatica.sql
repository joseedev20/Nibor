-- Migration number: 0009 	 2026-07-05
-- Débito automático vs pago manual. Las manuales (automatica = 0) generan
-- recordatorio mientras no tengan movimiento aplicado en el mes en curso.

ALTER TABLE subscriptions ADD COLUMN automatica INTEGER NOT NULL DEFAULT 1;
