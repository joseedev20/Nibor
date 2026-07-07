-- Migration number: 0005    2026-07-04
-- Las metas se asignan por valor concreto, no solo por porcentaje.

ALTER TABLE goal_allocations
ADD COLUMN monto_asignado REAL CHECK (monto_asignado IS NULL OR monto_asignado > 0);

UPDATE goal_allocations
SET monto_asignado = (
  SELECT goals.monto_objetivo * goal_allocations.porcentaje / 100
  FROM goals
  WHERE goals.id = goal_allocations.goal_id
)
WHERE monto_asignado IS NULL;
