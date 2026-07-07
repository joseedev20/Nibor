import { Hono } from 'hono'
import { all, booleanToInt, fail, first, isUniqueError, ok, readJson, run, toInteger } from '../db.js'

const platforms = new Hono()
const VALID_PLATFORM_TYPES = new Set(['inversion', 'fondo'])

platforms.get('/', async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT id, nombre, color, orden, activa, tipo
     FROM platforms
     ORDER BY orden ASC, nombre ASC`,
  )
  return ok(c, rows)
})

platforms.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = String(body.nombre ?? '').trim()
  const color = String(body.color ?? '#64748b').trim()
  const orden = toInteger(body.orden, 0)
  const activa = booleanToInt(body.activa, 1)
  const tipo = String(body.tipo ?? 'inversion').trim()

  if (!nombre) return fail(c, 'El nombre es obligatorio')
  if (!color) return fail(c, 'El color es obligatorio')
  if (!Number.isInteger(orden)) return fail(c, 'El orden debe ser entero')
  if (!VALID_PLATFORM_TYPES.has(tipo)) return fail(c, 'El tipo debe ser inversion o fondo')

  try {
    const meta = await run(
      c.env.DB,
      `INSERT INTO platforms (nombre, color, orden, activa, tipo)
       VALUES (?, ?, ?, ?, ?)`,
      nombre,
      color,
      orden,
      activa,
      tipo,
    )
    const created = await first(c.env.DB, 'SELECT * FROM platforms WHERE id = ?', meta.last_row_id)
    return ok(c, created, 201)
  } catch (error) {
    if (isUniqueError(error)) return fail(c, 'Ya existe una plataforma con esos datos', 409)
    throw error
  }
})

platforms.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM platforms WHERE id = ?', id)
  if (!current) return fail(c, 'Plataforma no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = body.nombre === undefined ? current.nombre : String(body.nombre).trim()
  const color = body.color === undefined ? current.color : String(body.color).trim()
  const orden = body.orden === undefined ? current.orden : toInteger(body.orden)
  const activa = body.activa === undefined ? current.activa : booleanToInt(body.activa, current.activa)
  const tipo = body.tipo === undefined ? current.tipo ?? 'inversion' : String(body.tipo).trim()

  if (!nombre) return fail(c, 'El nombre es obligatorio')
  if (!color) return fail(c, 'El color es obligatorio')
  if (!Number.isInteger(orden)) return fail(c, 'El orden debe ser entero')
  if (!VALID_PLATFORM_TYPES.has(tipo)) return fail(c, 'El tipo debe ser inversion o fondo')

  await run(
    c.env.DB,
    `UPDATE platforms
     SET nombre = ?, color = ?, orden = ?, activa = ?, tipo = ?
     WHERE id = ?`,
    nombre,
    color,
    orden,
    activa,
    tipo,
    id,
  )

  const updated = await first(c.env.DB, 'SELECT * FROM platforms WHERE id = ?', id)
  return ok(c, updated)
})

export default platforms
