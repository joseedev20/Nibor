import { Hono } from 'hono'
import { all, fail, first, ok, readJson, run, toInteger } from '../db.js'

// Centro de notificaciones: motor de reglas + entrega push vía Pushover.
// runChecks es idempotente (dedupe_key UNIQUE): puede llamarse desde el cron,
// desde POST /run al abrir la app, o manualmente — nunca duplica.
const notifications = new Hono()

const BOGOTA_OFFSET_MS = 5 * 3600 * 1000 // UTC-5 fijo
const SETTING_KEYS = new Set([
  'push_habilitado', 'pushover_user', 'pushover_token',
  'regla_suscripciones', 'regla_habitos', 'regla_vehiculos', 'regla_eventos',
  'vehiculos_umbrales', 'eventos_dias_antes', 'habitos_hora',
  'push_suscripciones', 'push_habitos', 'push_vehiculos', 'push_eventos',
  'prioridad_suscripciones', 'prioridad_habitos', 'prioridad_vehiculos', 'prioridad_eventos',
  'sonido_suscripciones', 'sonido_habitos', 'sonido_vehiculos', 'sonido_eventos',
  'silencio_inicio', 'silencio_fin', 'pausado_hasta', 'resumen_diario', 'vencida_recordar_cada',
  'habitos_inicio', 'habitos_fin', 'habitos_cada_min', 'habitos_franjas',
])

// tipo de notificación → sufijo de sus claves de configuración
const RULE_SUFFIX = { suscripcion: 'suscripciones', habitos: 'habitos', vehiculo: 'vehiculos', evento: 'eventos' }

// Preferencias de entrega de una regla (push sí/no, prioridad, sonido)
function ruleMeta(settings, tipo) {
  const suffix = RULE_SUFFIX[tipo]
  const prioridad = Number(settings[`prioridad_${suffix}`] ?? 0)
  return {
    push: settings[`push_${suffix}`] !== '0',
    prioridad: [-1, 0, 1].includes(prioridad) ? prioridad : 0,
    sonido: String(settings[`sonido_${suffix}`] ?? '').trim() || null,
  }
}

