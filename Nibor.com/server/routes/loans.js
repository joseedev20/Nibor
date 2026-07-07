import { Hono } from 'hono'
import { all, fail, first, isValidDate, ok, readJson, run, toInteger, toNumber } from '../db.js'

const loans = new Hono()
const VALID_STATUSES = new Set(['pendiente', 'devuelto'])

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function normalizeLoan(body, current = {}) {
  const next = {
    persona: body.persona === undefined ? current.persona : cleanText(body.persona),
    monto: body.monto === undefined ? Number(current.monto ?? 0) : toNumber(body.monto),
    fecha_prestamo: body.fecha_prestamo === undefined
      ? current.fecha_prestamo ?? todayIso()
      : cleanText(body.fecha_prestamo),
    fecha_devolucion: body.fecha_devolucion === undefined
      ? current.fecha_devolucion ?? null
      : cleanNullableText(body.fecha_devolucion),
    estado: body.estado === undefined ? current.estado ?? 'pendiente' : cleanText(body.estado),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }

  if (next.estado === 'pendiente') next.fecha_devolucion = null
  if (next.estado === 'devuelto' && !next.fecha_devolucion) next.fecha_devolucion = todayIso()

  return next
}

function validateLoan(loan) {
  if (!loan.persona) return 'La persona es obligatoria'
  if (!Number.isFinite(loan.monto) || loan.monto <= 0) return 'El monto debe ser mayor a 0'
  if (!isValidDate(loan.fecha_prestamo)) return 'La fecha del prestamo debe tener formato YYYY-MM-DD'
  if (!VALID_STATUSES.has(loan.estado)) return 'El estado debe ser pendiente o devuelto'
  if (loan.fecha_devolucion !== null && !isValidDate(loan.fecha_devolucion)) {
    return 'La fecha de devolucion debe tener formato YYYY-MM-DD'
  }
  if (loan.fecha_devolucion !== null && loan.fecha_devolucion < loan.fecha_prestamo) {
    return 'La fecha de devolucion no puede ser anterior al prestamo'
  }
  if (loan.notas && loan.notas.length > 600) return 'Las notas no pueden superar 600 caracteres'
  return null
}

async function getLoanById(db, id) {
  return first(
    db,
    `SELECT id, persona, monto, fecha_prestamo, fecha_devolucion, estado, notas, created_at, updated_at
     FROM loans
     WHERE id = ?`,
    id,
  )
}

async function getSummary(db) {
  const rows = await all(
    db,
    `SELECT estado, COUNT(*) AS total, COALESCE(SUM(monto), 0) AS monto
     FROM loans
     GROUP BY estado`,
  )

  const summary = {
    total_pendiente: 0,
    total_devuelto: 0,
    count_pendiente: 0,
    count_devuelto: 0,
    total_prestado: 0,
  }

  for (const row of rows) {
    if (row.estado === 'pendiente') {
      summary.total_pendiente = Number(row.monto ?? 0)
      summary.count_pendiente = Number(row.total ?? 0)
    }
    if (row.estado === 'devuelto') {
      summary.total_devuelto = Number(row.monto ?? 0)
      summary.count_devuelto = Number(row.total ?? 0)
    }
  }

  summary.total_prestado = summary.total_pendiente + summary.total_devuelto
  return summary
}

loans.get('/', async (c) => {
  const estado = c.req.query('estado')
  const q = cleanText(c.req.query('q'))
  const where = []
  const params = []

  if (estado !== undefined && estado !== 'todos') {
    if (!VALID_STATUSES.has(estado)) return fail(c, 'El estado debe ser pendiente o devuelto')
    where.push('estado = ?')
    params.push(estado)
  }

  if (q) {
    where.push('(persona LIKE ? OR notas LIKE ?)')
    params.push(`%${q}%`, `%${q}%`)
  }

  const rows = await all(
    c.env.DB,
    `SELECT id, persona, monto, fecha_prestamo, fecha_devolucion, estado, notas, created_at, updated_at
     FROM loans
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY
       CASE estado WHEN 'pendiente' THEN 1 ELSE 2 END,
       fecha_prestamo DESC,
       persona ASC`,
    ...params,
  )

  return ok(c, {
    loans: rows,
    summary: await getSummary(c.env.DB),
  })
})

loans.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const loan = normalizeLoan(body)
  const error = validateLoan(loan)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO loans (persona, monto, fecha_prestamo, fecha_devolucion, estado, notas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    loan.persona,
    loan.monto,
    loan.fecha_prestamo,
    loan.fecha_devolucion,
    loan.estado,
    loan.notas,
  )

  return ok(c, await getLoanById(c.env.DB, meta.last_row_id), 201)
})

loans.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getLoanById(c.env.DB, id)
  if (!current) return fail(c, 'Prestamo no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const loan = normalizeLoan(body, current)
  const error = validateLoan(loan)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE loans
     SET persona = ?, monto = ?, fecha_prestamo = ?, fecha_devolucion = ?, estado = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    loan.persona,
    loan.monto,
    loan.fecha_prestamo,
    loan.fecha_devolucion,
    loan.estado,
    loan.notas,
    id,
  )

  return ok(c, await getLoanById(c.env.DB, id))
})

loans.post('/:id/return', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getLoanById(c.env.DB, id)
  if (!current) return fail(c, 'Prestamo no encontrado', 404)

  const body = await readJson(c) ?? {}
  const fecha_devolucion = cleanNullableText(body.fecha_devolucion) ?? todayIso()
  if (!isValidDate(fecha_devolucion)) return fail(c, 'La fecha de devolucion debe tener formato YYYY-MM-DD')
  if (fecha_devolucion < current.fecha_prestamo) return fail(c, 'La fecha de devolucion no puede ser anterior al prestamo')

  await run(
    c.env.DB,
    `UPDATE loans
     SET estado = 'devuelto', fecha_devolucion = ?, updated_at = datetime('now')
     WHERE id = ?`,
    fecha_devolucion,
    id,
  )

  return ok(c, await getLoanById(c.env.DB, id))
})

loans.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM loans WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Prestamo no encontrado', 404)
  return ok(c, { id })
})

export default loans
