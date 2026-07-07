-- Migration number: 0004 	 2026-07-04
-- Notas por mes (equivale a la columna "Observaciones" del Excel).
-- Los retiros a mitad de mes exigen motivo y se registran aquí.

ALTER TABLE snapshots ADD COLUMN notas TEXT;
