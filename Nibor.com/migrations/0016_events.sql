-- Migration number: 0016 	 2026-07-06
-- Nibor Eventos: calendario personal editable, exportable como feed ICS
-- para suscripción desde iPhone/Google Calendar.

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha TEXT NOT NULL,                 -- YYYY-MM-DD
  hora TEXT,                           -- HH:MM (NULL = evento de todo el día)
  duracion_min INTEGER NOT NULL DEFAULT 60 CHECK (duracion_min BETWEEN 5 AND 1440),
  lugar TEXT,
  recordatorio_min INTEGER,            -- minutos antes para VALARM (NULL = sin alarma)
  uid TEXT NOT NULL UNIQUE,            -- UID iCalendar estable: editar = actualizar en iPhone
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_fecha ON events (fecha, hora);
