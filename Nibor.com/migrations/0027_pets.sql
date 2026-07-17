-- Migration number: 0027    2026-07-17
-- Nibor Bansky (mascotas): perfil, vacunas y gastos integrados a movements.
-- No incluir datos reales de la mascota aquí; el perfil se crea por UI/API.

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  especie TEXT NOT NULL DEFAULT 'perro' CHECK (especie IN ('perro', 'gato', 'otro')),
  raza TEXT,
  sexo TEXT CHECK (sexo IN ('macho', 'hembra')),
  fecha_nacimiento TEXT,
  color TEXT,
  microchip TEXT,
  notas TEXT,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vacunas y aplicaciones (desparasitación, etc.). proxima_dosis NULL = dosis
-- única; el estado (al_dia / proxima / vencida / aplicada) se calcula en backend.
CREATE TABLE IF NOT EXISTS pet_vaccines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  fecha TEXT NOT NULL,
  proxima_dosis TEXT,
  veterinaria TEXT,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pet_vaccines_pet ON pet_vaccines (pet_id, proxima_dosis);

-- Gastos de mascota viven en movements (una sola fuente de verdad financiera)
ALTER TABLE movements ADD COLUMN pet_id INTEGER REFERENCES pets(id);

INSERT INTO categories (nombre, tipo, icono)
SELECT 'Mascotas', 'gasto', '🐾'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE nombre = 'Mascotas' AND tipo = 'gasto');
