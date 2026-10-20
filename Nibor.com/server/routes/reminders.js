import { Hono } from 'hono'
import { all, fail, first, isValidDate, isValidTime, ok, readJson, run, toInteger } from '../db.js'

// Nibor Recordatorios: tareas por recordar con frecuencia configurable.
// El estado se calcula SOLO aquí; la notificación diaria la genera el motor
// del centro de notificaciones (regla 'recordatorios' en notifications.js).
const reminders = new Hono()

export function todayIso() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10) // Bogotá UTC-5
}

function addDaysIso(fecha, days) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

export function enrichReminder(reminder, hoy = todayIso()) {
  let estado = 'programado'
  let dias_restantes = null
  if (reminder.completado_en) estado = 'completado'
  else if (!reminder.activo) estado = 'pausado'
  else {
    const diff = Math.round(
      (new Date(`${reminder.proxima_fecha}T00:00:00Z`) - new Date(`${hoy}T00:00:00Z`)) / 86400000,
    )
    dias_restantes = diff
    if (diff < 0) estado = 'vencido'
    else if (diff === 0) estado = 'hoy'
  }
  return { ...reminder, estado, dias_restantes }
}

function normalizeReminder(body, current = {}) {
  const frecuencia = body.frecuencia_dias === undefined
    ? current.frecuencia_dias ?? null
    : (body.frecuencia_dias === null || body.frecuencia_dias === '' ? null : toInteger(body.frecuencia_dias))
  const repetir = body.repetir_minutos === undefined
    ? current.repetir_minutos ?? null
    : (body.repetir_minutos === null || body.repetir_minutos === '' ? null : toInteger(body.repetir_minutos))
  return {
    titulo: body.titulo === undefined ? current.titulo : cleanText(body.titulo),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
    frecuencia_dias: frecuencia,
    repetir_minutos: repetir,
    proxima_fecha: body.proxima_fecha === undefined ? current.proxima_fecha : cleanText(body.proxima_fecha),
    hora: body.hora === undefined ? current.hora ?? null : cleanNullableText(body.hora),
    activo: body.activo === undefined ? current.activo ?? 1 : (body.activo ? 1 : 0),
    habit_id: body.habit_id === undefined ? current.habit_id ?? null : toInteger(body.habit_id, null),
  }
}

function validateReminder(reminder) {
  if (!reminder.titulo) return 'El título es obligatorio'
  if (reminder.titulo.length > 120) return 'El título no puede superar 120 caracteres'
  if (reminder.notas && reminder.notas.length > 500) return 'Las notas no pueden superar 500 caracteres'
  if (reminder.frecuencia_dias !== null
    && (!Number.isInteger(reminder.frecuencia_dias) || reminder.frecuencia_dias < 1 || reminder.frecuencia_dias > 365)) {
    return 'La frecuencia debe estar entre 1 y 365 días (o vacía para una sola vez)'
  }
  if (reminder.repetir_minutos !== null
    && (!Number.isInteger(reminder.repetir_minutos) || reminder.repetir_minutos < 5 || reminder.repetir_minutos > 1440)) {
    return 'La repetición del aviso debe estar entre 5 minutos y 24 horas (o vacía para usar el ajuste general)'
  }
  if (!isValidDate(reminder.proxima_fecha)) return 'La fecha del recordatorio no es una fecha válida'
  if (reminder.hora !== null && !isValidTime(reminder.hora)) return 'La hora debe tener formato HH:MM'
  if (reminder.habit_id !== null && !Number.isInteger(reminder.habit_id)) return 'El hábito debe ser válido'
  return null
}

async function validateHabitLink(db, habit_id) {
  if (habit_id === null) return null
  const habit = await first(db, 'SELECT id FROM habits WHERE id = ?', habit_id)
  if (!habit) return 'Hábito no encontrado'
  return null
}

function getReminderWithHabit(db, id) {
  return first(
    db,
    `SELECT r.*, h.name AS habit_nombre
     FROM reminders r
     LEFT JOIN habits h ON h.id = r.habit_id
     WHERE r.id = ?`,
    id,
  )
}

reminders.get('/', async (c) => {
  const hoy = todayIso()
  const rows = await all(
    c.env.DB,
    `SELECT r.*, h.name AS habit_nombre
     FROM reminders r
     LEFT JOIN habits h ON h.id = r.habit_id
     ORDER BY r.completado_en IS NOT NULL, r.activo DESC, r.proxima_fecha ASC, r.id ASC`,
  )
  return ok(c, rows.map((row) => enrichReminder(row, hoy)))
})

