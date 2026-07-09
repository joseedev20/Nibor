-- Migration number: 0019 	 2026-07-07
-- Centro de notificaciones avanzado: prioridad/sonido por regla, push por regla,
-- horario de silencio, pausa temporal, modo resumen y re-recordatorio de vencidas.

ALTER TABLE notifications ADD COLUMN prioridad INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN sonido TEXT;

INSERT OR IGNORE INTO notification_settings (clave, valor) VALUES
  -- push por regla (in-app siempre queda)
  ('push_suscripciones', '1'),
  ('push_habitos', '1'),
  ('push_vehiculos', '1'),
  ('push_eventos', '1'),
  -- prioridad Pushover por regla: -1 silenciosa, 0 normal, 1 alta
  ('prioridad_suscripciones', '0'),
  ('prioridad_habitos', '0'),
  ('prioridad_vehiculos', '1'),
  ('prioridad_eventos', '0'),
  -- sonido Pushover por regla ('' = por defecto del dispositivo)
  ('sonido_suscripciones', ''),
  ('sonido_habitos', ''),
  ('sonido_vehiculos', ''),
  ('sonido_eventos', ''),
  -- horario de silencio (horas Bogotá; iguales = desactivado)
  ('silencio_inicio', '22'),
  ('silencio_fin', '7'),
  -- pausa temporal de push (datetime ISO; '' = sin pausa)
  ('pausado_hasta', ''),
  -- un solo push resumen en vez de individuales
  ('resumen_diario', '0'),
  -- re-recordar documentos vencidos cada N días
  ('vencida_recordar_cada', '3');
