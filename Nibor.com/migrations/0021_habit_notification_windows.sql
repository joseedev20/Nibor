-- Migration number: 0021 	 2026-07-09
-- Hábitos: múltiples franjas de notificación por días.

INSERT OR IGNORE INTO notification_settings (clave, valor) VALUES
  (
    'habitos_franjas',
    '[{"id":"diario-tarde","days":[1,2,3,4,5,6,0],"start":"18:00","end":"22:00"}]'
  );
