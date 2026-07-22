import { Hono } from 'hono'
import { readJson, toInteger } from '../db.js'
import { buildToday, checkHabitForWidget } from './habits.js'
import { buildPendingReminders, completeReminderForWidget } from './reminders.js'
import { guarded, isValidWidgetToken, logWidget, tokenFailure, withDbTimeout } from '../widgetKit.js'

// API de widgets (Widgy, Shortcuts…): lectura/acciones sin login protegidas
// por el secreto WIDGET_TOKEN (?token=). En Cloudflare Access el bypass es
// por RUTA EXACTA: /api/widget/habits y /api/widget/reminders (cada recurso
// nuevo necesita su propia app de bypass); /api/widget/url queda detrás del
// login porque le entrega la URL con token al usuario autenticado.
//
// El contrato de robustez (envelope JSON siempre, nunca body vacío, timeout
// a D1, logging estructurado) vive en server/widgetKit.js y se comparte
// entre todos los recursos de este archivo.
const widget = new Hono()

function widgetToken(c) {
  return String(c.env.WIDGET_TOKEN ?? '').trim()
}

// Imagen de la mascota para el layer de imagen de Widgy. Se sirve DENTRO de
// /api/widget/habits (mismo path ya exento en Access vía ?image=) para no
// necesitar un bypass nuevo: el Worker lee el PNG de sus propios assets
// estáticos con el binding ASSETS.
// `auto` elige uno de 5 niveles de progreso (0/25/50/75/100) según
// percent_today, redondeado al múltiplo de 25 más cercano; `complete` y
// `pending` quedan como valores explícitos por compatibilidad con scripts
// de Widgy ya guardados.
const HABIT_IMAGE_FILES = {
  complete: '/widget-images/habits-complete.png',
  pending: '/widget-images/habits-pending.png',
  0: '/widget-images/habits-progress-0.png',
  25: '/widget-images/habits-progress-25.png',
  50: '/widget-images/habits-progress-50.png',
  75: '/widget-images/habits-progress-75.png',
  100: '/widget-images/habits-progress-100.png',
}

const PROGRESS_BUCKETS = [0, 25, 50, 75, 100]

function progressBucketFor(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0))
  const rounded = Math.round(clamped / 25) * 25
  return PROGRESS_BUCKETS.includes(rounded) ? rounded : 100
}

const TRANSPARENT_PIXEL = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  (ch) => ch.charCodeAt(0),
)

async function serveHabitImage(c, which) {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID()
  const started = Date.now()
  try {
    const assetUrl = new URL(HABIT_IMAGE_FILES[which] ?? HABIT_IMAGE_FILES.pending, c.req.url)
    const assetResponse = await c.env.ASSETS.fetch(new Request(assetUrl))
    if (!assetResponse.ok) throw new Error(`asset ${which} respondió ${assetResponse.status}`)
    logWidget({ requestId, route: '/api/widget/habits', method: 'GET', image: which, status: 200, durationMs: Date.now() - started })
    return new Response(assetResponse.body, {
      status: 200,
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  } catch (error) {
    logWidget({
      requestId, route: '/api/widget/habits', method: 'GET', image: which, status: 200,
      durationMs: Date.now() - started, error: String(error?.message ?? error), fallback: 'transparent-pixel',
    })
    // El layer de imagen de Widgy nunca debe quedar roto: si el asset falla,
    // un pixel transparente es preferible a un error visible.
    return new Response(TRANSPARENT_PIXEL, {
      status: 200,
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-request-id': requestId },
    })
  }
}

function buildHabitsText(data, pendientes) {
  if (!data.summary.planned_today) return '🌤 Sin hábitos programados hoy'
  if (!pendientes.length) return `✅ Hábitos completos (${data.summary.done_today}/${data.summary.planned_today})`
  const lines = pendientes.map((habit) => `${habit.emoji ?? '•'} ${habit.name}${habit.target_per_day > 1 ? ` (${habit.done_today}/${habit.target_per_day})` : ''}`)
  return `⏳ ${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'} · ${data.summary.percent_today}% del día\n${lines.join('\n')}`
}

// Detrás de Access (sin bypass): entrega las URLs con token al usuario logueado.
widget.get('/url', (c) => guarded(c, '/api/widget/url', async () => {
  const token = widgetToken(c)
  if (!token) {
    return { status: 503, payload: { success: false, data: { text: 'La API de widgets no está configurada (falta WIDGET_TOKEN)' }, error: { code: 'NOT_CONFIGURED' } } }
  }
  const url = new URL(c.req.url)
  return {
    status: 200,
    payload: {
      success: true,
      data: {
        habits_url: `${url.origin}/api/widget/habits?token=${encodeURIComponent(token)}`,
        habits_image_url: `${url.origin}/api/widget/habits?token=${encodeURIComponent(token)}&image=auto`,
        reminders_url: `${url.origin}/api/widget/reminders?token=${encodeURIComponent(token)}`,
      },
    },
  }
}))

// ── Hábitos ──────────────────────────────────────────────────────────────────

widget.get('/habits', async (c) => {
  const imageParam = c.req.query('image')
  // ?image=complete|pending|0|25|50|75|100|auto: sirve el PNG de la mascota
  // (mismo path ya exento de Access) en vez del JSON habitual. "auto" (o
  // cualquier valor no reconocido) elige el nivel de progreso según
  // percent_today de hoy.
  if (imageParam !== undefined) {
    if (!isValidWidgetToken(c)) return new Response(null, { status: 404 })
    let which = imageParam
    if (!Object.prototype.hasOwnProperty.call(HABIT_IMAGE_FILES, which)) {
      try {
        const data = await withDbTimeout(buildToday(c.env.DB), 'buildToday')
        which = progressBucketFor(data.summary.percent_today)
      } catch {
        which = 0
      }
    }
    return serveHabitImage(c, which)
  }

  return guarded(c, '/api/widget/habits', async () => {
    if (!isValidWidgetToken(c)) return tokenFailure()

    const dbStart = Date.now()
    const data = await withDbTimeout(buildToday(c.env.DB), 'buildToday')
    const dbMs = Date.now() - dbStart

    const pendientes = data.habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji ?? null,
      done_today: habit.done_today,
      target_per_day: habit.target_per_day,
      remaining_today: habit.remaining_today,
    }))

    const url = new URL(c.req.url)
    const token = c.req.query('token')

    return {
      status: 200,
      payload: {
        success: true,
        data: {
          date: data.date,
          text: buildHabitsText(data, pendientes),
          resumen: data.summary,
          pendientes,
          // Lista plana para "Elegir de la lista" en Atajos; el nombre elegido
          // se puede mandar tal cual al POST como {nombre}.
          pendientes_nombres: pendientes.map((habit) => habit.name),
          // Listo para pegar en un layer de imagen de Widgy: cambia sola entre
          // 5 mascotas (0/25/50/75/100) según percent_today.
          image_url: `${url.origin}/api/widget/habits?token=${encodeURIComponent(token)}&image=auto`,
          progreso_bucket: progressBucketFor(data.summary.percent_today),
        },
      },
      extraLog: { auth: 'ok', dbMs, habitCount: pendientes.length },
    }
  })
})

