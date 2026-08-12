-- Migration number: 0033    2026-07-25
-- Nibor Ideas: archivo de ideas para capturar rápido ideas, citas, enlaces
-- y reflexiones antes de que se pierdan. Se organiza con etiquetas libres
-- en vez de carpetas rígidas (inspirado en "Mantener un archivo de ideas").

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contenido TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'idea' CHECK (tipo IN ('idea', 'cita', 'reflexion', 'enlace', 'otro')),
  fuente TEXT,
  -- Etiquetas guardadas delimitadas como ",tag1,tag2," (o NULL) para poder
  -- filtrar con LIKE sin ambigüedad de subcadenas; el backend expone un
  -- arreglo normalizado en las respuestas.
  etiquetas TEXT,
  favorita INTEGER NOT NULL DEFAULT 0 CHECK (favorita IN (0, 1)),
  archivada INTEGER NOT NULL DEFAULT 0 CHECK (archivada IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ideas_tipo ON ideas (tipo);
CREATE INDEX IF NOT EXISTS idx_ideas_archivada ON ideas (archivada);
CREATE INDEX IF NOT EXISTS idx_ideas_favorita ON ideas (favorita);
