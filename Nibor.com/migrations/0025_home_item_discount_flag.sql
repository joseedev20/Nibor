-- Migration number: 0025    2026-07-15
-- Nibor Casa: el descuento por pronto pago puede aplicar solo a algunos
-- conceptos (ej. solo Administración, no Parqueadero ni Retroactivo).
-- 1 = el porcentaje de descuento del periodo aplica a este concepto.

ALTER TABLE home_administration_items ADD COLUMN aplica_descuento INTEGER NOT NULL DEFAULT 1;
