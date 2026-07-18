-- Migration number: 0029    2026-07-17
-- Recordatorios: repetición del aviso varias veces al día mientras no se
-- marque hecho. Valor en horas por franja (4 = avisa cada ~4 horas).

INSERT OR IGNORE INTO notification_settings (clave, valor) VALUES
  ('recordatorios_repetir_horas', '4');
