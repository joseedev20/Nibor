import { Hono } from 'hono'
import { all, booleanToInt, fail, first, ok, readJson, run, toInteger } from '../db.js'

// Tarjetas: SOLO nombre identificador y color. Nunca guardar números,
// vencimientos, CVV ni datos sensibles de la tarjeta.
const cards = new Hono()

cards.get('/', async (c) => {
  const active = c.req.query('activa')
  const params = []
  let where = ''
  if (active !== undefined) {
    where = 'WHERE c.activa = ?'
    params.push(booleanToInt(active, 1))
  }

  const rows = await all(
    c.env.DB,
    `SELECT c.id, c.nombre, c.color, c.activa,
            COUNT(s.id) AS suscripciones,
            COALESCE(SUM(CASE WHEN s.activa = 1 AND s.tipo = 'gasto' THEN s.monto ELSE 0 END), 0) AS total_mensual
     FROM cards c
     LEFT JOIN subscriptions s ON s.card_id = c.id
     ${where}
     GROUP BY c.id, c.nombre, c.color, c.activa
     ORDER BY c.activa DESC, c.nombre ASC`,
    ...params,
  )
  return ok(c, rows)
})

cards.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = String(body.nombre ?? '').trim()
  const color = String(body.color ?? '#64748b').trim()
  const activa = booleanToInt(body.activa, 1)

  if (!nombre) return fail(c, 'El nombre de la tarjeta es obligatorio')
  if (/\d{6,}/.test(nombre)) return fail(c, 'No guardes números de tarjeta — usa solo un nombre identificador')

  const meta = await run(
    c.env.DB,
    'INSERT INTO cards (nombre, color, activa) VALUES (?, ?, ?)',
    nombre,
    color,
    activa,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM cards WHERE id = ?', meta.last_row_id), 201)
})

cards.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM cards WHERE id = ?', id)
  if (!current) return fail(c, 'Tarjeta no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = body.nombre === undefined ? current.nombre : String(body.nombre).trim()
  const color = body.color === undefined ? current.color : String(body.color).trim()
  const activa = body.activa === undefined ? current.activa : booleanToInt(body.activa, current.activa)

  if (!nombre) return fail(c, 'El nombre de la tarjeta es obligatorio')
  if (/\d{6,}/.test(nombre)) return fail(c, 'No guardes números de tarjeta — usa solo un nombre identificador')

  await run(c.env.DB, 'UPDATE cards SET nombre = ?, color = ?, activa = ? WHERE id = ?', nombre, color, activa, id)
  return ok(c, await first(c.env.DB, 'SELECT * FROM cards WHERE id = ?', id))
})

cards.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const usage = await first(c.env.DB, 'SELECT COUNT(*) AS n FROM subscriptions WHERE card_id = ?', id)
  if ((usage?.n ?? 0) > 0) {
    return fail(c, 'Hay fijos enlazados a esta tarjeta; desactívala o cámbialos primero', 409)
  }

  const meta = await run(c.env.DB, 'DELETE FROM cards WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Tarjeta no encontrada', 404)
  return ok(c, { id })
})

export default cards
