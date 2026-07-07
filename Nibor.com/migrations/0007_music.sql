-- Migration number: 0007    2026-07-04
-- Nibor Musica: catalogo inicial de canciones y estados de produccion.

CREATE TABLE IF NOT EXISTS music_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  artista TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'proceso' CHECK (estado IN ('idea', 'proceso', 'lista', 'publicada')),
  genero TEXT,
  bpm INTEGER CHECK (bpm IS NULL OR bpm > 0),
  tonalidad TEXT,
  fecha_publicacion TEXT,
  enlace TEXT,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_music_songs_estado ON music_songs (estado);
CREATE INDEX IF NOT EXISTS idx_music_songs_fecha_publicacion ON music_songs (fecha_publicacion);
