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
  const repetir = body.repetir_horas === undefined
    ? current.repetir_horas ?? null
    : (body.repetir_horas === null || body.repetir_horas === '' ? null : toInteger(body.repetir_horas))
  return {
    titulo: body.titulo === undefined ? current.titulo : cleanText(body.titulo),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
    frecuencia_dias: frecuencia,
    repetir_horas: repetir,
    proxima_fecha: body.proxima_fecha === undefined ? current.proxima_fecha : cleanText(body.proxima_fecha),
    hora: body.hora === undefined ? current.hora ?? null : cleanNullableText(body.hora),
    activo: body.activo === undefined ? current.activo ?? 1 : (body.activo ? 1 : 0),
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
  if (reminder.repetir_horas !== null
    && (!Number.isInteger(reminder.repetir_horas) || reminder.repetir_horas < 1 || reminder.repetir_horas > 24)) {
    return 'La repetición del aviso debe estar entre 1 y 24 horas (o vacía para usar el ajuste general)'
  }
  if (!isValidDate(reminder.proxima_fecha)) return 'La fecha del recordatorio no es una fecha válida'
  if (reminder.hora !== null && !isValidTime(reminder.hora)) return 'La hora debe tener formato HH:MM'
  return null
}

reminders.get('/', async (c) => {
  const hoy = todayIso()
  const rows = await all(
    c.env.DB,
    `SELECT * FROM reminders
     ORDER BY completado_en IS NOT NULL, activo DESC, proxima_fecha ASC, id ASC`,
  )
  return ok(c, rows.map((row) => enrichReminder(row, hoy)))
})

reminders.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const reminder = normalizeReminder(body, { proxima_fecha: todayIso() })
  const error = validateReminder(reminder)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO reminders (titulo, notas, frecuencia_dias, repetir_horas, proxima_fecha, hora, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    reminder.titulo, reminder.notas, reminder.frecuencia_dias, reminder.repetir_horas, reminder.proxima_fecha, reminder.hora, reminder.activo,
  )
  const row = await first(c.env.DB, 'SELECT * FROM reminders WHERE id = ?', meta.last_row_id)
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

  // Reactivar un recordatorio completado lo devuelve a la lista normal
  const completadoEn = reminder.activo && current.completado_en ? null : current.completado_en

  await run(
    c.env.DB,
    `UPDATE reminders
     SET titulo = ?, notas = ?, frecuencia_dias = ?, repetir_horas = ?, proxima_fecha = ?, hora = ?, activo = ?, completado_en = ?, updated_at = datetime('now')
     WHERE id = ?`,
    reminder.titulo, reminder.notas, reminder.frecuencia_dias, reminder.repetir_horas, reminder.proxima_fecha, reminder.hora, reminder.activo, completadoEn, id,
  )
  const row = await first(c.env.DB, 'SELECT * FROM reminders WHERE id = ?', id)
  return ok(c, enrichReminder(row))
})

// Marcar como hecho: si tiene frecuencia, programa la siguiente vez;
// si era de una sola vez, queda completado y deja de notificar.
reminders.post('/:id/complete', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM reminders WHERE id = ?', id)
  if (!current) return fail(c, 'Recordatorio no encontrado', 404)

  const hoy = todayIso()
  if (current.frecuencia_dias) {
    await run(
      c.env.DB,
      `UPDATE reminders SET proxima_fecha = ?, activo = 1, completado_en = NULL, updated_at = datetime('now') WHERE id = ?`,
      addDaysIso(hoy, Number(current.frecuencia_dias)),
      id,
    )
  } else {
    await run(
      c.env.DB,
      `UPDATE reminders SET activo = 0, completado_en = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      id,
    )
  }
  const row = await first(c.env.DB, 'SELECT * FROM reminders WHERE id = ?', id)
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
// proxima_fecha; si era único, queda completado.
export async function completeReminderForWidget(db, id) {
  const current = await first(db, 'SELECT * FROM reminders WHERE id = ?', id)
  if (!current) return { error: 'Recordatorio no encontrado', status: 404 }

  const hoy = todayIso()
  if (current.frecuencia_dias) {
    await run(
      db,
      `UPDATE reminders SET proxima_fecha = ?, activo = 1, completado_en = NULL, updated_at = datetime('now') WHERE id = ?`,
      addDaysIso(hoy, Number(current.frecuencia_dias)),
      id,
    )
  } else {
    await run(
      db,
      `UPDATE reminders SET activo = 0, completado_en = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      id,
    )
  }
  const row = await first(db, 'SELECT * FROM reminders WHERE id = ?', id)
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
