-- Migration number: 0006    2026-07-04
-- Suscripciones en moneda extranjera: permite guardar USD y estimar COP.

ALTER TABLE subscriptions
ADD COLUMN moneda TEXT NOT NULL DEFAULT 'COP' CHECK (moneda IN ('COP', 'USD'));

ALTER TABLE subscriptions
ADD COLUMN monto_original REAL NOT NULL DEFAULT 0 CHECK (monto_original >= 0);

ALTER TABLE subscriptions
ADD COLUMN tasa_cambio REAL CHECK (tasa_cambio IS NULL OR tasa_cambio > 0);

ALTER TABLE subscriptions
ADD COLUMN margen_tasa_pct REAL NOT NULL DEFAULT 0 CHECK (margen_tasa_pct >= 0);

ALTER TABLE subscriptions
ADD COLUMN tasa_cambio_fecha TEXT;

UPDATE subscriptions
SET monto_original = monto
WHERE monto_original = 0;
