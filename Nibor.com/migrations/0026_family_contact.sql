-- Migration number: 0026    2026-07-15
-- Nibor Familiar: teléfono y dirección opcionales por familiar.
-- Nunca incluir datos de contacto reales en esta migración.

ALTER TABLE family_members ADD COLUMN telefono TEXT;
ALTER TABLE family_members ADD COLUMN direccion TEXT;
