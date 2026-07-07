// Helpers mínimos para D1. Siempre statements preparados (ver CONVENCIONES.md).

/** Lista de filas: all(c.env.DB, 'SELECT ... WHERE anio = ?', anio) */
export async function all(db, sql, ...params) {
  const { results } = await db.prepare(sql).bind(...params).all()
  return results
}

/** Primera fila o null */
export function first(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first()
}

/** INSERT/UPDATE/DELETE. Devuelve meta (last_row_id, changes) */
export async function run(db, sql, ...params) {
  const { meta } = await db.prepare(sql).bind(...params).run()
  return meta
}

// ── Fórmulas financieras (única fuente de verdad, PLAN.md §3) ──────────────

/**
 * Enriquece un snapshot con sus campos calculados.
 * saldo_final NULL = mes pendiente → ganancia y rentabilidad null.
 */
export function computeSnapshot(s) {
  const saldo_total_inicial = Number(s.saldo_inicial ?? 0) + Number(s.aporte ?? 0)
  const pending = s.saldo_final === null || s.saldo_final === undefined
  const ganancia = pending ? null : Number(s.saldo_final) + Number(s.retiros ?? 0) - saldo_total_inicial
  const rentabilidad = pending || saldo_total_inicial <= 0 ? null : ganancia / saldo_total_inicial
  return { ...s, saldo_total_inicial, ganancia, rentabilidad, pendiente: pending }
}

export function ok(c, data, status = 200) {
  return c.json({ data }, status)
}

export function fail(c, message, status = 400) {
  return c.json({ error: message }, status)
}

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

export function toInteger(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isInteger(number) ? number : Number.NaN
}

export function booleanToInt(value, fallback = 1) {
  if (value === null || value === undefined) return fallback
  return value === true || value === 1 || value === '1' ? 1 : 0
}

export function isNonNegative(number) {
  return Number.isFinite(number) && number >= 0
}

export function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function getPeriodFromSearch(c) {
  const anio = toInteger(c.req.query('anio'), new Date().getFullYear())
  const mes = toInteger(c.req.query('mes'), null)

  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) {
    return { error: 'El año debe ser válido' }
  }

  if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return { error: 'El mes debe estar entre 1 y 12' }
  }

  return { anio, mes }
}

export function getMonthBounds(anio, mes) {
  const lastDay = new Date(anio, mes, 0).getDate()
  const paddedMonth = String(mes).padStart(2, '0')
  return {
    start: `${anio}-${paddedMonth}-01`,
    end: `${anio}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
    lastDay,
  }
}

const USD_COP_TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$select=valor,vigenciadesde,vigenciahasta&$order=vigenciadesde%20DESC&$limit=1'

export async function fetchUsdCopRate() {
  const response = await fetch(USD_COP_TRM_URL, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error('No se pudo consultar la TRM')

  const rows = await response.json()
  const row = Array.isArray(rows) ? rows[0] : null
  const tasa = Number(row?.valor)
  if (!Number.isFinite(tasa) || tasa <= 0) throw new Error('La TRM recibida no es valida')

  return {
    moneda_origen: 'USD',
    moneda_destino: 'COP',
    tasa,
    vigencia_desde: row.vigenciadesde?.slice(0, 10) ?? null,
    vigencia_hasta: row.vigenciahasta?.slice(0, 10) ?? null,
    fuente: 'Datos Abiertos Colombia - TRM',
  }
}

export async function fetchUsdCopRateSafe() {
  try {
    return await fetchUsdCopRate()
  } catch {
    return null
  }
}

export function estimateSubscriptionCop(subscription, usdRate = null) {
  if ((subscription.moneda ?? 'COP') !== 'USD') return Number(subscription.monto ?? 0)

  const original = Number(subscription.monto_original ?? subscription.monto ?? 0)
  const rate = usdRate !== null && usdRate !== undefined && Number.isFinite(Number(usdRate))
    ? Number(usdRate)
    : Number(subscription.tasa_cambio ?? 0)
  const margin = Number(subscription.margen_tasa_pct ?? 0)
  if (!Number.isFinite(original) || !Number.isFinite(rate) || original <= 0 || rate <= 0) return Number.NaN
  return Math.round(original * rate * (1 + margin / 100) * 100) / 100
}

export function prepareApplySubscriptionsStatement(db, anio, mes, usdRate = null) {
  const { start, end, lastDay } = getMonthBounds(anio, mes)
  const normalizedUsdRate = Number.isFinite(Number(usdRate)) ? Number(usdRate) : null

  return db.prepare(
    `INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id)
     SELECT
       printf('%04d-%02d-%02d', ?, ?, CASE WHEN dia_cobro > ? THEN ? ELSE dia_cobro END),
       s.tipo,
       categoria_id,
       CASE
         WHEN s.moneda = 'USD' THEN
           s.nombre || ' (' || printf('%.2f USD', s.monto_original) || ' @ ' || printf('%.2f', COALESCE(?, s.tasa_cambio, 0)) ||
           CASE WHEN COALESCE(s.margen_tasa_pct, 0) > 0 THEN ' + ' || printf('%.2f%%', s.margen_tasa_pct) ELSE '' END ||
           ')'
         ELSE s.nombre
       END,
       ROUND(
         CASE
           WHEN s.moneda = 'USD' THEN s.monto_original * COALESCE(?, s.tasa_cambio, 0) * (1 + COALESCE(s.margen_tasa_pct, 0) / 100.0)
           ELSE s.monto
         END,
         2
       ),
       id
     FROM subscriptions s
     WHERE activa = 1
       AND NOT EXISTS (
         SELECT 1
         FROM movements m
         WHERE m.subscription_id = s.id
           AND m.fecha BETWEEN ? AND ?
       )`,
  ).bind(anio, mes, lastDay, lastDay, normalizedUsdRate, normalizedUsdRate, start, end)
}

export async function readJson(c) {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

export function isUniqueError(error) {
  return String(error?.message ?? error).toLowerCase().includes('unique')
}
