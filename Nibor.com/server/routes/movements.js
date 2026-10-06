import { Hono } from 'hono'
import {
  all,
  fail,
  first,
  getMonthBounds,
  getPeriodFromSearch,
  isNonNegative,
  isValidDate,
  ok,
  readJson,
  run,
  toInteger,
  toNumber,
} from '../db.js'

const movements = new Hono()
const VALID_TYPES = new Set(['gasto', 'ingreso'])

function buildMovementFilters(c) {
  const period = getPeriodFromSearch(c)
  if (period.error) return { error: period.error }

  const params = []
  const where = []

  if (period.mes) {
    const bounds = getMonthBounds(period.anio, period.mes)
    where.push('m.fecha BETWEEN ? AND ?')
    params.push(bounds.start, bounds.end)
  } else if (period.anio) {
    where.push('m.fecha BETWEEN ? AND ?')
    params.push(`${period.anio}-01-01`, `${period.anio}-12-31`)
  }

  const tipo = c.req.query('tipo')
  if (tipo !== undefined) {
    if (!VALID_TYPES.has(tipo)) return { error: 'El tipo debe ser gasto o ingreso' }
    where.push('m.tipo = ?')
    params.push(tipo)
  }

  const categoria_id = c.req.query('categoria_id')
  if (categoria_id !== undefined) {
    const categoryId = toInteger(categoria_id)
    if (!Number.isInteger(categoryId)) return { error: 'La categoría debe ser válida' }
    where.push('m.categoria_id = ?')
    params.push(categoryId)
  }

  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

async function getMovementById(db, id) {
  return first(
    db,
    `SELECT
       m.id, m.fecha, m.tipo, m.categoria_id, m.descripcion, m.monto, m.subscription_id, m.card_id, m.pago_tarjeta_id, m.vehicle_id,
       c.nombre AS categoria_nombre, c.icono AS categoria_icono, c.color AS categoria_color,
       t.nombre AS card_nombre, t.entidad AS card_entidad, t.ultimos_digitos AS card_ultimos_digitos,
       p.nombre AS pago_tarjeta_nombre,
       v.nombre AS vehicle_nombre, v.placa AS vehicle_placa
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     LEFT JOIN cards t ON t.id = m.card_id
     LEFT JOIN cards p ON p.id = m.pago_tarjeta_id
     LEFT JOIN vehicles v ON v.id = m.vehicle_id
     WHERE m.id = ?`,
    id,
  )
}

async function validateCategory(db, categoria_id, tipo) {
  if (categoria_id === null) return null
  const category = await first(db, 'SELECT id, tipo FROM categories WHERE id = ?', categoria_id)
  if (!category) return 'Categoría no encontrada'
  if (category.tipo !== tipo) return 'La categoría no coincide con el tipo del movimiento'
  return null
}

// pago_tarjeta_id marca "este gasto fue pagar la cuota de esa tarjeta de
// credito" (card_id sigue siendo de donde salio la plata). Solo tiene
// sentido sobre un gasto, y solo apuntando a una tarjeta tipo 'credito' —
// pagarle a una cuenta/debito no reduce ninguna deuda.
async function validatePagoTarjeta(db, pago_tarjeta_id) {
  if (pago_tarjeta_id === null) return null
  const card = await first(db, 'SELECT id, tipo FROM cards WHERE id = ?', pago_tarjeta_id)
  if (!card) return 'La tarjeta a pagar no existe'
  if (card.tipo !== 'credito') return 'Solo se puede marcar como pago a una tarjeta de crédito'
  return null
}

async function validateVehicle(db, vehicle_id) {
  if (vehicle_id === null) return null
  const vehicle = await first(db, 'SELECT id FROM vehicles WHERE id = ?', vehicle_id)
  if (!vehicle) return 'Vehículo no encontrado'
  return null
}

function normalizeMovement(body, current = {}) {
  return {
    fecha: body.fecha === undefined ? current.fecha : String(body.fecha).trim(),
    tipo: body.tipo === undefined ? current.tipo : String(body.tipo).trim(),
    categoria_id: body.categoria_id === undefined ? current.categoria_id ?? null : toInteger(body.categoria_id, null),
    descripcion: body.descripcion === undefined ? current.descripcion ?? '' : String(body.descripcion ?? '').trim(),
    monto: body.monto === undefined ? current.monto : toNumber(body.monto),
    subscription_id: body.subscription_id === undefined ? current.subscription_id ?? null : toInteger(body.subscription_id, null),
    card_id: body.card_id === undefined ? current.card_id ?? null : toInteger(body.card_id, null),
    pago_tarjeta_id: body.pago_tarjeta_id === undefined ? current.pago_tarjeta_id ?? null : toInteger(body.pago_tarjeta_id, null),
    vehicle_id: body.vehicle_id === undefined ? current.vehicle_id ?? null : toInteger(body.vehicle_id, null),
  }
}

function validateMovement(movement) {
  if (!isValidDate(movement.fecha)) return 'La fecha debe tener formato YYYY-MM-DD'
  if (!VALID_TYPES.has(movement.tipo)) return 'El tipo debe ser gasto o ingreso'
  if (movement.categoria_id !== null && !Number.isInteger(movement.categoria_id)) return 'La categoría debe ser válida'
  if (!isNonNegative(movement.monto)) return 'El monto debe ser mayor o igual a 0'
  if (movement.subscription_id !== null && !Number.isInteger(movement.subscription_id)) return 'La suscripción debe ser válida'
  if (movement.card_id !== null && !Number.isInteger(movement.card_id)) return 'La tarjeta debe ser válida'
  if (movement.pago_tarjeta_id !== null) {
    if (!Number.isInteger(movement.pago_tarjeta_id)) return 'La tarjeta a pagar debe ser válida'
    if (movement.tipo !== 'gasto') return 'Solo un gasto puede marcarse como pago a tarjeta de crédito'
  }
  if (movement.vehicle_id !== null) {
    if (!Number.isInteger(movement.vehicle_id)) return 'El vehículo debe ser válido'
    if (movement.tipo !== 'gasto') return 'Solo un gasto puede asociarse a un vehículo'
  }
  return null
}

movements.get('/', async (c) => {
  const filters = buildMovementFilters(c)
  if (filters.error) return fail(c, filters.error)

  const rows = await all(
    c.env.DB,
    `SELECT
       m.id, m.fecha, m.tipo, m.categoria_id, m.descripcion, m.monto, m.subscription_id, m.card_id, m.pago_tarjeta_id, m.vehicle_id,
       c.nombre AS categoria_nombre, c.icono AS categoria_icono, c.color AS categoria_color,
       t.nombre AS card_nombre, t.entidad AS card_entidad, t.ultimos_digitos AS card_ultimos_digitos,
       p.nombre AS pago_tarjeta_nombre,
       v.nombre AS vehicle_nombre, v.placa AS vehicle_placa
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     LEFT JOIN cards t ON t.id = m.card_id
     LEFT JOIN cards p ON p.id = m.pago_tarjeta_id
     LEFT JOIN vehicles v ON v.id = m.vehicle_id
     ${filters.sql}
     ORDER BY m.fecha DESC, m.id DESC`,
    ...filters.params,
  )
  return ok(c, rows)
})

movements.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const movement = normalizeMovement(body)
  const error = validateMovement(movement)
  if (error) return fail(c, error)

  const categoryError = await validateCategory(c.env.DB, movement.categoria_id, movement.tipo)
  if (categoryError) return fail(c, categoryError, 404)

  const pagoError = await validatePagoTarjeta(c.env.DB, movement.pago_tarjeta_id)
  if (pagoError) return fail(c, pagoError, 404)

  const vehicleError = await validateVehicle(c.env.DB, movement.vehicle_id)
  if (vehicleError) return fail(c, vehicleError, 404)

  const meta = await run(
    c.env.DB,
    `INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id, card_id, pago_tarjeta_id, vehicle_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    movement.fecha,
    movement.tipo,
    movement.categoria_id,
    movement.descripcion,
    movement.monto,
    movement.subscription_id,
    movement.card_id,
    movement.pago_tarjeta_id,
    movement.vehicle_id,
  )

  return ok(c, await getMovementById(c.env.DB, meta.last_row_id), 201)
})

movements.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM movements WHERE id = ?', id)
  if (!current) return fail(c, 'Movimiento no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const movement = normalizeMovement(body, current)
  const error = validateMovement(movement)
  if (error) return fail(c, error)

  const categoryError = await validateCategory(c.env.DB, movement.categoria_id, movement.tipo)
  if (categoryError) return fail(c, categoryError, 404)

  const pagoError = await validatePagoTarjeta(c.env.DB, movement.pago_tarjeta_id)
  if (pagoError) return fail(c, pagoError, 404)

  const vehicleError = await validateVehicle(c.env.DB, movement.vehicle_id)
  if (vehicleError) return fail(c, vehicleError, 404)

  await run(
    c.env.DB,
    `UPDATE movements
     SET fecha = ?, tipo = ?, categoria_id = ?, descripcion = ?, monto = ?, subscription_id = ?, card_id = ?, pago_tarjeta_id = ?, vehicle_id = ?
     WHERE id = ?`,
    movement.fecha,
    movement.tipo,
    movement.categoria_id,
    movement.descripcion,
    movement.monto,
    movement.subscription_id,
    movement.card_id,
    movement.pago_tarjeta_id,
    movement.vehicle_id,
    id,
  )

  return ok(c, await getMovementById(c.env.DB, id))
})

movements.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const meta = await run(c.env.DB, 'DELETE FROM movements WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Movimiento no encontrado', 404)
  return ok(c, { id })
})

export default movements
