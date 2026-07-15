-- Migration number: 0023     2026-07-15
-- Tarjeta de propiedad permanente por vehículo y licencia de conducción
-- independiente con un PDF y varias categorías/vencimientos.

ALTER TABLE vehicle_items
ADD COLUMN requiere_vencimiento INTEGER NOT NULL DEFAULT 1
CHECK (requiere_vencimiento IN (0, 1));

UPDATE vehicle_items
SET requiere_vencimiento = 0, vence = NULL
WHERE lower(trim(nombre)) = 'tarjeta de propiedad';

INSERT INTO vehicle_items (vehicle_id, nombre, requiere_vencimiento)
SELECT v.id, 'Tarjeta de propiedad', 0
FROM vehicles v
WHERE NOT EXISTS (
  SELECT 1
  FROM vehicle_items i
  WHERE i.vehicle_id = v.id AND lower(i.nombre) = 'tarjeta de propiedad'
);

CREATE TABLE IF NOT EXISTS driver_licenses (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  notas TEXT,
  file_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO driver_licenses (id) VALUES (1);

CREATE TABLE IF NOT EXISTS driver_license_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL DEFAULT 1 REFERENCES driver_licenses(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  vence TEXT NOT NULL,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (license_id, categoria)
);

CREATE INDEX IF NOT EXISTS idx_driver_license_categories_expiry
ON driver_license_categories (vence);
