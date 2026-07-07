-- Datos históricos 2026 (Enero–Julio) tomados del Excel del usuario.
-- Idempotente: INSERT OR IGNORE/UPSERT respeta UNIQUE(platform_id, anio, mes).
-- Aplicar local:  npx wrangler d1 execute nibor-finanzas --local --file scripts/seed_historicos.sql
-- Aplicar remoto: npx wrangler d1 execute nibor-finanzas --remote --file scripts/seed_historicos.sql
-- Plataformas: 1=Binance, 2=Colfondos, 3=Nubank, 4=Happi

-- Binance
INSERT OR IGNORE INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final) VALUES
  (1, 2026, 1, 4048013.73, 300000.00, 0, 3419462.69),
  (1, 2026, 2, 3419462.69, 500000.00, 0, 3449276.98),
  (1, 2026, 3, 3449276.98, 0,         0, 4036283.37),
  (1, 2026, 4, 4036283.37, 400000.00, 0, 4097676.37),
  (1, 2026, 5, 4097676.37, 0,         0, 5120780.08),
  (1, 2026, 6, 5120780.08, 0,         0, 3532204.47),
  (1, 2026, 7, 3532204.47, 0,         0, NULL); -- julio pendiente

-- Colfondos
INSERT OR IGNORE INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final) VALUES
  (2, 2026, 1, 4101985.68, 0,          0, 4086749.24),
  (2, 2026, 2, 4086749.24, 700000.00,  0, 4778700.54),
  (2, 2026, 3, 4778700.54, 0,          0, 4782381.11),
  (2, 2026, 4, 4782381.11, 600000.00,  0, 5435948.34),
  (2, 2026, 5, 5435948.34, 600000.00,  0, 6084195.09),
  (2, 2026, 6, 6084195.09, 600000.00,  0, 6752681.08),
  (2, 2026, 7, 6752681.08, 1000000.00, 0, NULL); -- julio pendiente

-- Nubank
INSERT OR IGNORE INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final) VALUES
  (3, 2026, 1, 5591230.42, 500000.00, 0, 6133370.94),
  (3, 2026, 2, 6133370.94, 525475.61, 0, 6703854.55),
  (3, 2026, 3, 6703854.55, 590412.83, 0, 7347500.34),
  (3, 2026, 4, 7347500.34, 652499.66, 0, 8057573.24),
  (3, 2026, 5, 8057573.24, 304986.47, 0, 8425814.10),
  (3, 2026, 6, 8425814.10, 574185.90, 0, 9071398.59),
  (3, 2026, 7, 9071398.59, 700033.34, 0, NULL); -- julio pendiente

-- Happi: datos de la captura entregada por el usuario.
-- Julio conserva saldo_final NULL porque sigue pendiente; el 0 del Excel no se importa como cierre.
INSERT INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final) VALUES
  (4, 2026, 1, 1505323.56, 317036.00, 0, 2157525.80),
  (4, 2026, 2, 2157525.80, 569730.00, 0, 2839318.39),
  (4, 2026, 3, 2839318.39, 392192.00, 0, 2849059.50),
  (4, 2026, 4, 2849059.50, 382816.00, 0, 3480367.40),
  (4, 2026, 5, 3480367.40, 0,         0, 3925069.56),
  (4, 2026, 6, 3925069.56, 481860.00, 0, 5109871.80),
  (4, 2026, 7, 5109871.80, 877266.00, 0, NULL) -- julio pendiente
ON CONFLICT(platform_id, anio, mes) DO UPDATE SET
  saldo_inicial = excluded.saldo_inicial,
  aporte = excluded.aporte,
  retiros = excluded.retiros,
  saldo_final = excluded.saldo_final;

-- Cesantías y Pensión Obligatoria (Colfondos): ids explícitos para que el seed
-- remoto coincida con la base local (el id 5 quedó quemado por un autoincrement local).
INSERT OR IGNORE INTO platforms (id, nombre, color, orden, tipo) VALUES
  (6, 'Cesantías',           '#0891B2', 5, 'fondo'),
  (7, 'Pensión Obligatoria', '#1D4ED8', 6, 'fondo');

-- Saldos conocidos a julio 2026 (capturas del usuario); julio pendiente.
INSERT OR IGNORE INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final) VALUES
  (6, 2026, 7, 19431513.40, 0, 0, NULL),
  (7, 2026, 7, 48197407.42, 0, 0, NULL);
