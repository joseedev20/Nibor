import { Hono } from 'hono'
import { fail, ok } from '../db.js'
import { buildToday } from './habits.js'

// API de widgets (Widgy, Shortcuts…): lectura sin login protegida por el
// secreto WIDGET_TOKEN (?token=). En Cloudflare Access solo la ruta exacta
// /api/widget/habits tiene bypass; /api/widget/url queda detrás del login
// porque le entrega la URL con token al usuario autenticado.
// Sin token o token incorrecto → 404, sin revelar que la ruta existe.
const widget = new Hono()

function widgetToken(c) {
  return String(c.env.WIDGET_TOKEN ?? '').trim()
}

// Registrada ANTES del middleware de token: vive detrás de Access.
widget.get('/url', (c) => {
  const token = widgetToken(c)
  if (!token) return fail(c, 'La API de widgets no está configurada (falta WIDGET_TOKEN)', 503)
  const url = new URL(c.req.url)
  return ok(c, {
    habits_url: `${url.origin}/api/widget/habits?token=${encodeURIComponent(token)}`,
  })
})

widget.use('*', async (c, next) => {
  const expected = widgetToken(c)
  const provided = String(c.req.query('token') ?? '')
  if (!expected || provided !== expected) return fail(c, 'No encontrado', 404)
  await next()
  c.header('cache-control', 'private, no-store')
})

widget.get('/habits', async (c) => {
  const data = await buildToday(c.env.DB)
  const pendientes = data.habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    emoji: habit.emoji ?? null,
    done_today: habit.done_today,
    target_per_day: habit.target_per_day,
    remaining_today: habit.remaining_today,
  }))

  let text
  if (!data.summary.planned_today) {
    text = '🌤 Sin hábitos programados hoy'
  } else if (!pendientes.length) {
    text = `✅ Hábitos completos (${data.summary.done_today}/${data.summary.planned_today})`
  } else {
    const lines = pendientes.map((habit) => `${habit.emoji ?? '•'} ${habit.name}${habit.target_per_day > 1 ? ` (${habit.done_today}/${habit.target_per_day})` : ''}`)
    text = `⏳ ${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'} · ${data.summary.percent_today}% del día\n${lines.join('\n')}`
  }

  return ok(c, {
    date: data.date,
    text,
    resumen: data.summary,
    pendientes,
  })
})

export default widget
