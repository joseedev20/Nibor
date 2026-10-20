-- Migration number: 0038    2026-10-20
-- Vincular un Recordatorio con un Habito: al marcar uno hecho, el otro se
-- marca solo (ej. recordatorio "Tomar Pastilla" <-> habito "Losartan 50 mg").
-- Un recordatorio apunta a lo sumo un habito; varios recordatorios pueden
-- apuntar al mismo habito. Ver server/routes/reminders.js y habits.js.

ALTER TABLE reminders ADD COLUMN habit_id INTEGER REFERENCES habits(id);
