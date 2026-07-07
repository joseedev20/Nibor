-- Migration number: 0011    2026-07-05
-- Idioma controlado para Nibor Conocimiento. Permite metricas separadas
-- entre libros/recursos en espanol e ingles sin depender de texto libre.

ALTER TABLE knowledge_items
ADD COLUMN idioma TEXT NOT NULL DEFAULT 'espanol' CHECK (idioma IN ('espanol', 'ingles'));

UPDATE knowledge_items
SET idioma = 'ingles'
WHERE lower(area) IN ('ingles', 'inglés')
   OR titulo IN (
     'The Curious Incident of the Dog in the Night-Time',
     'The Giver',
     'Charlotte''s Web',
     'Clear Thinking'
   );

CREATE INDEX IF NOT EXISTS idx_knowledge_items_idioma ON knowledge_items (idioma);
