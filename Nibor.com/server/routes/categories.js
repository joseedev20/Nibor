import { Hono } from 'hono'
import { all, fail, first, ok, readJson, run, toInteger } from '../db.js'

const categories = new Hono()
const VALID_TYPES = new Set(['gasto', 'ingreso'])

function normalizeCategory(body, current = {}) {
  const nombre = body.nombre === undefined ? current.nombre : String(body.nombre).trim()
  const tipo = body.tipo === undefined ? current.tipo : String(body.tipo).trim()
  const icono = body.icono === undefined ? current.icono ?? null : body.icono ? String(body.icono).trim() : null
  const color = body.color === undefined ? current.color ?? null : body.color ? String(body.color).trim() : null

  return { nombre, tipo, icono, color }
}

categories.get('/', async (c) => {
  const tipo = c.req.query('tipo')
  const params = []
  let where = ''

  if (tipo !== undefined) {
    if (!VALID_TYPES.has(tipo)) return fail(c, 'El tipo debe ser gasto o ingreso')
    where = 'WHERE tipo = ?'
    params.push(tipo)
  }

  const rows = await all(
    c.env.DB,
    `SELECT id, nombre, tipo, icono, color
     FROM categories
     ${where}
     ORDER BY tipo ASC, nombre ASC`,
    ...params,
  )
  return ok(c, rows)
})

categories.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const category = normalizeCategory(body)
  if (!category.nombre) return fail(c, 'El nombre es obligatorio')
  if (!VALID_TYPES.has(category.tipo)) return fail(c, 'El tipo debe ser gasto o ingreso')

  const meta = await run(
    c.env.DB,
    `INSERT INTO categories (nombre, tipo, icono, color)
     VALUES (?, ?, ?, ?)`,
    category.nombre,
    category.tipo,
    category.icono,
    category.color,
  )
  const created = await first(c.env.DB, 'SELECT * FROM categories WHERE id = ?', meta.last_row_id)
  return ok(c, created, 201)
})

categories.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM categories WHERE id = ?', id)
  if (!current) return fail(c, 'Categoría no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const category = normalizeCategory(body, current)
  if (!category.nombre) return fail(c, 'El nombre es obligatorio')
  if (!VALID_TYPES.has(category.tipo)) return fail(c, 'El tipo debe ser gasto o ingreso')

  await run(
    c.env.DB,
    `UPDATE categories
     SET nombre = ?, tipo = ?, icono = ?, color = ?
     WHERE id = ?`,
    category.nombre,
    category.tipo,
    category.icono,
    category.color,
    id,
  )

  const updated = await first(c.env.DB, 'SELECT * FROM categories WHERE id = ?', id)
  return ok(c, updated)
})

categories.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const usage = await first(
    c.env.DB,
    `SELECT
       (SELECT COUNT(*) FROM movements WHERE categoria_id = ?) AS movement_count,
       (SELECT COUNT(*) FROM subscriptions WHERE categoria_id = ?) AS subscription_count`,
    id,
    id,
  )

  if ((usage?.movement_count ?? 0) > 0 || (usage?.subscription_count ?? 0) > 0) {
    return fail(c, 'No se puede borrar una categoría en uso', 409)
  }

  const meta = await run(c.env.DB, 'DELETE FROM categories WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Categoría no encontrada', 404)
  return ok(c, { id })
})

export default categories