// Marcar un hábito como hecho desde un Atajo de Siri/Shortcuts. Usa la MISMA
// ruta /habits (id o nombre en body/query) para reutilizar el bypass exacto
// de Access sin abrir rutas adicionales.
widget.post('/habits', (c) => guarded(c, '/api/widget/habits', async () => {
  if (!isValidWidgetToken(c)) return tokenFailure()

  const body = (await readJson(c)) ?? {}
  let id = toInteger(body.id ?? c.req.query('id'))

  if (!Number.isInteger(id)) {
    const nombre = String(body.nombre ?? c.req.query('nombre') ?? '').trim()
    if (!nombre) {
      return { status: 400, payload: { success: false, data: { text: 'Falta el id o el nombre del hábito' }, error: { code: 'BAD_REQUEST' } }, extraLog: { auth: 'ok' } }
    }
    const match = await withDbTimeout(
      c.env.DB.prepare('SELECT id FROM habits WHERE is_active = 1 AND LOWER(name) = LOWER(?) LIMIT 1').bind(nombre).first(),
      'buscarHabito',
    )
    if (!match) {
      return { status: 404, payload: { success: false, data: { text: 'Hábito no encontrado' }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'ok' } }
    }
    id = match.id
  }

  const dbStart = Date.now()
  const result = await withDbTimeout(checkHabitForWidget(c.env.DB, id), 'checkHabito')
  if (result.error) {
    return { status: result.status ?? 400, payload: { success: false, data: { text: result.error }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'ok' } }
  }

  const nombre = `${result.habit.emoji ?? ''} ${result.habit.name}`.trim()
  let text
  if (result.already) {
    text = `👌 ${nombre} ya estaba completo hoy (${result.done_today}/${result.target})`
  } else if (result.met) {
    text = `✅ ${nombre} completado (${result.done_today}/${result.target})`
  } else {
    text = `☑️ ${nombre}: ${result.done_today}/${result.target} — te ${result.target - result.done_today === 1 ? 'falta 1' : `faltan ${result.target - result.done_today}`}`
  }

  const today = await withDbTimeout(buildToday(c.env.DB), 'buildToday')
  const dbMs = Date.now() - dbStart
  if (today.summary.pending_today === 0 && today.summary.planned_today > 0) {
    text += `\n🎉 ¡Día completo! (${today.summary.done_today}/${today.summary.planned_today})`
  } else if (today.summary.pending_today > 0) {
    text += `\n⏳ ${today.summary.pending_today} ${today.summary.pending_today === 1 ? 'pendiente' : 'pendientes'} · ${today.summary.percent_today}% del día`
  }

  return {
    status: 200,
    payload: {
      success: true,
      data: {
        text,
        met: result.met,
        already: result.already,
        done_today: result.done_today,
        target: result.target,
        resumen: today.summary,
        pendientes: today.habits.map((habit) => ({ id: habit.id, name: habit.name, emoji: habit.emoji ?? null })),
      },
    },
    extraLog: { auth: 'ok', dbMs, habitCount: today.habits.length },
  }
}))

