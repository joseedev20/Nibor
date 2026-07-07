-- Histórico Ene–Jun 2026 con valor actual (confirmado por el usuario 2026-07-05):
--   YouTube Premium $41.900 día 7 (id 65, cat 9)
--   Google One $44.900 día 18 (id 66, cat 9)
--   Claro Celular $47.299,50 día 26 (id 68, cat 4)
-- Idempotente: no inserta si el fijo ya tiene movimiento en ese mes.
-- Aplicar local: npx wrangler d1 execute nibor-finanzas --local --file scripts/backfill_suscripciones_2026.sql

-- YouTube Premium (día 7)
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-07', 'gasto', 9, 'Youtube Premium', 41900, 65
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 65 AND fecha BETWEEN '2026-01-01' AND '2026-01-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-07', 'gasto', 9, 'Youtube Premium', 41900, 65
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 65 AND fecha BETWEEN '2026-02-01' AND '2026-02-28');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-03-07', 'gasto', 9, 'Youtube Premium', 41900, 65
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 65 AND fecha BETWEEN '2026-03-01' AND '2026-03-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-07', 'gasto', 9, 'Youtube Premium', 41900, 65
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 65 AND fecha BETWEEN '2026-04-01' AND '2026-04-30');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-07', 'gasto', 9, 'Youtube Premium', 41900, 65
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 65 AND fecha BETWEEN '2026-05-01' AND '2026-05-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-07', 'gasto', 9, 'Youtube Premium', 41900, 65
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 65 AND fecha BETWEEN '2026-06-01' AND '2026-06-30');

-- Google One (día 18)
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-18', 'gasto', 9, 'Google One', 44900, 66
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 66 AND fecha BETWEEN '2026-01-01' AND '2026-01-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-18', 'gasto', 9, 'Google One', 44900, 66
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 66 AND fecha BETWEEN '2026-02-01' AND '2026-02-28');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-03-18', 'gasto', 9, 'Google One', 44900, 66
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 66 AND fecha BETWEEN '2026-03-01' AND '2026-03-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-18', 'gasto', 9, 'Google One', 44900, 66
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 66 AND fecha BETWEEN '2026-04-01' AND '2026-04-30');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-18', 'gasto', 9, 'Google One', 44900, 66
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 66 AND fecha BETWEEN '2026-05-01' AND '2026-05-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-18', 'gasto', 9, 'Google One', 44900, 66
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 66 AND fecha BETWEEN '2026-06-01' AND '2026-06-30');

-- Claro Celular (día 26)
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-26', 'gasto', 4, 'Claro Celular', 47299.5, 68
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 68 AND fecha BETWEEN '2026-01-01' AND '2026-01-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-26', 'gasto', 4, 'Claro Celular', 47299.5, 68
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 68 AND fecha BETWEEN '2026-02-01' AND '2026-02-28');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-03-26', 'gasto', 4, 'Claro Celular', 47299.5, 68
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 68 AND fecha BETWEEN '2026-03-01' AND '2026-03-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-26', 'gasto', 4, 'Claro Celular', 47299.5, 68
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 68 AND fecha BETWEEN '2026-04-01' AND '2026-04-30');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-26', 'gasto', 4, 'Claro Celular', 47299.5, 68
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 68 AND fecha BETWEEN '2026-05-01' AND '2026-05-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-26', 'gasto', 4, 'Claro Celular', 47299.5, 68
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 68 AND fecha BETWEEN '2026-06-01' AND '2026-06-30');
