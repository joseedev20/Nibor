import { Hono } from 'hono'
import {
  all,
  booleanToInt,
  fail,
  estimateSubscriptionCop,
  fetchUsdCopRateSafe,
  first,
  getMonthBounds,
  getPeriodFromSearch,
  isNonNegative,
  ok,
  prepareApplySubscriptionsStatement,
  readJson,
  run,
  toInteger,
  toNumber,
  toNullableNumber,
} from '../db.js'

const subscriptions = new Hono()

const VALID_TYPES = new Set(['gasto', 'ingreso'])
const VALID_CURRENCIES = new Set(['COP', 'USD'])

async function getSubscriptionById(db, id) {
  return first(
    db,
    `SELECT
       s.id, s.nombre, s.monto, s.moneda, s.monto_original, s.tasa_cambio, s.margen_tasa_pct, s.tasa_cambio_fecha,
       s.dia_cobro, s.categoria_id, s.activa, s.tipo, s.automatica, s.card_id,
       c.nombre AS categoria_nombre, c.icono AS categoria_icono, c.color AS categoria_color,
       t.nombre AS card_nombre, t.color AS card_color
     FROM subscriptions s
     LEFT JOIN categories c ON c.id = s.categoria_id
     LEFT JOIN cards t ON t.id = s.card_id
     WHERE s.id = ?`,
    id,
  )
}

async function validateCategory(db, categoria_id, tipo) {
  if (categoria_id === null) return null
  const category = await first(db, 'SELECT id, tipo FROM categories WHERE id = ?', categoria_id)
  if (!category) return 'Categoría no encontrada'
  if (category.tipo !== tipo) return 'La categoría no coincide con el tipo del recurrente'
  return null
}

function normalizeSubscription(body, current = {}) {
  const moneda = body.moneda === undefined ? current.moneda ?? 'COP' : String(body.moneda).trim().toUpperCase()
  const monto_original = body.monto_original === undefined
    ? current.monto_original ?? current.monto ?? 0
    : toNumber(body.monto_original)
  const tasa_cambio = body.tasa_cambio === undefined
    ? current.tasa_cambio ?? null
    : toNullableNumber(body.tasa_cambio)
  const margen_tasa_pct = body.margen_tasa_pct === undefined
    ? current.margen_tasa_pct ?? 0
    : toNumber(body.margen_tasa_pct)
  const monto = moneda === 'USD'
    ? estimateSubscriptionCop({ moneda, monto_original, tasa_cambio, margen_tasa_pct })
    : (body.monto === undefined ? current.monto : toNumber(body.monto))

  return {
    nombre: body.nombre === undefined ? current.nombre : String(body.nombre).trim(),
    monto,
    moneda,
    monto_original: moneda === 'COP' ? monto : monto_original,
    tasa_cambio: moneda === 'COP' ? null : tasa_cambio,
    margen_tasa_pct: moneda === 'COP' ? 0 : margen_tasa_pct,
    tasa_cambio_fecha: moneda === 'COP' ? null : String(body.tasa_cambio_fecha ?? current.tasa_cambio_fecha ?? '').trim() || null,
    dia_cobro: body.dia_cobro === undefined ? current.dia_cobro ?? 1 : toInteger(body.dia_cobro),
    categoria_id: body.categoria_id === undefined ? current.categoria_id ?? null : toInteger(body.categoria_id, null),
    activa: body.activa === undefined ? current.activa ?? 1 : booleanToInt(body.activa, current.activa ?? 1),
    tipo: body.tipo === undefined ? current.tipo ?? 'gasto' : String(body.tipo).trim(),
    automatica: body.automatica === undefined ? current.automatica ?? 1 : booleanToInt(body.automatica, current.automatica ?? 1),
    card_id: body.card_id === undefined ? current.card_id ?? null : toInteger(body.card_id, null),
  }
}

async function validateCard(db, card_id) {
  if (card_id === null) return null
  const card = await first(db, 'SELECT id FROM cards WHERE id = ?', card_id)
  return card ? null : 'Tarjeta no encontrada'
}

