import { Hono } from 'hono'
import { fail, ok, readJson, toInteger } from '../db.js'
import { buildToday, checkHabitForWidget } from './habits.js'

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
    // Lista plana para "Elegir de la lista" en Atajos (se ve limpia y el
    // nombre elegido se puede mandar tal cual al POST como {nombre}).
    pendientes_nombres: pendientes.map((habit) => habit.name),
  })
})

// Marcar un hábito como hecho desde un Atajo de Siri/Shortcuts. Usa la MISMA
// ruta /habits (con id en body o query) para reutilizar el bypass exacto de
// Access sin abrir rutas adicionales.
widget.post('/habits', async (c) => {
  const body = (await readJson(c)) ?? {}
  let id = toInteger(body.id ?? c.req.query('id'))

  // También acepta {nombre} para que el Atajo mande directo lo elegido
  if (!Number.isInteger(id)) {
    const nombre = String(body.nombre ?? c.req.query('nombre') ?? '').trim()
    if (!nombre) return fail(c, 'Falta el id o el nombre del hábito')
    const match = await c.env.DB
      .prepare('SELECT id FROM habits WHERE is_active = 1 AND LOWER(name) = LOWER(?) LIMIT 1')
      .bind(nombre)
      .first()
    if (!match) return fail(c, 'Hábito no encontrado', 404)
    id = match.id
  }

  const result = await checkHabitForWidget(c.env.DB, id)
  if (result.error) return fail(c, result.error, result.status ?? 400)

  const nombre = `${result.habit.emoji ?? ''} ${result.habit.name}`.trim()
  let text
  if (result.already) {
    text = `👌 ${nombre} ya estaba completo hoy (${result.done_today}/${result.target})`
  } else if (result.met) {
    text = `✅ ${nombre} completado (${result.done_today}/${result.target})`
  } else {
    text = `☑️ ${nombre}: ${result.done_today}/${result.target} — te ${result.target - result.done_today === 1 ? 'falta 1' : `faltan ${result.target - result.done_today}`}`
  }

  const today = await buildToday(c.env.DB)
  if (today.summary.pending_today === 0 && today.summary.planned_today > 0) {
    text += `\n🎉 ¡Día completo! (${today.summary.done_today}/${today.summary.planned_today})`
  } else if (today.summary.pending_today > 0) {
    text += `\n⏳ ${today.summary.pending_today} ${today.summary.pending_today === 1 ? 'pendiente' : 'pendientes'} · ${today.summary.percent_today}% del día`
  }

  return ok(c, {
    text,
    met: result.met,
    already: result.already,
    done_today: result.done_today,
    target: result.target,
    resumen: today.summary,
    pendientes: today.habits.map((habit) => ({ id: habit.id, name: habit.name, emoji: habit.emoji ?? null })),
  })
})

export default widget