function nowBogota() {
  const date = new Date(Date.now() - BOGOTA_OFFSET_MS)
  return { hoy: date.toISOString().slice(0, 10), hora: date.getUTCHours(), minuto: date.getUTCMinutes() }
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function addDaysIso(fecha, days) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function lastDayOfMonth(fecha) {
  const [y, m] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function formatCop(value) {
  return `$ ${Math.round(Number(value ?? 0)).toLocaleString('es-CO')}`
}

async function getSettings(db) {
  const rows = await all(db, 'SELECT clave, valor FROM notification_settings')
  return Object.fromEntries(rows.map((row) => [row.clave, row.valor]))
}

// Inserta si no existe (dedupe). Devuelve true si es nueva.
// Si la regla tiene push apagado, nace con push_enviada=1 (solo in-app).
async function insertNotification(db, settings, { tipo, titulo, mensaje, fecha, dedupe }) {
  const meta = ruleMeta(settings, tipo)
  const result = await run(
    db,
    `INSERT OR IGNORE INTO notifications (tipo, titulo, mensaje, fecha, dedupe_key, prioridad, sonido, push_enviada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tipo,
    titulo,
    mensaje ?? null,
    fecha,
    dedupe,
    meta.prioridad,
    meta.sonido,
    meta.push ? 0 : 1,
  )
  return (result.changes ?? 0) > 0
}

// ── Reglas ──────────────────────────────────────────────────────────────────

async function checkSuscripciones(db, settings, hoy) {
  const day = Number(hoy.slice(8, 10))
  const ultimoDia = lastDayOfMonth(hoy)
  const subs = await all(
    db,
    `SELECT id, nombre, monto, tipo, dia_cobro, automatica FROM subscriptions WHERE activa = 1`,
  )
  let nuevas = 0
  for (const sub of subs) {
    const cobroDia = Math.min(Number(sub.dia_cobro), ultimoDia)
    if (cobroDia !== day) continue
    const esIngreso = sub.tipo === 'ingreso'
    const manual = Number(sub.automatica ?? 1) === 0
    const titulo = esIngreso
      ? `💰 Hoy llega: ${sub.nombre}`
      : manual
        ? `💸 Hoy debes pagar: ${sub.nombre}`
        : `💳 Hoy se cobra: ${sub.nombre}`
    if (await insertNotification(db, settings, {
      tipo: 'suscripcion',
      titulo,
      mensaje: `${formatCop(sub.monto)}${manual ? ' — pago manual, recuerda registrarlo' : ''}`,
      fecha: hoy,
      dedupe: `sub:${sub.id}:${hoy}`,
    })) nuevas++
  }
  return nuevas
}

const DEFAULT_HABIT_WINDOW = { id: 'diario-tarde', days: [1, 2, 3, 4, 5, 6, 0], start: '18:00', end: '22:00' }

function timeToMinutes(value, fallback) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback
  return hour * 60 + minute
}

function previousDow(dow) {
  return dow === 0 ? 6 : dow - 1
}

function appliesToWindowDay(window, dow, current, start, end) {
  const days = window.days ?? []
  if (start <= end) return days.includes(dow)
  if (current >= start) return days.includes(dow)
  return days.includes(previousDow(dow))
}

function inMinuteWindow(current, start, end) {
  if (start === end) return true
  return start < end ? current >= start && current <= end : current >= start || current <= end
}

function legacyHabitWindow(settings) {
  const startRaw = Number(settings.habitos_inicio ?? settings.habitos_hora ?? 18)
  const endRaw = Number(settings.habitos_fin ?? 22)
  const startHour = Math.min(23, Math.max(0, Number.isInteger(startRaw) ? startRaw : 18))
  const endHour = Math.min(23, Math.max(0, Number.isInteger(endRaw) ? endRaw : 22))
  return {
    ...DEFAULT_HABIT_WINDOW,
    id: 'legacy',
    start: `${String(startHour).padStart(2, '0')}:00`,
    end: `${String(endHour).padStart(2, '0')}:00`,
  }
}

function parseHabitWindows(settings) {
  try {
    const parsed = JSON.parse(String(settings.habitos_franjas ?? ''))
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map((window, index) => ({
          id: String(window.id ?? `franja-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `franja-${index + 1}`,
          days: Array.isArray(window.days)
            ? [...new Set(window.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
            : [],
          start: timeToMinutes(window.start, null),
          end: timeToMinutes(window.end, null),
        }))
        .filter((window) => window.days.length && window.start !== null && window.end !== null)
      if (normalized.length) return normalized
    }
  } catch {
    // Si el JSON se daña, se conserva compatibilidad con los campos viejos.
  }
  const legacy = legacyHabitWindow(settings)
  return [{
    ...legacy,
    start: timeToMinutes(legacy.start, 18 * 60),
    end: timeToMinutes(legacy.end, 22 * 60),
  }]
}

function habitSlot(settings, hoy, hora, minuto) {
  const rawInterval = Number(settings.habitos_cada_min ?? 60)
  const interval = Number.isInteger(rawInterval) && rawInterval > 0 ? Math.max(15, rawInterval) : 60
  const current = Math.min(23, Math.max(0, Number.isInteger(hora) ? hora : 0)) * 60
    + Math.min(59, Math.max(0, Number.isInteger(minuto) ? minuto : 0))
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay()
  const windows = parseHabitWindows(settings)

  for (const window of windows) {
    if (!appliesToWindowDay(window, dow, current, window.start, window.end)) continue
    if (!inMinuteWindow(current, window.start, window.end)) continue
    const elapsed = (current - window.start + 1440) % 1440
    const slot = Math.floor(elapsed / interval)
    const slotStart = (window.start + slot * interval) % 1440
    return `${window.id}-${slotStart}`
  }
  return null
}

