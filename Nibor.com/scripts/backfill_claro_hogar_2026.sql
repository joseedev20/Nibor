-- Histórico Claro Hogar (subscription_id 69, categoría 4 Internet) — últimos 6
-- pagos reales de la app Mi Claro (captura del usuario, 2026-07-05).
-- Nota: marzo no tuvo pago y abril tuvo dos (ajuste + factura); se registran tal cual.
-- Idempotente por (fijo, fecha, monto).
-- Aplicar local: npx wrangler d1 execute nibor-finanzas --local --file scripts/backfill_claro_hogar_2026.sql

INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-01-21', 'gasto', 4, 'Claro Hogar', 129651, 69
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 69 AND fecha = '2026-01-21' AND monto = 129651);

INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-02-25', 'gasto', 4, 'Claro Hogar', 129651, 69
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 69 AND fecha = '2026-02-25' AND monto = 129651);

INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-02', 'gasto', 4, 'Claro Hogar', 89837, 69
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 69 AND fecha = '2026-04-02' AND monto = 89837);

INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-04-26', 'gasto', 4, 'Claro Hogar (ajuste)', 4022, 69
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 69 AND fecha = '2026-04-26' AND monto = 4022);

INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-05-07', 'gasto', 4, 'Claro Hogar', 183696, 69
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 69 AND fecha = '2026-05-07' AND monto = 183696);

INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
SELECT '2026-06-02', 'gasto', 4, 'Claro Hogar', 183696, 69
WHERE NOT EXISTS (SELECT 1 FROM movements WHERE subscription_id = 69 AND fecha = '2026-06-02' AND monto = 183696);
