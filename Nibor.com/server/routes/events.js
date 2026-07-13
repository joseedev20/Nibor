import { Hono } from 'hono'
import { all, fail, first, isValidDate, isValidTime, ok, readJson, run, toInteger } from '../db.js'

// Nibor Eventos: calendario personal + feed iCalendar (ICS) para suscribirse
// desde iPhone. El UID de cada evento es estable: al editar fecha/hora, los
// calendarios suscritos se actualizan en el siguiente refresh.
const events = new Hono()

const BOGOTA_OFFSET_MIN = 5 * 60 // America/Bogota = UTC-5 fijo (sin horario de verano)

function normalizeEvent(body, current = {}) {
  return {
    titulo: body.titulo === undefined ? current.titulo : String(body.titulo).trim(),
    descripcion: body.descripcion === undefined ? current.descripcion ?? null : (String(body.descripcion).trim() || null),
    fecha: body.fecha === undefined ? current.fecha : String(body.fecha).trim(),
    hora: body.hora === undefined ? current.hora ?? null : (String(body.hora ?? '').trim() || null),
    duracion_min: body.duracion_min === undefined ? Number(current.duracion_min ?? 60) : toInteger(body.duracion_min, 60),
    lugar: body.lugar === undefined ? current.lugar ?? null : (String(body.lugar).trim() || null),
    recordatorio_min: body.recordatorio_min === undefined
      ? current.recordatorio_min ?? null
      : (body.recordatorio_min === null || body.recordatorio_min === '' ? null : toInteger(body.recordatorio_min, null)),
  }
}

function validateEvent(event) {
  if (!event.titulo) return 'El título es obligatorio'
  if (!isValidDate(event.fecha)) return 'La fecha debe ser una fecha real en formato YYYY-MM-DD'
  if (event.hora !== null && !isValidTime(event.hora)) return 'La hora debe tener formato HH:MM'
  if (!Number.isInteger(event.duracion_min) || event.duracion_min < 5 || event.duracion_min > 1440) {
    return 'La duración debe estar entre 5 y 1440 minutos'
  }
  if (event.recordatorio_min !== null && (!Number.isInteger(event.recordatorio_min) || event.recordatorio_min < 0 || event.recordatorio_min > 10080)) {
    return 'El recordatorio debe estar entre 0 y 10080 minutos'
  }
  return null
}

