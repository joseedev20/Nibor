-- Migration number: 0012    2026-07-05
-- Anio estructurado para Nibor Conocimiento. Permite filtrar y medir
-- lecturas/recursos por anio sin depender del campo notas.

ALTER TABLE knowledge_items
ADD COLUMN anio INTEGER CHECK (anio IS NULL OR (anio >= 1900 AND anio <= 2100));

UPDATE knowledge_items
SET anio = CAST(substr(notas, instr(notas, 'Año registrado: ') + length('Año registrado: '), 4) AS INTEGER)
WHERE notas LIKE 'Año registrado: ____%';

UPDATE knowledge_items
SET notas = CASE
  WHEN instr(notas, '; ') > 0 THEN NULLIF(trim(substr(notas, instr(notas, '; ') + 2)), '')
  ELSE NULL
END
WHERE notas LIKE 'Año registrado: ____%';

CREATE INDEX IF NOT EXISTS idx_knowledge_items_anio ON knowledge_items (anio);
