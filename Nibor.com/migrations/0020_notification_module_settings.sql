-- Migration number: 0020 	 2026-07-09
-- Configuración contextual por módulo para el centro de notificaciones.

INSERT OR IGNORE INTO notification_settings (clave, valor) VALUES
  -- Hábitos: franja horaria y repetición para recordar solo pendientes.
  ('habitos_inicio', '18'),
  ('habitos_fin', '22'),
  ('habitos_cada_min', '60');

-- Vehículos: preset pedido por el usuario para SOAT/tecnomecánica.
-- No pisa configuraciones personalizadas si ya fueron cambiadas.
UPDATE notification_settings
SET valor = '180,90,30,15,8,3,0', updated_at = datetime('now')
WHERE clave = 'vehiculos_umbrales'
  AND valor = '15,5,0';
