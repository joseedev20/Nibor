-- Migration number: 0014    2026-07-07
-- Nibor Salud: medidas corporales, condiciones, medicamentos, citas y vision.

CREATE TABLE IF NOT EXISTS health_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  estatura_cm REAL CHECK (estatura_cm IS NULL OR (estatura_cm >= 80 AND estatura_cm <= 250)),
  fecha_nacimiento TEXT,
  sexo TEXT CHECK (sexo IS NULL OR sexo IN ('masculino', 'femenino', 'otro')),
  notas TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS health_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  peso_kg REAL NOT NULL CHECK (peso_kg > 0),
  estatura_cm REAL CHECK (estatura_cm IS NULL OR (estatura_cm >= 80 AND estatura_cm <= 250)),
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_measurements_fecha ON health_measurements (fecha);

CREATE TABLE IF NOT EXISTS health_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'general' CHECK (tipo IN ('general', 'cardiovascular', 'vision', 'respiratorio', 'otro')),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'controlado', 'resuelto')),
  fecha_diagnostico TEXT,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_conditions_estado ON health_conditions (estado);
CREATE INDEX IF NOT EXISTS idx_health_conditions_tipo ON health_conditions (tipo);

CREATE TABLE IF NOT EXISTS health_medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  condition_id INTEGER REFERENCES health_conditions(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  dosis TEXT,
  frecuencia TEXT NOT NULL DEFAULT 'Diaria',
  hora TEXT,
  activa INTEGER NOT NULL DEFAULT 1,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_medications_activa ON health_medications (activa);

CREATE TABLE IF NOT EXISTS health_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_hora TEXT NOT NULL,
  especialidad TEXT NOT NULL,
  profesional TEXT,
  lugar TEXT,
  motivo TEXT,
  estado TEXT NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'asistida', 'cancelada')),
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_appointments_fecha ON health_appointments (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_health_appointments_estado ON health_appointments (estado);

CREATE TABLE IF NOT EXISTS health_vision_prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  ojo_derecho_esfera REAL,
  ojo_derecho_cilindro REAL,
  ojo_derecho_eje INTEGER CHECK (ojo_derecho_eje IS NULL OR (ojo_derecho_eje >= 0 AND ojo_derecho_eje <= 180)),
  ojo_izquierdo_esfera REAL,
  ojo_izquierdo_cilindro REAL,
  ojo_izquierdo_eje INTEGER CHECK (ojo_izquierdo_eje IS NULL OR (ojo_izquierdo_eje >= 0 AND ojo_izquierdo_eje <= 180)),
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_vision_fecha ON health_vision_prescriptions (fecha);