async function checkHabitos(db, settings, hoy, hora, minuto) {
  const slotStart = habitSlot(settings, hoy, hora, minuto)
  if (slotStart === null) return 0
  // Hábitos activos planeados hoy sin completar (target vs eventos del día)
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay()
  const rows = await all(
    db,
    `SELECT h.id, h.name, h.target_per_day,
            (SELECT COUNT(*) FROM habit_events e WHERE e.habit_id = h.id AND substr(e.event_time, 1, 10) = ?) AS done_today,
            (SELECT COUNT(*) FROM habit_schedule s WHERE s.habit_id = h.id) AS schedule_count,
            (SELECT COUNT(*) FROM habit_schedule s WHERE s.habit_id = h.id AND s.day_of_week = ?) AS planned_today
     FROM habits h
     WHERE h.is_active = 1
       AND (h.start_date IS NULL OR h.start_date <= ?)
       AND (h.end_date IS NULL OR h.end_date >= ?)`,
    hoy,
    dow,
    hoy,
    hoy,
  )
  const pendientes = rows.filter((h) => {
    const planned = Number(h.schedule_count) === 0 || Number(h.planned_today) > 0
    return planned && Number(h.done_today) < Number(h.target_per_day)
  })
  if (!pendientes.length) return 0

  const nombres = pendientes.map((h) => h.name).join(', ')
  const nueva = await insertNotification(db, settings, {
    tipo: 'habitos',
    titulo: `✅ Te ${pendientes.length === 1 ? 'falta 1 hábito' : `faltan ${pendientes.length} hábitos`} hoy`,
    mensaje: nombres,
    fecha: hoy,
    dedupe: `habitos:${hoy}:${slotStart}`,
  })
  return nueva ? 1 : 0
}

async function checkVehiculos(db, settings, hoy, umbrales) {
  const recordarCada = Math.max(1, Number(settings.vencida_recordar_cada ?? 3))
  const items = await all(
    db,
    `SELECT 'vehicle' AS source, i.id, i.nombre, i.vence, v.nombre AS vehiculo
     FROM vehicle_items i
     JOIN vehicles v ON v.id = i.vehicle_id
     WHERE v.activa = 1 AND i.vence IS NOT NULL
     UNION ALL
     SELECT 'license' AS source, c.id,
            'Licencia categoría ' || c.categoria AS nombre,
            c.vence,
            CASE WHEN c.categoria LIKE 'A%' THEN 'Moto' ELSE 'Carro' END AS vehiculo
     FROM driver_license_categories c
     WHERE c.vence IS NOT NULL`,
  )
  let nuevas = 0
  for (const item of items) {
    const dias = Math.round((new Date(`${item.vence}T00:00:00Z`) - new Date(`${hoy}T00:00:00Z`)) / 86400000)
    let titulo = null
    if (dias >= 0 && umbrales.includes(dias)) {
      titulo = dias === 0
        ? `🚨 ${item.vehiculo}: ${item.nombre} vence HOY`
        : `🚗 ${item.vehiculo}: ${item.nombre} vence en ${dias} días`
    } else if (dias < 0 && (Math.abs(dias) - 1) % recordarCada === 0) {
      // Vencida: insiste cada N días hasta que se actualice la fecha
      const haceDias = Math.abs(dias)
      titulo = `❌ ${item.vehiculo}: ${item.nombre} está VENCIDA (hace ${haceDias} ${haceDias === 1 ? 'día' : 'días'})`
    }
    if (!titulo) continue
    if (await insertNotification(db, settings, {
      tipo: 'vehiculo',
      titulo,
      mensaje: `Vencimiento: ${item.vence}`,
      fecha: hoy,
      dedupe: `veh:${item.source}:${item.id}:${item.vence}:${dias}`,
    })) nuevas++
  }
  return nuevas
}

async function checkEventos(db, settings, hoy, diasAntes) {
  const objetivos = [
    { fecha: hoy, offset: 0 },
    ...(diasAntes > 0 ? [{ fecha: addDaysIso(hoy, diasAntes), offset: diasAntes }] : []),
  ]
  let nuevas = 0
  for (const { fecha, offset } of objetivos) {
    const eventos = await all(db, 'SELECT id, titulo, hora, lugar FROM events WHERE fecha = ?', fecha)
    for (const evento of eventos) {
      const cuando = offset === 0 ? 'HOY' : offset === 1 ? 'Mañana' : `En ${offset} días`
      if (await insertNotification(db, settings, {
        tipo: 'evento',
        titulo: `📅 ${cuando}: ${evento.titulo}`,
        mensaje: [evento.hora, evento.lugar].filter(Boolean).join(' · ') || null,
        fecha: hoy,
        dedupe: `evt:${evento.id}:${fecha}:${offset}`,
      })) nuevas++
    }
  }
  return nuevas
}

