-- Migration number: 0002 	 2026-07-04
-- Recurrentes de ingreso: las "suscripciones" ahora también pueden ser ingresos
-- fijos (salario, arriendo recibido). tipo: 'gasto' (default) | 'ingreso'.

ALTER TABLE subscriptions ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto';

-- Categoría para el arriendo que recibe el usuario
INSERT INTO categories (nombre, tipo, icono) VALUES ('Arriendo recibido', 'ingreso', '🏢');
