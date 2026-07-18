-- Migration number: 0028    2026-07-17
-- Nibor Recordatorios: tareas por recordar, integradas al centro de
-- notificaciones. frecuencia_dias NULL = una sola vez; el recordatorio
-- insiste a diario mientras esté vencido y no se marque como hecho.

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  notas TEXT,
  frecuencia_dias INTEGER CHECK (frecuencia_dias IS NULL OR frecuencia_dias BETWEEN 1 AND 365),
  proxima_fecha TEXT NOT NULL,
  hora TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  completado_en TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reminders_activo_fecha ON reminders (activo, proxima_fecha);

-- Preferencias de la nueva regla en el centro de notificaciones
INSERT OR IGNORE INTO notification_settings (clave, valor) VALUES
  ('regla_recordatorios', '1'),
  ('push_recordatorios', '1'),
  ('prioridad_recordatorios', '0'),
  ('sonido_recordatorios', '');