// ── Recordatorios ────────────────────────────────────────────────────────────

function reminderLabel(reminder) {
  return reminder.titulo
}

function buildRemindersText(pendientes) {
  if (!pendientes.length) return '✅ Sin recordatorios pendientes'
  const lines = pendientes.map((reminder) => (
    reminder.estado === 'vencido'
      ? `⏰ ${reminderLabel(reminder)} (hace ${Math.abs(reminder.dias_restantes)} ${Math.abs(reminder.dias_restantes) === 1 ? 'día' : 'días'})`
      : `⏰ ${reminderLabel(reminder)}`
  ))
  return `📌 ${pendientes.length} ${pendientes.length === 1 ? 'recordatorio pendiente' : 'recordatorios pendientes'}\n${lines.join('\n')}`
}

widget.get('/reminders', (c) => guarded(c, '/api/widget/reminders', async () => {
  if (!isValidWidgetToken(c)) return tokenFailure()

  const dbStart = Date.now()
  const data = await withDbTimeout(buildPendingReminders(c.env.DB), 'buildPendingReminders')
  const dbMs = Date.now() - dbStart

  const pendientes = data.pendientes.map((reminder) => ({
    id: reminder.id,
    titulo: reminder.titulo,
    notas: reminder.notas,
    estado: reminder.estado,
    dias_restantes: reminder.dias_restantes,
  }))

  return {
    status: 200,
    payload: {
      success: true,
      data: {
        date: data.date,
        text: buildRemindersText(pendientes),
        resumen: { pendientes: pendientes.length },
        pendientes,
        // Lista plana para "Elegir de la lista" en Atajos; el título elegido
        // se puede mandar tal cual al POST como {titulo}.
        pendientes_titulos: pendientes.map((reminder) => reminder.titulo),
      },
    },
    extraLog: { auth: 'ok', dbMs, reminderCount: pendientes.length },
  }
}))

// Marcar un recordatorio como hecho desde un Atajo. Misma ruta /reminders
// (id o titulo en body/query) para que solo necesite un bypass de Access.
widget.post('/reminders', (c) => guarded(c, '/api/widget/reminders', async () => {
  if (!isValidWidgetToken(c)) return tokenFailure()

  const body = (await readJson(c)) ?? {}
  let id = toInteger(body.id ?? c.req.query('id'))

  if (!Number.isInteger(id)) {
    const titulo = String(body.titulo ?? c.req.query('titulo') ?? '').trim()
    if (!titulo) {
      return { status: 400, payload: { success: false, data: { text: 'Falta el id o el título del recordatorio' }, error: { code: 'BAD_REQUEST' } }, extraLog: { auth: 'ok' } }
    }
    const match = await withDbTimeout(
      c.env.DB.prepare(
        `SELECT id FROM reminders WHERE activo = 1 AND completado_en IS NULL AND LOWER(titulo) = LOWER(?) LIMIT 1`,
      ).bind(titulo).first(),
      'buscarRecordatorio',
    )
    if (!match) {
      return { status: 404, payload: { success: false, data: { text: 'Recordatorio no encontrado o ya completado' }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'ok' } }
    }
    id = match.id
  }

  const dbStart = Date.now()
  const result = await withDbTimeout(completeReminderForWidget(c.env.DB, id), 'completeRecordatorio')
  if (result.error) {
    return { status: result.status ?? 400, payload: { success: false, data: { text: result.error }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'ok' } }
  }

  const reminder = result.reminder
  const text = reminder.frecuencia_dias
    ? `✅ ${reminderLabel(reminder)} hecho — vuelve en ${reminder.frecuencia_dias} ${Number(reminder.frecuencia_dias) === 1 ? 'día' : 'días'}`
    : `✅ ${reminderLabel(reminder)} completado y finalizado`

  const remaining = await withDbTimeout(buildPendingReminders(c.env.DB), 'buildPendingReminders')
  const dbMs = Date.now() - dbStart
  const pendientesRestantes = remaining.pendientes.filter((item) => item.id !== reminder.id)
  const finalText = pendientesRestantes.length
    ? `${text}\n📌 ${pendientesRestantes.length} ${pendientesRestantes.length === 1 ? 'pendiente' : 'pendientes'}`
    : `${text}\n🎉 No quedan recordatorios pendientes`

  return {
    status: 200,
    payload: {
      success: true,
      data: {
        text: finalText,
        estado: reminder.estado,
        proxima_fecha: reminder.proxima_fecha,
        pendientes: pendientesRestantes.map((item) => ({ id: item.id, titulo: item.titulo })),
      },
    },
    extraLog: { auth: 'ok', dbMs },
  }
}))

export default widget