reminders.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const reminder = normalizeReminder(body, { proxima_fecha: todayIso() })
  const error = validateReminder(reminder)
  if (error) return fail(c, error)
  const habitError = await validateHabitLink(c.env.DB, reminder.habit_id)
  if (habitError) return fail(c, habitError, 404)

  const meta = await run(
    c.env.DB,
    `INSERT INTO reminders (titulo, notas, frecuencia_dias, repetir_minutos, proxima_fecha, hora, activo, habit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    reminder.titulo, reminder.notas, reminder.frecuencia_dias, reminder.repetir_minutos, reminder.proxima_fecha, reminder.hora, reminder.activo, reminder.habit_id,
  )
  const row = await getReminderWithHabit(c.env.DB, meta.last_row_id)
  return ok(c, enrichReminder(row), 201)
})

reminders.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM reminders WHERE id = ?', id)
  if (!current) return fail(c, 'Recordatorio no encontrado', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const reminder = normalizeReminder(body, current)
  const error = validateReminder(reminder)
  if (error) return fail(c, error)
  const habitError = await validateHabitLink(c.env.DB, reminder.habit_id)
  if (habitError) return fail(c, habitError, 404)

  // Reactivar un recordatorio completado lo devuelve a la lista normal
  const completadoEn = reminder.activo && current.completado_en ? null : current.completado_en

  await run(
    c.env.DB,
    `UPDATE reminders
     SET titulo = ?, notas = ?, frecuencia_dias = ?, repetir_minutos = ?, proxima_fecha = ?, hora = ?, activo = ?, completado_en = ?, habit_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
    reminder.titulo, reminder.notas, reminder.frecuencia_dias, reminder.repetir_minutos, reminder.proxima_fecha, reminder.hora, reminder.activo, completadoEn, reminder.habit_id, id,
  )
  const row = await getReminderWithHabit(c.env.DB, id)
  return ok(c, enrichReminder(row))
})

// Aplica el cambio de estado de "completar" en la fila (compartido por la
// ruta HTTP, el widget y el cascade que dispara el hábito vinculado).
// cascade=false evita el ciclo cuando ya venimos de marcar el hábito.
async function completeReminderCore(db, current, hoy, { cascade = true } = {}) {
  if (current.frecuencia_dias) {
    await run(
      db,
      `UPDATE reminders SET proxima_fecha = ?, activo = 1, completado_en = NULL, updated_at = datetime('now') WHERE id = ?`,
      addDaysIso(hoy, Number(current.frecuencia_dias)),
      current.id,
    )
  } else {
    await run(
      db,
      `UPDATE reminders SET activo = 0, completado_en = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      current.id,
    )
  }
  if (cascade && current.habit_id) {
    // Import dinámico para evitar un ciclo estático reminders.js <-> habits.js.
    const { markHabitDoneFromLink } = await import('./habits.js')
    await markHabitDoneFromLink(db, current.habit_id)
  }
}

// Recordatorios vinculados a un hábito (habit_id) que siguen pendientes hoy
// se completan cuando ese hábito se marca hecho desde Hábitos. cascade:false
// porque el hábito ya está marcado — no hay que volver a tocarlo.
export async function completeLinkedRemindersForHabit(db, habitId) {
  const hoy = todayIso()
  const rows = await all(
    db,
    `SELECT * FROM reminders WHERE habit_id = ? AND activo = 1 AND completado_en IS NULL AND proxima_fecha <= ?`,
    habitId,
    hoy,
  )
  for (const reminder of rows) {
    await completeReminderCore(db, reminder, hoy, { cascade: false })
  }
}

// Marcar como hecho: si tiene frecuencia, programa la siguiente vez;
// si era de una sola vez, queda completado y deja de notificar.
reminders.post('/:id/complete', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM reminders WHERE id = ?', id)
  if (!current) return fail(c, 'Recordatorio no encontrado', 404)

  const hoy = todayIso()
  await completeReminderCore(c.env.DB, current, hoy)
  const row = await getReminderWithHabit(c.env.DB, id)
  return ok(c, enrichReminder(row, hoy))
})

// ── Reutilizables por la API de widgets (server/routes/widget.js) ──────────

// Recordatorios pendientes hoy (vencidos o para hoy), igual criterio que
// la pestaña "Para hoy" de RecordatoriosView.
export async function buildPendingReminders(db) {
  const hoy = todayIso()
  const rows = await all(
    db,
    `SELECT * FROM reminders WHERE activo = 1 AND completado_en IS NULL AND proxima_fecha <= ? ORDER BY proxima_fecha ASC, id ASC`,
    hoy,
  )
  const enriched = rows.map((row) => enrichReminder(row, hoy))
  return {
    date: hoy,
    pendientes: enriched.filter((row) => row.estado === 'hoy' || row.estado === 'vencido'),
  }
}

// Misma semántica que POST /:id/complete: si tiene frecuencia, reprograma
// proxima_fecha; si era único, queda completado. También dispara el cascade
// hacia el hábito vinculado, igual que la ruta HTTP.
export async function completeReminderForWidget(db, id) {
  const current = await first(db, 'SELECT * FROM reminders WHERE id = ?', id)
  if (!current) return { error: 'Recordatorio no encontrado', status: 404 }

  const hoy = todayIso()
  await completeReminderCore(db, current, hoy)
  const row = await getReminderWithHabit(db, id)
  return { reminder: enrichReminder(row, hoy) }
}

reminders.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id FROM reminders WHERE id = ?', id)
  if (!current) return fail(c, 'Recordatorio no encontrado', 404)
  await run(c.env.DB, 'DELETE FROM reminders WHERE id = ?', id)
  return ok(c, { id })
})

export default reminders