// ── Pushover ────────────────────────────────────────────────────────────────

async function sendPushover(settings, { titulo, mensaje, prioridad = 0, sonido = null }) {
  const body = new URLSearchParams({
    token: settings.pushover_token,
    user: settings.pushover_user,
    title: titulo,
    message: mensaje || titulo,
    priority: String([-1, 0, 1].includes(prioridad) ? prioridad : 0),
  })
  if (sonido) body.set('sound', sonido)
  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Pushover ${response.status}: ${detail.slice(0, 200)}`)
  }
}

// ¿Estamos en horario de silencio? (ventana Bogotá, puede cruzar medianoche)
function inQuietHours(settings, hora) {
  const inicio = Number(settings.silencio_inicio ?? 22)
  const fin = Number(settings.silencio_fin ?? 7)
  if (!Number.isInteger(inicio) || !Number.isInteger(fin) || inicio === fin) return false
  return inicio < fin ? hora >= inicio && hora < fin : hora >= inicio || hora < fin
}

function isPaused(settings) {
  const hasta = String(settings.pausado_hasta ?? '').trim()
  if (!hasta) return false
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(hasta) ? `${hasta}:00-05:00` : hasta
  const limit = new Date(normalized)
  return !Number.isNaN(limit.getTime()) && Date.now() < limit.getTime()
}

async function deliverPush(db, settings, hoy, hora) {
  if (settings.push_habilitado !== '1' || !settings.pushover_user || !settings.pushover_token) {
    return { enviadas: 0, retenidas: 0, error: null }
  }
  if (isPaused(settings)) {
    const n = await first(db, 'SELECT COUNT(*) AS n FROM notifications WHERE push_enviada = 0 AND fecha = ?', hoy)
    return { enviadas: 0, retenidas: Number(n?.n ?? 0), error: null }
  }

  const quiet = inQuietHours(settings, hora)
  const pendientes = await all(
    db,
    `SELECT id, titulo, mensaje, prioridad, sonido FROM notifications WHERE push_enviada = 0 AND fecha = ?`,
    hoy,
  )
  // En silencio solo pasan las de prioridad alta; el resto espera al fin de la ventana
  const paraEnviar = quiet ? pendientes.filter((n) => Number(n.prioridad) >= 1) : pendientes
  const retenidas = pendientes.length - paraEnviar.length

  let enviadas = 0
  let lastError = null

  if (settings.resumen_diario === '1' && paraEnviar.length > 1) {
    // Un solo push con todas las novedades
    try {
      await sendPushover(settings, {
        titulo: `🔔 Nibor — ${paraEnviar.length} novedades`,
        mensaje: paraEnviar.map((n) => `• ${n.titulo}`).join('\n'),
        prioridad: Math.max(...paraEnviar.map((n) => Number(n.prioridad ?? 0))),
      })
      for (const notif of paraEnviar) {
        await run(db, 'UPDATE notifications SET push_enviada = 1 WHERE id = ?', notif.id)
      }
      enviadas = paraEnviar.length
    } catch (err) {
      lastError = err.message
    }
  } else {
    for (const notif of paraEnviar) {
      try {
        await sendPushover(settings, {
          titulo: notif.titulo,
          mensaje: notif.mensaje,
          prioridad: Number(notif.prioridad ?? 0),
          sonido: notif.sonido,
        })
        await run(db, 'UPDATE notifications SET push_enviada = 1 WHERE id = ?', notif.id)
        enviadas++
      } catch (err) {
        lastError = err.message // se reintenta en el próximo run
      }
    }
  }
  return { enviadas, retenidas, error: lastError }
}

// ── Motor principal (exportado para el cron) ────────────────────────────────

export async function runChecks(env, overrides = {}) {
  const db = env.DB
  const settings = await getSettings(db)
  const now = nowBogota()
  const hoy = overrides.fecha ?? now.hoy
  const { hora, minuto } = now
  const horaEfectiva = overrides.hora ?? hora
  const minutoEfectivo = overrides.minuto ?? minuto

  let nuevas = 0
  if (settings.regla_suscripciones === '1') nuevas += await checkSuscripciones(db, settings, hoy)
  if (settings.regla_habitos === '1') {
    nuevas += await checkHabitos(db, settings, hoy, horaEfectiva, minutoEfectivo)
  }
  if (settings.regla_vehiculos === '1') {
    const umbrales = String(settings.vehiculos_umbrales ?? '180,90,30,15,8,3,0')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0)
    nuevas += await checkVehiculos(db, settings, hoy, umbrales)
  }
  if (settings.regla_eventos === '1') {
    nuevas += await checkEventos(db, settings, hoy, Number(settings.eventos_dias_antes ?? 1))
  }

  const push = await deliverPush(db, settings, hoy, horaEfectiva)
  return {
    fecha: hoy,
    nuevas,
    push_enviadas: push.enviadas,
    push_retenidas: push.retenidas,
    push_error: push.error,
    en_silencio: inQuietHours(settings, horaEfectiva),
    pausado: isPaused(settings),
  }
}

// ── Endpoints ───────────────────────────────────────────────────────────────

notifications.get('/', async (c) => {
  const limit = toInteger(c.req.query('limit'), 50)
  const fecha = c.req.query('fecha')
  const hasFecha = fecha !== undefined && fecha !== ''
  if (hasFecha && !isRealIsoDate(fecha)) return fail(c, 'fecha debe ser YYYY-MM-DD real')
  const params = hasFecha ? [fecha, Math.min(Math.max(limit, 1), 200)] : [Math.min(Math.max(limit, 1), 200)]
  const rows = await all(
    c.env.DB,
    `SELECT id, tipo, titulo, mensaje, fecha, leida, push_enviada, created_at
     FROM notifications
     ${hasFecha ? 'WHERE fecha = ?' : ''}
     ORDER BY fecha DESC, id DESC
     LIMIT ?`,
    ...params,
  )
  const unread = await first(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM notifications WHERE leida = 0${hasFecha ? ' AND fecha = ?' : ''}`,
    ...(hasFecha ? [fecha] : []),
  )
  return ok(c, { notificaciones: rows, no_leidas: Number(unread?.n ?? 0) })
})

