import { Hono } from 'hono'
import { readJson, toInteger } from '../db.js'
import { buildToday, checkHabitForWidget } from './habits.js'

// API de widgets (Widgy, Shortcuts…): lectura/acciones sin login protegidas
// por el secreto WIDGET_TOKEN (?token=). En Cloudflare Access solo la ruta
// exacta /api/widget/habits tiene bypass; /api/widget/url queda detrás del
// login porque le entrega la URL con token al usuario autenticado.
//
// CONTRATO DE ROBUSTEZ: toda rama devuelve SIEMPRE un JSON válido con
// { success, data: { text, … }, error?, meta: { requestId, generatedAt } },
// content-type explícito, cache-control: no-store y X-Request-Id. Nunca un
// body vacío: los errores internos se capturan y responden con envelope.
const widget = new Hono()

const DB_TIMEOUT_MS = 10000

function widgetToken(c) {
  return String(c.env.WIDGET_TOKEN ?? '').trim()
}

function requestIdFrom(c) {
  return c.req.header('cf-ray') ?? crypto.randomUUID()
}

function widgetJson(payload, status, requestId) {
  const body = JSON.stringify({
    ...payload,
    meta: { requestId, generatedAt: new Date().toISOString(), ...(payload.meta ?? {}) },
  })
  return {
    body,
    response: new Response(body, {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-request-id': requestId,
      },
    }),
  }
}

// Log estructurado por solicitud (visible con `wrangler tail`).
function logWidget(entry) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }))
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT:${label} superó ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Ejecuta un handler garantizando respuesta JSON y log aunque explote.
async function guarded(c, route, handler) {
  const requestId = requestIdFrom(c)
  const started = Date.now()
  const log = { requestId, route, method: c.req.method }
  try {
    const { status, payload, extraLog } = await handler(requestId, log)
    const { body, response } = widgetJson(payload, status, requestId)
    logWidget({ ...log, ...(extraLog ?? {}), status, durationMs: Date.now() - started, bodyLength: body.length })
    return response
  } catch (error) {
    const isTimeout = String(error?.message ?? '').startsWith('TIMEOUT:')
    const status = isTimeout ? 504 : 500
    const { body, response } = widgetJson({
      success: false,
      data: { text: 'No fue posible cargar los hábitos' },
      error: { code: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR' },
    }, status, requestId)
    logWidget({
      ...log,
      status,
      durationMs: Date.now() - started,
      bodyLength: body.length,
      error: String(error?.message ?? error),
      stack: String(error?.stack ?? '').slice(0, 600),
    })
    return response
  }
}

// Token inválido/ausente → 404 con JSON (sin revelar que la ruta existe).
function tokenFailure() {
  return { status: 404, payload: { success: false, data: { text: 'No encontrado' }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'fail' } }
}

function isValidToken(c) {
  const expected = widgetToken(c)
  return Boolean(expected) && String(c.req.query('token') ?? '') === expected
}

function buildHabitsText(data, pendientes) {
  if (!data.summary.planned_today) return '🌤 Sin hábitos programados hoy'
  if (!pendientes.length) return `✅ Hábitos completos (${data.summary.done_today}/${data.summary.planned_today})`
  const lines = pendientes.map((habit) => `${habit.emoji ?? '•'} ${habit.name}${habit.target_per_day > 1 ? ` (${habit.done_today}/${habit.target_per_day})` : ''}`)
  return `⏳ ${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'} · ${data.summary.percent_today}% del día\n${lines.join('\n')}`
}

// Detrás de Access (sin bypass): entrega la URL con token al usuario logueado.
widget.get('/url', (c) => guarded(c, '/api/widget/url', async () => {
  const token = widgetToken(c)
  if (!token) {
    return { status: 503, payload: { success: false, data: { text: 'La API de widgets no está configurada (falta WIDGET_TOKEN)' }, error: { code: 'NOT_CONFIGURED' } } }
  }
  const url = new URL(c.req.url)
  return {
    status: 200,
    payload: { success: true, data: { habits_url: `${url.origin}/api/widget/habits?token=${encodeURIComponent(token)}` } },
  }
}))

widget.get('/habits', (c) => guarded(c, '/api/widget/habits', async () => {
  if (!isValidToken(c)) return tokenFailure()

  const dbStart = Date.now()
  const data = await withTimeout(buildToday(c.env.DB), DB_TIMEOUT_MS, 'buildToday')
  const dbMs = Date.now() - dbStart

  const pendientes = data.habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    emoji: habit.emoji ?? null,
    done_today: habit.done_today,
    target_per_day: habit.target_per_day,
    remaining_today: habit.remaining_today,
  }))

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
      },
    },
    extraLog: { auth: 'ok', dbMs, habitCount: pendientes.length },
  }
}))

// Marcar un hábito como hecho desde un Atajo de Siri/Shortcuts. Usa la MISMA
// ruta /habits (id o nombre en body/query) para reutilizar el bypass exacto
// de Access sin abrir rutas adicionales.
widget.post('/habits', (c) => guarded(c, '/api/widget/habits', async () => {
  if (!isValidToken(c)) return tokenFailure()

  const body = (await readJson(c)) ?? {}
  let id = toInteger(body.id ?? c.req.query('id'))

  if (!Number.isInteger(id)) {
    const nombre = String(body.nombre ?? c.req.query('nombre') ?? '').trim()
    if (!nombre) {
      return { status: 400, payload: { success: false, data: { text: 'Falta el id o el nombre del hábito' }, error: { code: 'BAD_REQUEST' } }, extraLog: { auth: 'ok' } }
    }
    const match = await withTimeout(
      c.env.DB.prepare('SELECT id FROM habits WHERE is_active = 1 AND LOWER(name) = LOWER(?) LIMIT 1').bind(nombre).first(),
      DB_TIMEOUT_MS,
      'buscarHabito',
    )
    if (!match) {
      return { status: 404, payload: { success: false, data: { text: 'Hábito no encontrado' }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'ok' } }
    }
    id = match.id
  }

  const dbStart = Date.now()
  const result = await withTimeout(checkHabitForWidget(c.env.DB, id), DB_TIMEOUT_MS, 'checkHabito')
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

  const today = await withTimeout(buildToday(c.env.DB), DB_TIMEOUT_MS, 'buildToday')
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

export default widget
