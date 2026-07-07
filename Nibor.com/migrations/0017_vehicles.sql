-- Migration number: 0017 	 2026-07-06
-- Nibor Vehículos: carro/moto con vencimientos (SOAT, tecnomecánica…),
-- documentos PDF en R2 y gastos integrados a movements.

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'carro' CHECK (tipo IN ('carro', 'moto', 'otro')),
  placa TEXT,
  color TEXT NOT NULL DEFAULT '#2563eb',
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,          -- SOAT, Tecnomecánica, Seguro todo riesgo…
  vence TEXT,                    -- YYYY-MM-DD (NULL = por configurar)
  notas TEXT,
  file_key TEXT,                 -- clave en R2 del PDF adjunto
  file_name TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_items_vehicle ON vehicle_items (vehicle_id, vence);

-- Gastos de vehículo viven en movements (una sola fuente de verdad financiera)
ALTER TABLE movements ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id);

INSERT INTO categories (nombre, tipo, icono)
SELECT 'Vehículos', 'gasto', '🚗'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE nombre = 'Vehículos' AND tipo = 'gasto');
