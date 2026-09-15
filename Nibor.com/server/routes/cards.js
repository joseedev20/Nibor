import { Hono } from 'hono'
import { all, booleanToInt, fail, first, ok, readJson, run, toInteger, toNullableNumber } from '../db.js'

// Tarjetas y cuentas: nombre identificador, entidad, tipo y (opcional)
// últimos 4 dígitos + cupo. Nunca guardar el número completo, vencimiento ni
// CVV — eso sigue prohibido. Los últimos 4 dígitos SÍ se permiten: el propio
// banco los muestra en cada SMS/notificación, no son un dato sensible por sí
// solos, y son justo lo que widgetExpenses.js usa para detectar con qué
// tarjeta/cuenta fue un gasto capturado por mensaje.
const cards = new Hono()
const VALID_TIPOS = new Set(['credito', 'debito', 'cuenta'])
const DIGITS_PATTERN = /^\d{4}$/

function normalizeDigits(value) {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

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
    `SELECT c.id, c.nombre, c.color, c.activa, c.ultimos_digitos, c.entidad, c.tipo, c.cupo,
            COUNT(s.id) AS suscripciones,
            COALESCE(SUM(CASE WHEN s.activa = 1 AND s.tipo = 'gasto' THEN s.monto ELSE 0 END), 0) AS total_mensual
     FROM cards c
     LEFT JOIN subscriptions s ON s.card_id = c.id
     ${where}
     GROUP BY c.id, c.nombre, c.color, c.activa, c.ultimos_digitos, c.entidad, c.tipo, c.cupo
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
  const tipo = String(body.tipo ?? 'credito').trim()
  const entidad = String(body.entidad ?? '').trim() || null
  const ultimos_digitos = normalizeDigits(body.ultimos_digitos)
  const cupo = toNullableNumber(body.cupo)

  if (!nombre) return fail(c, 'El nombre de la tarjeta es obligatorio')
  if (/\d{6,}/.test(nombre)) return fail(c, 'No guardes números de tarjeta — usa solo un nombre identificador')
  if (!VALID_TIPOS.has(tipo)) return fail(c, 'El tipo debe ser credito, debito o cuenta')
  if (ultimos_digitos !== null && !DIGITS_PATTERN.test(ultimos_digitos)) {
    return fail(c, 'Los últimos dígitos deben ser exactamente 4 números (nunca el número completo)')
  }
  if (cupo !== null && (!Number.isFinite(cupo) || cupo < 0)) return fail(c, 'El cupo debe ser un número mayor o igual a 0')

  const meta = await run(
    c.env.DB,
    `INSERT INTO cards (nombre, color, activa, tipo, entidad, ultimos_digitos, cupo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    nombre,
    color,
    activa,
    tipo,
    entidad,
    ultimos_digitos,
    cupo,
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
  const tipo = body.tipo === undefined ? current.tipo : String(body.tipo).trim()
  const entidad = body.entidad === undefined ? current.entidad : (String(body.entidad ?? '').trim() || null)
  const ultimos_digitos = body.ultimos_digitos === undefined ? current.ultimos_digitos : normalizeDigits(body.ultimos_digitos)
  const cupo = body.cupo === undefined ? current.cupo : toNullableNumber(body.cupo)

  if (!nombre) return fail(c, 'El nombre de la tarjeta es obligatorio')
  if (/\d{6,}/.test(nombre)) return fail(c, 'No guardes números de tarjeta — usa solo un nombre identificador')
  if (!VALID_TIPOS.has(tipo)) return fail(c, 'El tipo debe ser credito, debito o cuenta')
  if (ultimos_digitos !== null && !DIGITS_PATTERN.test(ultimos_digitos)) {
    return fail(c, 'Los últimos dígitos deben ser exactamente 4 números (nunca el número completo)')
  }
  if (cupo !== null && (!Number.isFinite(cupo) || cupo < 0)) return fail(c, 'El cupo debe ser un número mayor o igual a 0')

  await run(
    c.env.DB,
    `UPDATE cards SET nombre = ?, color = ?, activa = ?, tipo = ?, entidad = ?, ultimos_digitos = ?, cupo = ? WHERE id = ?`,
    nombre,
    color,
    activa,
    tipo,
    entidad,
    ultimos_digitos,
    cupo,
    id,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM cards WHERE id = ?', id))
})

cards.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const [subscriptionUsage, movementUsage] = await Promise.all([
    first(c.env.DB, 'SELECT COUNT(*) AS n FROM subscriptions WHERE card_id = ?', id),
    first(c.env.DB, 'SELECT COUNT(*) AS n FROM movements WHERE card_id = ?', id),
  ])
  if ((subscriptionUsage?.n ?? 0) > 0) {
    return fail(c, 'Hay fijos enlazados a esta tarjeta; desactívala o cámbialos primero', 409)
  }
  if ((movementUsage?.n ?? 0) > 0) {
    return fail(c, 'Hay gastos vinculados a esta tarjeta; desactívala en vez de eliminarla', 409)
  }

  const meta = await run(c.env.DB, 'DELETE FROM cards WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Tarjeta no encontrada', 404)
  return ok(c, { id })
})

export default cards