function validateSubscription(subscription) {
  if (!subscription.nombre) return 'El nombre es obligatorio'
  if (!isNonNegative(subscription.monto)) return 'El monto debe ser mayor o igual a 0'
  if (!VALID_CURRENCIES.has(subscription.moneda)) return 'La moneda debe ser COP o USD'
  if (!isNonNegative(subscription.monto_original)) return 'El monto original debe ser mayor o igual a 0'
  if (subscription.moneda === 'USD' && subscription.monto_original <= 0) return 'El monto en USD debe ser mayor a 0'
  if (subscription.moneda === 'USD' && (!isNonNegative(subscription.tasa_cambio) || subscription.tasa_cambio <= 0)) return 'La tasa USD/COP debe ser mayor a 0'
  if (!isNonNegative(subscription.margen_tasa_pct)) return 'El margen del banco debe ser mayor o igual a 0'
  if (!Number.isInteger(subscription.dia_cobro) || subscription.dia_cobro < 1 || subscription.dia_cobro > 31) {
    return 'El día de cobro debe estar entre 1 y 31'
  }
  if (subscription.categoria_id !== null && !Number.isInteger(subscription.categoria_id)) return 'La categoría debe ser válida'
  if (!VALID_TYPES.has(subscription.tipo)) return 'El tipo debe ser gasto o ingreso'
  return null
}

