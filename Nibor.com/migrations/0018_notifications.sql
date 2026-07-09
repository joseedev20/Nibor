-- Migration number: 0018 	 2026-07-06
-- Centro de notificaciones: in-app + push vía Pushover.
-- dedupe_key evita duplicados (una notificación por regla/objetivo/día).

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,              -- suscripcion | habitos | vehiculo | evento
  titulo TEXT NOT NULL,
  mensaje TEXT,
  fecha TEXT NOT NULL,             -- día para el que se generó (YYYY-MM-DD)
  dedupe_key TEXT NOT NULL UNIQUE,
  leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0, 1)),
  push_enviada INTEGER NOT NULL DEFAULT 0 CHECK (push_enviada IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_lista ON notifications (leida, fecha DESC, id DESC);

CREATE TABLE IF NOT EXISTS notification_settings (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO notification_settings (clave, valor) VALUES
  ('push_habilitado', '0'),
  ('pushover_user', ''),
  ('pushover_token', ''),
  ('regla_suscripciones', '1'),
  ('regla_habitos', '1'),
  ('regla_vehiculos', '1'),
  ('regla_eventos', '1'),
  ('vehiculos_umbrales', '15,5,0'),
  ('eventos_dias_antes', '1'),
  ('habitos_hora', '18');
