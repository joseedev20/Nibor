-- Migration number: 0036    2026-09-15
-- Tarjetas/cuentas: agrega últimos 4 dígitos, entidad bancaria, tipo
-- (crédito/débito/cuenta) y cupo. Los últimos 4 dígitos NO son un dato
-- sensible por sí solos (el propio banco los muestra en cada SMS/notificación
-- push) — la regla que sigue vigente es nunca guardar el número completo,
-- vencimiento ni CVV. Sirven para detectar automáticamente con qué tarjeta o
-- cuenta se hizo un gasto capturado por mensaje (server/routes/widgetExpenses.js).

ALTER TABLE cards ADD COLUMN ultimos_digitos TEXT
  CHECK (ultimos_digitos IS NULL OR (length(ultimos_digitos) = 4 AND ultimos_digitos GLOB '[0-9][0-9][0-9][0-9]'));
ALTER TABLE cards ADD COLUMN entidad TEXT;
ALTER TABLE cards ADD COLUMN tipo TEXT NOT NULL DEFAULT 'credito' CHECK (tipo IN ('credito', 'debito', 'cuenta'));
ALTER TABLE cards ADD COLUMN cupo REAL CHECK (cupo IS NULL OR cupo >= 0);

-- Vincula cada movimiento con la tarjeta/cuenta detectada (por mensaje) o
-- elegida a mano, igual que ya pasa con subscription_id.
ALTER TABLE movements ADD COLUMN card_id INTEGER REFERENCES cards(id);
