-- Migration number: 0010 	 2026-07-05
-- Tarjetas de crédito/débito: SOLO nombre identificador (nunca números,
-- fechas de vencimiento ni datos sensibles). Cada fijo puede enlazarse a una.

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  activa INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE subscriptions ADD COLUMN card_id INTEGER REFERENCES cards(id);
