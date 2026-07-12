-- Migration number: 0022    2026-07-12
-- Nibor Familiar: directorio privado e identificaciones con PDF en R2.
-- Nunca incluir datos familiares reales en esta migración.

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  parentesco TEXT NOT NULL,
  tipo_documento TEXT NOT NULL DEFAULT 'cedula_ciudadania'
    CHECK (tipo_documento IN ('cedula_ciudadania', 'tarjeta_identidad', 'cedula_extranjeria', 'pasaporte', 'registro_civil', 'otro')),
  numero_documento TEXT NOT NULL,
  notas TEXT,
  file_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_family_members_parentesco_nombre
  ON family_members (parentesco, nombre);