events.get('/', async (c) => {
  const desde = c.req.query('desde')
  const hasta = c.req.query('hasta')
  if (desde !== undefined && !isValidDate(desde)) return fail(c, 'La fecha inicial debe tener formato YYYY-MM-DD')
  if (hasta !== undefined && !isValidDate(hasta)) return fail(c, 'La fecha final debe tener formato YYYY-MM-DD')

  const conditions = []
  const params = []
  if (desde !== undefined) {
    conditions.push('fecha >= ?')
    params.push(desde)
  }
  if (hasta !== undefined) {
    conditions.push('fecha <= ?')
    params.push(hasta)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = await all(
    c.env.DB,
    `SELECT id, titulo, descripcion, fecha, hora, duracion_min, lugar, recordatorio_min, uid, created_at, updated_at
     FROM events ${where}
     ORDER BY fecha ASC, hora ASC NULLS FIRST, id ASC`,
    ...params,
  )
  return ok(c, rows)
})

events.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const event = normalizeEvent(body)
  const error = validateEvent(event)
  if (error) return fail(c, error)

  const uid = `${crypto.randomUUID()}@nibor`
  const meta = await run(
    c.env.DB,
    `INSERT INTO events (titulo, descripcion, fecha, hora, duracion_min, lugar, recordatorio_min, uid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    event.titulo,
    event.descripcion,
    event.fecha,
    event.hora,
    event.duracion_min,
    event.lugar,
    event.recordatorio_min,
    uid,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM events WHERE id = ?', meta.last_row_id), 201)
})

events.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM events WHERE id = ?', id)
  if (!current) return fail(c, 'Evento no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const event = normalizeEvent(body, current)
  const error = validateEvent(event)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE events
     SET titulo = ?, descripcion = ?, fecha = ?, hora = ?, duracion_min = ?, lugar = ?, recordatorio_min = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    event.titulo,
    event.descripcion,
    event.fecha,
    event.hora,
    event.duracion_min,
    event.lugar,
    event.recordatorio_min,
    id,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM events WHERE id = ?', id))
})

events.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const meta = await run(c.env.DB, 'DELETE FROM events WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Evento no encontrado', 404)
  return ok(c, { id })
})

// ── Feed iCalendar ──────────────────────────────────────────────────────────

function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function calendarFeedToken(c) {
  return String(c.env.CALENDAR_FEED_TOKEN ?? '').trim()
}

events.get('/calendar-url', (c) => {
  const token = calendarFeedToken(c)
  if (!token) return fail(c, 'La suscripción móvil del calendario no está configurada', 503)

  const url = new URL(c.req.url)
  const httpsUrl = `${url.origin}/api/events/calendar.ics?token=${encodeURIComponent(token)}`
  return ok(c, {
    https_url: httpsUrl,
    webcal_url: httpsUrl.replace(/^https:\/\//, 'webcal://'),
  })
})

function icsDate(fecha) {
  return fecha.replaceAll('-', '')
}

// Fecha+hora local Bogotá → UTC en formato iCalendar (YYYYMMDDTHHMMSSZ)
function icsUtc(fecha, hora, plusMinutes = 0) {
  const [y, m, d] = fecha.split('-').map(Number)
  const [hh, mm] = hora.split(':').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, hh, mm) + (BOGOTA_OFFSET_MIN + plusMinutes) * 60000)
  return utc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function icsStamp(sqlDatetime) {
  // 'YYYY-MM-DD HH:MM:SS' (UTC de SQLite) → YYYYMMDDTHHMMSSZ
  return `${String(sqlDatetime ?? '').replace(' ', 'T').replace(/[-:]/g, '')}Z`
}

function nextDay(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + 1))
  return date.toISOString().slice(0, 10)
}

events.get('/calendar.ics', async (c) => {
  const expectedToken = calendarFeedToken(c)
  const providedToken = String(c.req.query('token') ?? '')
  if (!expectedToken || providedToken !== expectedToken) {
    return fail(c, 'Calendario no encontrado', 404)
  }

  const rows = await all(
    c.env.DB,
    `SELECT id, titulo, descripcion, fecha, hora, duracion_min, lugar, recordatorio_min, uid, created_at, updated_at
     FROM events
     ORDER BY fecha ASC, id ASC`,
  )

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nibor//Centro Personal//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nibor',
    'X-WR-TIMEZONE:America/Bogota',
  ]

  for (const event of rows) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}`)
    lines.push(`DTSTAMP:${icsStamp(event.updated_at)}`)
    // SEQUENCE creciente con cada edición para que los suscritos actualicen
    lines.push(`SEQUENCE:${Math.floor(new Date(`${String(event.updated_at).replace(' ', 'T')}Z`).getTime() / 1000)}`)
    if (event.hora) {
      lines.push(`DTSTART:${icsUtc(event.fecha, event.hora)}`)
      lines.push(`DTEND:${icsUtc(event.fecha, event.hora, Number(event.duracion_min ?? 60))}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(event.fecha)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(nextDay(event.fecha))}`)
    }
    lines.push(`SUMMARY:${icsEscape(event.titulo)}`)
    if (event.descripcion) lines.push(`DESCRIPTION:${icsEscape(event.descripcion)}`)
    if (event.lugar) lines.push(`LOCATION:${icsEscape(event.lugar)}`)
    if (event.recordatorio_min !== null && event.recordatorio_min !== undefined) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${icsEscape(event.titulo)}`)
      lines.push(`TRIGGER:-PT${Number(event.recordatorio_min)}M`)
      lines.push('END:VALARM')
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return c.body(lines.join('\r\n') + '\r\n', 200, {
    'content-type': 'text/calendar; charset=utf-8',
    'content-disposition': 'inline; filename="nibor.ics"',
    'cache-control': 'private, no-store, no-cache, must-revalidate',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
})

export default events