subscriptions.get('/', async (c) => {
  const active = c.req.query('activa')
  const tipo = c.req.query('tipo')
  const conditions = []
  const params = []

  if (active !== undefined) {
    conditions.push('s.activa = ?')
    params.push(booleanToInt(active, 1))
  }
  if (tipo !== undefined) {
    if (!VALID_TYPES.has(tipo)) return fail(c, 'El tipo debe ser gasto o ingreso')
    conditions.push('s.tipo = ?')
    params.push(tipo)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = await all(
    c.env.DB,
    `SELECT
       s.id, s.nombre, s.monto, s.moneda, s.monto_original, s.tasa_cambio, s.margen_tasa_pct, s.tasa_cambio_fecha,
       s.dia_cobro, s.categoria_id, s.activa, s.tipo, s.automatica, s.card_id,
       c.nombre AS categoria_nombre, c.icono AS categoria_icono, c.color AS categoria_color,
       t.nombre AS card_nombre, t.color AS card_color
     FROM subscriptions s
     LEFT JOIN categories c ON c.id = s.categoria_id
     LEFT JOIN cards t ON t.id = s.card_id
     ${where}
     ORDER BY s.activa DESC, s.dia_cobro ASC, s.nombre ASC`,
    ...params,
  )
  return ok(c, rows)
})

// Histórico anual: qué meses se aplicó cada fijo (desde movements) y totales.
// "desde" es el primer mes con movimiento en cualquier año.
subscriptions.get('/history', async (c) => {
  const anio = toInteger(c.req.query('anio'), new Date().getFullYear())
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return fail(c, 'El año debe ser válido')

  const [subs, applied, firsts] = await Promise.all([
    all(
      c.env.DB,
      `SELECT s.id, s.nombre, s.tipo, s.monto AS monto_actual, s.moneda, s.dia_cobro, s.activa, s.automatica,
              c.icono AS categoria_icono
       FROM subscriptions s
       LEFT JOIN categories c ON c.id = s.categoria_id
       ORDER BY s.tipo DESC, s.dia_cobro ASC, s.nombre ASC`,
    ),
    all(
      c.env.DB,
      `SELECT subscription_id, CAST(substr(fecha, 6, 2) AS INTEGER) AS mes, SUM(monto) AS monto, COUNT(*) AS pagos
       FROM movements
       WHERE subscription_id IS NOT NULL AND substr(fecha, 1, 4) = ?
       GROUP BY subscription_id, mes`,
      String(anio),
    ),
    all(
      c.env.DB,
      `SELECT subscription_id, MIN(fecha) AS desde
       FROM movements
       WHERE subscription_id IS NOT NULL
       GROUP BY subscription_id`,
    ),
  ])

  const bySub = new Map()
  for (const row of applied) {
    if (!bySub.has(row.subscription_id)) bySub.set(row.subscription_id, new Map())
    bySub.get(row.subscription_id).set(row.mes, { monto: Number(row.monto), pagos: Number(row.pagos) })
  }
  const desdeBySub = new Map(firsts.map((row) => [row.subscription_id, row.desde]))

  // Tolerancia para marcar un mes como flujo normal vs inusual (mora, ajustes)
  const TOLERANCIA = 0.15

  const data = subs.map((sub) => {
    const raw = Array.from({ length: 12 }, (_, i) => bySub.get(sub.id)?.get(i + 1) ?? null)
    const aplicados = raw.map((v, i) => (v ? i + 1 : 0)).filter(Boolean)
    const primero = aplicados[0] ?? null
    const ultimo = aplicados[aplicados.length - 1] ?? null
    const esperado = Number(sub.monto_actual ?? 0)

    const meses = raw.map((v, i) => {
      const mes = i + 1
      if (v) {
        const desviado = esperado > 0 && Math.abs(v.monto - esperado) > esperado * TOLERANCIA
        return { monto: v.monto, pagos: v.pagos, estado: v.pagos > 1 || desviado ? 'alerta' : 'ok' }
      }
      // Hueco: mes sin pago entre meses pagados (posible mora o mes sin registrar)
      if (primero && ultimo && mes > primero && mes < ultimo) return { monto: null, pagos: 0, estado: 'hueco' }
      return { monto: null, pagos: 0, estado: 'vacio' }
    })

    return {
      ...sub,
      desde: desdeBySub.get(sub.id) ?? null,
      meses,
      total_anio: raw.reduce((sum, v) => sum + (v?.monto ?? 0), 0),
      meses_aplicados: aplicados.length,
      alertas: meses.filter((m) => m.estado === 'alerta' || m.estado === 'hueco').length,
    }
  })

  return ok(c, { anio, subs: data })
})

// Recordatorios: fijos manuales (automatica = 0) activos sin movimiento en el mes.
subscriptions.get('/reminders', async (c) => {
  const period = getPeriodFromSearch(c)
  if (period.error) return fail(c, period.error)
  if (!period.mes) return fail(c, 'El mes es obligatorio')

  const { start, end } = getMonthBounds(period.anio, period.mes)
  const pendientes = await all(
    c.env.DB,
    `SELECT s.id, s.nombre, s.monto, s.tipo, s.dia_cobro
     FROM subscriptions s
     WHERE s.activa = 1 AND s.automatica = 0
       AND NOT EXISTS (
         SELECT 1 FROM movements m
         WHERE m.subscription_id = s.id AND m.fecha BETWEEN ? AND ?
       )
     ORDER BY s.dia_cobro ASC, s.nombre ASC`,
    start,
    end,
  )

  return ok(c, { anio: period.anio, mes: period.mes, pendientes })
})

subscriptions.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const subscription = normalizeSubscription(body)
  const error = validateSubscription(subscription)
  if (error) return fail(c, error)

  const categoryError = await validateCategory(c.env.DB, subscription.categoria_id, subscription.tipo)
  if (categoryError) return fail(c, categoryError, 404)

  const cardError = await validateCard(c.env.DB, subscription.card_id)
  if (cardError) return fail(c, cardError, 404)

  const meta = await run(
    c.env.DB,
    `INSERT INTO subscriptions (nombre, monto, moneda, monto_original, tasa_cambio, margen_tasa_pct, tasa_cambio_fecha, dia_cobro, categoria_id, activa, tipo, automatica, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    subscription.nombre,
    subscription.monto,
    subscription.moneda,
    subscription.monto_original,
    subscription.tasa_cambio,
    subscription.margen_tasa_pct,
    subscription.tasa_cambio_fecha,
    subscription.dia_cobro,
    subscription.categoria_id,
    subscription.activa,
    subscription.tipo,
    subscription.automatica,
    subscription.card_id,
  )

  return ok(c, await getSubscriptionById(c.env.DB, meta.last_row_id), 201)
})

subscriptions.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM subscriptions WHERE id = ?', id)
  if (!current) return fail(c, 'Suscripción no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const subscription = normalizeSubscription(body, current)
  const error = validateSubscription(subscription)
  if (error) return fail(c, error)

  const categoryError = await validateCategory(c.env.DB, subscription.categoria_id, subscription.tipo)
  if (categoryError) return fail(c, categoryError, 404)

  const cardError = await validateCard(c.env.DB, subscription.card_id)
  if (cardError) return fail(c, cardError, 404)

  await run(
    c.env.DB,
    `UPDATE subscriptions
     SET nombre = ?, monto = ?, moneda = ?, monto_original = ?, tasa_cambio = ?, margen_tasa_pct = ?, tasa_cambio_fecha = ?,
         dia_cobro = ?, categoria_id = ?, activa = ?, tipo = ?, automatica = ?, card_id = ?
     WHERE id = ?`,
    subscription.nombre,
    subscription.monto,
    subscription.moneda,
    subscription.monto_original,
    subscription.tasa_cambio,
    subscription.margen_tasa_pct,
    subscription.tasa_cambio_fecha,
    subscription.dia_cobro,
    subscription.categoria_id,
    subscription.activa,
    subscription.tipo,
    subscription.automatica,
    subscription.card_id,
    id,
  )

  return ok(c, await getSubscriptionById(c.env.DB, id))
})

subscriptions.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const usage = await first(c.env.DB, 'SELECT COUNT(*) AS movement_count FROM movements WHERE subscription_id = ?', id)
  if ((usage?.movement_count ?? 0) > 0) {
    return fail(c, 'No se puede borrar una suscripción con movimientos aplicados', 409)
  }

  const meta = await run(c.env.DB, 'DELETE FROM subscriptions WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Suscripción no encontrada', 404)
  return ok(c, { id })
})

subscriptions.post('/apply', async (c) => {
  const period = getPeriodFromSearch(c)
  if (period.error) return fail(c, period.error)
  if (!period.mes) return fail(c, 'El mes es obligatorio para aplicar suscripciones')

  const { start, end } = getMonthBounds(period.anio, period.mes)
  const activeSubscriptions = await all(
    c.env.DB,
    `SELECT id, nombre, monto, moneda, monto_original, tasa_cambio, margen_tasa_pct, tasa_cambio_fecha,
            dia_cobro, categoria_id
     FROM subscriptions
     WHERE activa = 1
     ORDER BY dia_cobro ASC, nombre ASC`,
  )

  const created = []
  const skipped = []
  const existingBySubscription = new Map()

  for (const subscription of activeSubscriptions) {
    const existing = await first(
      c.env.DB,
      `SELECT id
       FROM movements
       WHERE subscription_id = ? AND fecha BETWEEN ? AND ?`,
      subscription.id,
      start,
      end,
    )

    if (existing) {
      existingBySubscription.set(subscription.id, existing.id)
      skipped.push({ subscription_id: subscription.id, movement_id: existing.id })
    }
  }

  const usdRate = activeSubscriptions.some((subscription) => subscription.moneda === 'USD')
    ? await fetchUsdCopRateSafe()
    : null

  await prepareApplySubscriptionsStatement(c.env.DB, period.anio, period.mes, usdRate?.tasa).run()

  for (const subscription of activeSubscriptions) {
    if (existingBySubscription.has(subscription.id)) continue

    const movement = await first(
      c.env.DB,
      `SELECT *
       FROM movements
       WHERE subscription_id = ? AND fecha BETWEEN ? AND ?
       ORDER BY id DESC
       LIMIT 1`,
      subscription.id,
      start,
      end,
    )

    if (movement) {
      created.push({ subscription_id: subscription.id, movement })
    }
  }

  return ok(c, {
    anio: period.anio,
    mes: period.mes,
    usd_cop: usdRate,
    created,
    skipped,
  })
})

export default subscriptions
