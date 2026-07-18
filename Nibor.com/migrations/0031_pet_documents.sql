-- Migration number: 0031    2026-07-18
-- Nibor Bansky: documentos PDF privados por mascota (carnet de vacunas,
-- historia clínica, certificados…). Los archivos viven en R2 (binding FILES);
-- D1 guarda solo metadatos. Nunca incluir documentos reales en migraciones.

CREATE TABLE IF NOT EXISTS pet_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pet_documents_pet ON pet_documents (pet_id, created_at);
