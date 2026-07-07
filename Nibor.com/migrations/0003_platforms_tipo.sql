-- Migration number: 0003 	 2026-07-04
-- Tipos de plataforma: 'inversion' (Binance, Nubank…) vs 'fondo' (ahorro
-- obligatorio: cesantías, pensión). Ambos suman al patrimonio, pero el
-- dashboard los muestra por separado.

ALTER TABLE platforms ADD COLUMN tipo TEXT NOT NULL DEFAULT 'inversion';

UPDATE platforms SET tipo = 'fondo' WHERE nombre IN ('Cesantías', 'Pensión Obligatoria');
