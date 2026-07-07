-- Migration number: 0004    2026-07-04
-- Metas financieras: objetivo + distribucion por plataforma.

CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  monto_objetivo REAL NOT NULL CHECK (monto_objetivo > 0),
  activa INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE goal_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  porcentaje REAL NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  UNIQUE (goal_id, platform_id)
);

CREATE INDEX idx_goal_allocations_goal ON goal_allocations (goal_id);
