import { Hono } from 'hono'
import { all, first, isUniqueError, isValidDate, readJson, run, toInteger, toNumber } from '../db.js'
import { guarded, tokenFailure, withDbTimeout } from '../widgetKit.js'

const widgetExpenses = new Hono()
const EXTERNAL_SOURCE = 'iphone_shortcut_expense'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/
const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function isValidExpenseToken(c) {
  const expected = String(c.env.EXPENSES_SHORTCUT_TOKEN ?? '').trim()
  return Boolean(expected) && String(c.req.query('token') ?? '') === expected
}

function bogotaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function errorResult(status, text, code, extraLog = { auth: 'ok' }) {
  return {
    status,
    payload: { success: false, data: { text }, error: { code } },
    extraLog,
  }
}

async function listExpenseCategories(db) {
  return all(
    db,
    `SELECT id, nombre, icono, color
     FROM categories
     WHERE tipo = 'gasto'
     ORDER BY nombre ASC`,
  )
}

async function resolveExpenseCategory(db, body) {
  if (body.categoria_id !== undefined && body.categoria_id !== null && body.categoria_id !== '') {
    const id = toInteger(body.categoria_id)
    if (!Number.isInteger(id)) return { error: 'La categoría debe ser válida', status: 400, code: 'BAD_REQUEST' }

    const category = await first(
      db,
      `SELECT id, nombre, icono, color
       FROM categories
       WHERE id = ? AND tipo = 'gasto'`,
      id,
    )
    return category
      ? { category }
      : { error: 'Categoría de gasto no encontrada', status: 404, code: 'CATEGORY_NOT_FOUND' }
  }

  const name = String(body.categoria ?? '').trim()
  if (!name) return { error: 'Falta la categoría o categoria_id', status: 400, code: 'BAD_REQUEST' }

  const matches = await all(
    db,
    `SELECT id, nombre, icono, color
     FROM categories
     WHERE tipo = 'gasto' AND LOWER(nombre) = LOWER(?)
     ORDER BY id ASC`,
    name,
  )
  if (!matches.length) return { error: `Categoría de gasto no encontrada: ${name}`, status: 404, code: 'CATEGORY_NOT_FOUND' }
  if (matches.length > 1) {
    return {
      error: `Hay varias categorías llamadas ${name}; usa categoria_id`,
      status: 409,
      code: 'AMBIGUOUS_CATEGORY',
    }
  }
  return { category: matches[0] }
}

function normalizeExpense(body, c) {
  const monto = toNumber(body.monto)
  const descripcion = String(body.descripcion ?? '').trim()
  const fecha = String(body.fecha ?? '').trim() || bogotaToday()
  const request_id = String(
    body.request_id
      ?? body.idempotency_key
      ?? c.req.header('idempotency-key')
      ?? '',
  ).trim()

  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: 'El monto debe ser mayor a 0', status: 400, code: 'BAD_REQUEST' }
  }
  if (!descripcion) return { error: 'La descripción es obligatoria', status: 400, code: 'BAD_REQUEST' }
  if (descripcion.length > 200) {
    return { error: 'La descripción no puede superar 200 caracteres', status: 400, code: 'BAD_REQUEST' }
  }
  if (!isValidDate(fecha)) {
    return { error: 'La fecha debe existir y tener formato YYYY-MM-DD', status: 400, code: 'BAD_REQUEST' }
  }
  if (!REQUEST_ID_PATTERN.test(request_id)) {
    return {
      error: 'request_id debe ser un UUID o identificador de 8 a 128 caracteres',
      status: 400,
      code: 'BAD_REQUEST',
    }
  }

  return { expense: { monto, descripcion, fecha, request_id } }
}

async function getExpenseByRequestId(db, requestId) {
  return first(
    db,
    `SELECT
       m.id, m.fecha, m.categoria_id, m.descripcion, m.monto,
       m.external_id AS request_id,
       c.nombre AS categoria, c.icono AS categoria_icono
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     WHERE m.external_source = ? AND m.external_id = ?`,
    EXTERNAL_SOURCE,
    requestId,
  )
}

async function getExpenseById(db, id) {
  return first(
    db,
    `SELECT
       m.id, m.fecha, m.categoria_id, m.descripcion, m.monto,
       m.external_id AS request_id,
       c.nombre AS categoria, c.icono AS categoria_icono
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     WHERE m.id = ?`,
    id,
  )
}

