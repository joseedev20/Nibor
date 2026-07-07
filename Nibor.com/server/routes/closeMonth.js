import { Hono } from 'hono'
import {
  all,
  fail,
  fetchUsdCopRateSafe,
  getMonthBounds,
  isNonNegative,
  isValidDate,
  ok,
  prepareApplySubscriptionsStatement,
  readJson,
  toInteger,
  toNullableNumber,
  toNumber,
} from '../db.js'
import { buildSummaryData } from './summary.js'

const closeMonth = new Hono()
const VALID_TYPES = new Set(['gasto', 'ingreso'])

function previousPeriod(anio, mes) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

function parseClosePeriod(body) {
  const anio = toInteger(body?.anio)
  const mes = toInteger(body?.mes)

  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return { error: 'El año debe ser válido' }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { error: 'El mes debe estar entre 1 y 12' }

  return { anio, mes }
}

function normalizeSnapshot(input) {
  const platform_id = toInteger(input?.platform_id)
  const saldo_inicial = input?.saldo_inicial === undefined ? null : toNullableNumber(input.saldo_inicial)
  const aporte = toNumber(input?.aporte, 0)
  const retiros = toNumber(input?.retiros, 0)
  const saldo_final = toNullableNumber(input?.saldo_final)

  if (!Number.isInteger(platform_id)) return { error: 'La plataforma del snapshot es obligatoria' }
  if (saldo_inicial !== null && !isNonNegative(saldo_inicial)) return { error: 'El saldo inicial debe ser mayor o igual a 0' }
  if (!isNonNegative(aporte)) return { error: 'El aporte debe ser mayor o igual a 0' }
  if (!isNonNegative(retiros)) return { error: 'Los retiros deben ser mayores o iguales a 0' }
  if (!isNonNegative(saldo_final)) return { error: 'El saldo final es obligatorio y debe ser mayor o igual a 0' }

  return { platform_id, saldo_inicial, aporte, retiros, saldo_final }
}

function normalizeMovement(input, bounds) {
  const fecha = String(input?.fecha ?? '').trim()
  const tipo = String(input?.tipo ?? '').trim()
  const categoria_id = input?.categoria_id === undefined || input?.categoria_id === null || input?.categoria_id === ''
    ? null
    : toInteger(input.categoria_id)
  const descripcion = String(input?.descripcion ?? '').trim()
  const monto = toNumber(input?.monto)

  if (!isValidDate(fecha)) return { error: 'La fecha del movimiento debe tener formato YYYY-MM-DD' }
  if (fecha < bounds.start || fecha > bounds.end) return { error: 'La fecha del movimiento debe pertenecer al mes de cierre' }
  if (!VALID_TYPES.has(tipo)) return { error: 'El tipo de movimiento debe ser gasto o ingreso' }
  if (categoria_id !== null && !Number.isInteger(categoria_id)) return { error: 'La categoría del movimiento debe ser válida' }
  if (!isNonNegative(monto)) return { error: 'El monto del movimiento debe ser mayor o igual a 0' }

  return { fecha, tipo, categoria_id, descripcion, monto }
}

async function validateReferences(db, snapshots, movements) {
  const platformIds = [...new Set(snapshots.map((snapshot) => snapshot.platform_id))]
  if (platformIds.length) {
    const placeholders = platformIds.map(() => '?').join(', ')
    const rows = await all(db, `SELECT id FROM platforms WHERE id IN (${placeholders})`, ...platformIds)
    const existing = new Set(rows.map((row) => row.id))
    const missing = platformIds.find((id) => !existing.has(id))
    if (missing) return `Plataforma no encontrada: ${missing}`
  }

  const categoryIds = [...new Set(movements.map((movement) => movement.categoria_id).filter((id) => id !== null))]
  if (categoryIds.length) {
    const placeholders = categoryIds.map(() => '?').join(', ')
    const rows = await all(db, `SELECT id, tipo FROM categories WHERE id IN (${placeholders})`, ...categoryIds)
    const byId = new Map(rows.map((row) => [row.id, row.tipo]))

    for (const movement of movements) {
      if (movement.categoria_id === null) continue
      const categoryType = byId.get(movement.categoria_id)
      if (!categoryType) return `Categoría no encontrada: ${movement.categoria_id}`
      if (categoryType !== movement.tipo) return 'La categoría no coincide con el tipo del movimiento'
    }
  }

  return null
}

function prepareSnapshotStatement(db, period, snapshot) {
  const previous = previousPeriod(period.anio, period.mes)

  return db.prepare(
    `INSERT INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final)
     VALUES (
       ?, ?, ?,
       COALESCE(
         ?,
         (
           SELECT saldo_final
           FROM snapshots
           WHERE platform_id = ? AND anio = ? AND mes = ? AND saldo_final IS NOT NULL
         ),
         0
       ),
       ?, ?, ?
     )
     ON CONFLICT(platform_id, anio, mes) DO UPDATE SET
       saldo_inicial = excluded.saldo_inicial,
       aporte = excluded.aporte,
       retiros = excluded.retiros,
       saldo_final = excluded.saldo_final`,
  ).bind(
    snapshot.platform_id,
    period.anio,
    period.mes,
    snapshot.saldo_inicial,
    snapshot.platform_id,
    previous.anio,
    previous.mes,
    snapshot.aporte,
    snapshot.retiros,
    snapshot.saldo_final,
  )
}

function prepareMovementStatement(db, movement) {
  return db.prepare(
    `INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).bind(
    movement.fecha,
    movement.tipo,
    movement.categoria_id,
    movement.descripcion,
    movement.monto,
  )
}

closeMonth.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const period = parseClosePeriod(body)
  if (period.error) return fail(c, period.error)

  const rawSnapshots = Array.isArray(body.snapshots) ? body.snapshots : []
  const rawMovements = Array.isArray(body.movimientos) ? body.movimientos : []
  const bounds = getMonthBounds(period.anio, period.mes)

  const snapshots = []
  for (const input of rawSnapshots) {
    const snapshot = normalizeSnapshot(input)
    if (snapshot.error) return fail(c, snapshot.error)
    snapshots.push(snapshot)
  }

  const movements = []
  for (const input of rawMovements) {
    const movement = normalizeMovement(input, bounds)
    if (movement.error) return fail(c, movement.error)
    movements.push(movement)
  }

  const referenceError = await validateReferences(c.env.DB, snapshots, movements)
  if (referenceError) return fail(c, referenceError, 404)

  const statements = [
    ...snapshots.map((snapshot) => prepareSnapshotStatement(c.env.DB, period, snapshot)),
    ...movements.map((movement) => prepareMovementStatement(c.env.DB, movement)),
  ]

  if (body.aplicar_suscripciones === true) {
    const subscriptions = await all(c.env.DB, 'SELECT moneda FROM subscriptions WHERE activa = 1')
    const usdRate = subscriptions.some((subscription) => subscription.moneda === 'USD')
      ? await fetchUsdCopRateSafe()
      : null
    statements.push(prepareApplySubscriptionsStatement(c.env.DB, period.anio, period.mes, usdRate?.tasa))
  }

  if (statements.length) {
    await c.env.DB.batch(statements)
  }

  return ok(c, await buildSummaryData(c.env.DB, period.anio, period.mes), 201)
})

export default closeMonth
