-- Migration number: 0032    2026-07-18
-- Nibor Casa v2: la propiedad pasa a ser el centro del módulo.
-- Estado por propiedad, documentos PDF privados en R2 y enlace de
-- movimientos/fijos de Finanzas a cada propiedad (una sola fuente de verdad
-- financiera: nunca duplicar ingresos/gastos en tablas propias del módulo).

ALTER TABLE home_properties ADD COLUMN estado TEXT NOT NULL DEFAULT 'propia'
  CHECK (estado IN ('en_arriendo', 'propia', 'vendida'));

CREATE TABLE IF NOT EXISTS home_property_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES home_properties(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_home_property_documents_property
  ON home_property_documents (property_id, created_at);

-- Ingresos/gastos de la propiedad viven en movements; los fijos (ej. arriendo
-- recibido) se vinculan por subscriptions.home_property_id y arrastran todo su
-- histórico de movimientos aplicados.
ALTER TABLE movements ADD COLUMN home_property_id INTEGER REFERENCES home_properties(id);
ALTER TABLE subscriptions ADD COLUMN home_property_id INTEGER REFERENCES home_properties(id);

INSERT INTO categories (nombre, tipo, icono)
SELECT 'Propiedades', 'gasto', '🏢'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE nombre = 'Propiedades' AND tipo = 'gasto');
