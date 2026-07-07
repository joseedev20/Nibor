-- Histórico de fijos Ene–Jun 2026 (datos confirmados por el usuario el 2026-07-05):
--   Salario $7.008.700 desde enero (día 30)
--   Arriendo: enero $1.750.000 (arriendo anterior), feb–jun $1.650.000 (día 1)
--   Parqueadero de moto $39.000 desde enero (día 30)
-- Idempotente: cada insert verifica que el fijo no tenga ya movimiento en ese mes.
-- IDs: 11=Salario (cat 11), 14=Arriendo (cat 1), 15=Parqueadero de moto (cat 1)
-- Aplicar local:  npx wrangler d1 execute nibor-finanzas --local --file scripts/backfill_fijos_2026.sql

-- Salario (día 30; febrero se ajusta al 28)
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-30', 'ingreso', 11, 'Salario', 7008700, 11
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 11 AND fecha BETWEEN '2026-01-01' AND '2026-01-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-28', 'ingreso', 11, 'Salario', 7008700, 11
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 11 AND fecha BETWEEN '2026-02-01' AND '2026-02-28');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-03-30', 'ingreso', 11, 'Salario', 7008700, 11
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 11 AND fecha BETWEEN '2026-03-01' AND '2026-03-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-30', 'ingreso', 11, 'Salario', 7008700, 11
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 11 AND fecha BETWEEN '2026-04-01' AND '2026-04-30');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-30', 'ingreso', 11, 'Salario', 7008700, 11
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 11 AND fecha BETWEEN '2026-05-01' AND '2026-05-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-30', 'ingreso', 11, 'Salario', 7008700, 11
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 11 AND fecha BETWEEN '2026-06-01' AND '2026-06-30');

-- Arriendo (día 1; enero con el valor del arriendo anterior)
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-01', 'gasto', 1, 'Arriendo (anterior)', 1750000, 14
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 14 AND fecha BETWEEN '2026-01-01' AND '2026-01-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-01', 'gasto', 1, 'Arriendo', 1650000, 14
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 14 AND fecha BETWEEN '2026-02-01' AND '2026-02-28');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-03-01', 'gasto', 1, 'Arriendo', 1650000, 14
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 14 AND fecha BETWEEN '2026-03-01' AND '2026-03-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-01', 'gasto', 1, 'Arriendo', 1650000, 14
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 14 AND fecha BETWEEN '2026-04-01' AND '2026-04-30');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-01', 'gasto', 1, 'Arriendo', 1650000, 14
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 14 AND fecha BETWEEN '2026-05-01' AND '2026-05-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-01', 'gasto', 1, 'Arriendo', 1650000, 14
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 14 AND fecha BETWEEN '2026-06-01' AND '2026-06-30');

-- Parqueadero de moto (día 30; febrero al 28)
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-30', 'gasto', 1, 'Parqueadero de moto', 39000, 15
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 15 AND fecha BETWEEN '2026-01-01' AND '2026-01-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-28', 'gasto', 1, 'Parqueadero de moto', 39000, 15
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 15 AND fecha BETWEEN '2026-02-01' AND '2026-02-28');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-03-30', 'gasto', 1, 'Parqueadero de moto', 39000, 15
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 15 AND fecha BETWEEN '2026-03-01' AND '2026-03-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-30', 'gasto', 1, 'Parqueadero de moto', 39000, 15
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 15 AND fecha BETWEEN '2026-04-01' AND '2026-04-30');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-30', 'gasto', 1, 'Parqueadero de moto', 39000, 15
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 15 AND fecha BETWEEN '2026-05-01' AND '2026-05-31');
INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-30', 'gasto', 1, 'Parqueadero de moto', 39000, 15
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 15 AND fecha BETWEEN '2026-06-01' AND '2026-06-30');