function matchesExisting(existing, expense, categoryId) {
  return existing.fecha === expense.fecha
    && existing.categoria_id === categoryId
    && existing.descripcion === expense.descripcion
    && Math.abs(Number(existing.monto) - expense.monto) < 0.000001
}

function successResult(movement, duplicate, dbMs) {
  const icon = movement.categoria_icono ? `${movement.categoria_icono} ` : ''
  const duplicateText = duplicate ? ' (ya estaba registrado)' : ''
  return {
    status: duplicate ? 200 : 201,
    payload: {
      success: true,
      data: {
        text: `✅ Gasto registrado${duplicateText}: ${copFormatter.format(Number(movement.monto))} · ${movement.descripcion} · ${icon}${movement.categoria}`,
        duplicado: duplicate,
        movimiento: movement,
      },
    },
    extraLog: { auth: 'ok', dbMs, duplicate, movementId: movement.id },
  }
}

// GET sirve el catálogo para "Elegir de la lista" en Atajos. No devuelve
// movimientos ni totales financieros.
widgetExpenses.get('/', (c) => guarded(c, '/api/widget/expenses', async () => {
  if (!isValidExpenseToken(c)) return tokenFailure()

  const dbStart = Date.now()
  const categories = await withDbTimeout(listExpenseCategories(c.env.DB), 'listarCategoriasGasto')
  const dbMs = Date.now() - dbStart
  return {
    status: 200,
    payload: {
      success: true,
      data: {
        text: `${categories.length} categorías de gasto disponibles`,
        categorias: categories,
        categorias_nombres: categories.map((category) => category.nombre),
      },
    },
    extraLog: { auth: 'ok', dbMs, categoryCount: categories.length },
  }
}))

// POST registra un gasto. request_id es obligatorio para que un reintento del
// Atajo responda con el movimiento existente sin insertar un duplicado.
widgetExpenses.post('/', (c) => guarded(c, '/api/widget/expenses', async () => {
  if (!isValidExpenseToken(c)) return tokenFailure()

  const body = await readJson(c)
  if (!body) return errorResult(400, 'Body JSON inválido', 'BAD_REQUEST')

  const normalized = normalizeExpense(body, c)
  if (normalized.error) return errorResult(normalized.status, normalized.error, normalized.code)

  const dbStart = Date.now()
  const categoryResult = await withDbTimeout(resolveExpenseCategory(c.env.DB, body), 'buscarCategoriaGasto')
  if (categoryResult.error) {
    return errorResult(categoryResult.status, categoryResult.error, categoryResult.code, {
      auth: 'ok',
      dbMs: Date.now() - dbStart,
    })
  }

  const expense = normalized.expense
  const category = categoryResult.category
  let existing = await withDbTimeout(
    getExpenseByRequestId(c.env.DB, expense.request_id),
    'buscarGastoIdempotente',
  )
  if (existing) {
    if (!matchesExisting(existing, expense, category.id)) {
      return errorResult(
        409,
        'request_id ya fue usado por otro gasto; genera un UUID nuevo',
        'IDEMPOTENCY_CONFLICT',
        { auth: 'ok', dbMs: Date.now() - dbStart, duplicate: true, conflict: true },
      )
    }
    return successResult(existing, true, Date.now() - dbStart)
  }

  let meta
  try {
    meta = await withDbTimeout(
      run(
        c.env.DB,
        `INSERT INTO movements (
           fecha, tipo, categoria_id, descripcion, monto, subscription_id,
           external_source, external_id
         )
         VALUES (?, 'gasto', ?, ?, ?, NULL, ?, ?)`,
        expense.fecha,
        category.id,
        expense.descripcion,
        expense.monto,
        EXTERNAL_SOURCE,
        expense.request_id,
      ),
      'crearGastoAtajo',
    )
  } catch (error) {
    if (!isUniqueError(error)) throw error
    existing = await withDbTimeout(
      getExpenseByRequestId(c.env.DB, expense.request_id),
      'recuperarGastoIdempotente',
    )
    if (!existing || !matchesExisting(existing, expense, category.id)) {
      return errorResult(
        409,
        'request_id ya fue usado por otro gasto; genera un UUID nuevo',
        'IDEMPOTENCY_CONFLICT',
        { auth: 'ok', dbMs: Date.now() - dbStart, duplicate: true, conflict: true },
      )
    }
    return successResult(existing, true, Date.now() - dbStart)
  }

  const movement = await withDbTimeout(getExpenseById(c.env.DB, meta.last_row_id), 'leerGastoAtajo')
  return successResult(movement, false, Date.now() - dbStart)
}))

export default widgetExpenses
