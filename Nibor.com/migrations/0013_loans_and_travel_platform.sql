-- Migration number: 0013    2026-07-07
-- Prestamos personales y plataforma de ahorro para viajes.

INSERT INTO platforms (nombre, color, orden, activa, tipo)
SELECT 'Viajes', '#0EA5E9', COALESCE((SELECT MAX(orden) FROM platforms), 0) + 1, 1, 'inversion'
WHERE NOT EXISTS (SELECT 1 FROM platforms WHERE lower(nombre) = 'viajes');

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona TEXT NOT NULL,
  monto REAL NOT NULL CHECK (monto >= 0),
  fecha_prestamo TEXT NOT NULL,
  fecha_devolucion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'devuelto')),
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_prestamo)
);

CREATE INDEX IF NOT EXISTS idx_loans_estado ON loans (estado);
CREATE INDEX IF NOT EXISTS idx_loans_fecha_prestamo ON loans (fecha_prestamo);
