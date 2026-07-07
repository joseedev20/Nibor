-- Migration number: 0008    2026-07-04
-- Nibor Conocimiento: recursos de aprendizaje, lectura, cursos e idiomas.

CREATE TABLE IF NOT EXISTS knowledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'libro' CHECK (tipo IN ('libro', 'curso', 'idioma', 'articulo', 'video', 'tema', 'otro')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'progreso', 'pausado', 'completado', 'repasar')),
  area TEXT,
  autor TEXT,
  progreso INTEGER NOT NULL DEFAULT 0 CHECK (progreso >= 0 AND progreso <= 100),
  fecha_inicio TEXT,
  fecha_fin TEXT,
  enlace TEXT,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_estado ON knowledge_items (estado);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_tipo ON knowledge_items (tipo);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_area ON knowledge_items (area);
