-- Migration number: 0015    2026-07-06
-- Nibor Habitos: seguimiento diario, historial migrado e integraciones con Salud/Conocimiento.

CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_id INTEGER UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  color TEXT NOT NULL DEFAULT '#10b981',
  sort_index INTEGER NOT NULL DEFAULT 0,
  target_per_day INTEGER NOT NULL DEFAULT 1 CHECK (target_per_day >= 1 AND target_per_day <= 50),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_habits_active_sort ON habits (is_active, sort_index, id);
CREATE INDEX IF NOT EXISTS idx_habits_old_id ON habits (old_id);

CREATE TABLE IF NOT EXISTS habit_schedule (
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  PRIMARY KEY (habit_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_habit_schedule_day ON habit_schedule (day_of_week);

CREATE TABLE IF NOT EXISTS habit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_event_id INTEGER UNIQUE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  event_time TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'import')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_habit_events_habit_time ON habit_events (habit_id, event_time);
CREATE INDEX IF NOT EXISTS idx_habit_events_time ON habit_events (event_time);
CREATE INDEX IF NOT EXISTS idx_habit_events_old_event_id ON habit_events (old_event_id);

CREATE TABLE IF NOT EXISTS habit_defer (
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day_date TEXT NOT NULL,
  defer_rank INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (habit_id, day_date)
);

CREATE INDEX IF NOT EXISTS idx_habit_defer_day ON habit_defer (day_date);

CREATE TABLE IF NOT EXISTS habit_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('salud', 'knowledge')),
  behavior TEXT NOT NULL,
  target_id INTEGER,
  target_label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (habit_id, module, behavior)
);

CREATE INDEX IF NOT EXISTS idx_habit_links_module ON habit_links (module, behavior);
