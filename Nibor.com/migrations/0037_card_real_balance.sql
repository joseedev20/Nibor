-- Migration number: 0037    2026-09-30
-- Saldo real de tarjetas/cuentas (no solo "gastado este mes") y pagos a
-- tarjeta de credito, para no duplicar el mismo dinero en los totales de
-- Gastos: la compra ya se cuenta cuando se hace; pagar la cuota despues NO
-- es un gasto nuevo, es saldar una deuda ya contada. Ver docs/plan/PLAN.md,
-- CONVENCIONES.md y ESTADO.md.

ALTER TABLE cards ADD COLUMN saldo_inicial REAL;
ALTER TABLE cards ADD COLUMN saldo_inicial_fecha TEXT
  CHECK (saldo_inicial_fecha IS NULL OR saldo_inicial_fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

-- Un movimiento con pago_tarjeta_id marca "esto fue pagar la cuota de esa
-- tarjeta de credito" — card_id sigue siendo la cuenta de ORIGEN del dinero
-- (de donde salio), pago_tarjeta_id es el DESTINO (que tarjeta se pago). Se
-- excluye de los totales de Gastos/Ingresos (server/routes/summary.js) pero
-- si reduce la deuda (saldo_actual) de esa tarjeta en server/routes/cards.js.
ALTER TABLE movements ADD COLUMN pago_tarjeta_id INTEGER REFERENCES cards(id);