notifications.post('/run', async (c) => {
  const body = (await readJson(c)) ?? {}
  const overrides = {}
  if (body.hora !== undefined) overrides.hora = toInteger(body.hora, undefined)
  if (body.minuto !== undefined) overrides.minuto = toInteger(body.minuto, undefined)
  if (body.fecha !== undefined) {
    if (!isRealIsoDate(body.fecha)) return fail(c, 'fecha debe ser YYYY-MM-DD real')
    overrides.fecha = body.fecha
  }
  return ok(c, await runChecks(c.env, overrides))
})

notifications.post('/read-all', async (c) => {
  await run(c.env.DB, 'UPDATE notifications SET leida = 1 WHERE leida = 0')
  return ok(c, { ok: true })
})

notifications.post('/:id/read', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const meta = await run(c.env.DB, 'UPDATE notifications SET leida = 1 WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Notificación no encontrada', 404)
  return ok(c, { id })
})

notifications.get('/settings', async (c) => {
  return ok(c, await getSettings(c.env.DB))
})

notifications.put('/settings', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  for (const [clave, valor] of Object.entries(body)) {
    if (!SETTING_KEYS.has(clave)) return fail(c, `Clave desconocida: ${clave}`)
    await run(
      c.env.DB,
      `INSERT INTO notification_settings (clave, valor, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
      clave,
      String(valor),
    )
  }
  return ok(c, await getSettings(c.env.DB))
})

notifications.post('/test-push', async (c) => {
  const settings = await getSettings(c.env.DB)
  if (!settings.pushover_user || !settings.pushover_token) {
    return fail(c, 'Configura primero pushover_user y pushover_token')
  }
  try {
    await sendPushover(settings, {
      titulo: '🔔 Nibor — prueba de notificación',
      mensaje: 'Si lees esto en tu celular, Pushover quedó conectado.',
    })
    return ok(c, { enviado: true })
  } catch (err) {
    return fail(c, err.message, 502)
  }
})

export default notifications
