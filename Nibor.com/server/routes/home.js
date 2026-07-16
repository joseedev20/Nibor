import { Hono } from 'hono'
import { all, fail, first, isUniqueError, isValidDate, ok, readJson, run, toInteger, toNullableNumber } from '../db.js'

// Nibor Casa: administración mensual de una propiedad.
// Totales de conceptos y estado del periodo se calculan SOLO aquí.
// El pago (fecha, valor, mora) vive separado de la cuenta de cobro;
// el PDF único por periodo (cuenta + comprobante unidos) vive en R2.
const home = new Hono()
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ESTADOS = new Set(['pendiente', 'pagado_con_descuento', 'pagado_sin_descuento', 'en_mora'])

home.use('*', async (c, next) => {
  await next()
  c.header('cache-control', 'private, no-store')
})

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// ── Propiedades ─────────────────────────────────────────────────────────────

function normalizeProperty(body, current = {}) {
  return {
    nombre: body.nombre === undefined ? current.nombre : cleanText(body.nombre),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
    activa: body.activa === undefined ? current.activa ?? 1 : (body.activa ? 1 : 0),
  }
}

function validateProperty(property) {
  if (!property.nombre) return 'El nombre de la propiedad es obligatorio'
  if (property.nombre.length > 120) return 'El nombre no puede superar 120 caracteres'
  if (property.notas && property.notas.length > 800) return 'Las notas no pueden superar 800 caracteres'
  return null
}

home.get('/properties', async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT p.id, p.nombre, p.notas, p.activa, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM home_administration_periods hp WHERE hp.property_id = p.id) AS periodos
     FROM home_properties p
     ORDER BY p.activa DESC, p.id`,
  )
  return ok(c, rows)
})

home.post('/properties', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const property = normalizeProperty(body)
  const error = validateProperty(property)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    'INSERT INTO home_properties (nombre, notas, activa) VALUES (?, ?, ?)',
    property.nombre,
    property.notas,
    property.activa,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM home_properties WHERE id = ?', meta.last_row_id), 201)
})

home.put('/properties/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM home_properties WHERE id = ?', id)
  if (!current) return fail(c, 'Propiedad no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const property = normalizeProperty(body, current)
  const error = validateProperty(property)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE home_properties SET nombre = ?, notas = ?, activa = ?, updated_at = datetime('now') WHERE id = ?`,
    property.nombre,
    property.notas,
    property.activa,
    id,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM home_properties WHERE id = ?', id))
})

home.delete('/properties/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id FROM home_properties WHERE id = ?', id)
  if (!current) return fail(c, 'Propiedad no encontrada', 404)
  const usage = await first(
    c.env.DB,
    'SELECT COUNT(*) AS total FROM home_administration_periods WHERE property_id = ?',
    id,
  )
  if (Number(usage?.total ?? 0) > 0) {
    return fail(c, 'La propiedad tiene mensualidades registradas; elimina primero su historial', 409)
  }
  await run(c.env.DB, 'DELETE FROM home_properties WHERE id = ?', id)
  return ok(c, { id })
})

// ── Periodos (cuenta de cobro + pago) ───────────────────────────────────────

function normalizePeriodFields(body, current = {}) {
  const field = (name, cleaner) => (body[name] === undefined ? current[name] ?? null : cleaner(body[name]))
  return {
    fecha_emision: field('fecha_emision', cleanNullableText),
    numero_cuenta: field('numero_cuenta', cleanNullableText),
    fecha_limite_descuento: field('fecha_limite_descuento', cleanNullableText),
    fecha_vencimiento: field('fecha_vencimiento', cleanNullableText),
    descuento_pct: field('descuento_pct', toNullableNumber),
    descuento_valor: field('descuento_valor', toNullableNumber),
    total_con_descuento: field('total_con_descuento', toNullableNumber),
    notas: field('notas', cleanNullableText),
  }
}

function validatePeriodFields(fields) {
  for (const [name, label] of [
    ['fecha_emision', 'fecha de emisión'],
    ['fecha_limite_descuento', 'fecha límite de descuento'],
    ['fecha_vencimiento', 'fecha de vencimiento'],
  ]) {
    if (fields[name] !== null && !isValidDate(fields[name])) return `La ${label} no es una fecha válida`
  }
  if (fields.numero_cuenta && fields.numero_cuenta.length > 40) return 'El número de cuenta no puede superar 40 caracteres'
  if (fields.notas && fields.notas.length > 800) return 'Las notas no pueden superar 800 caracteres'
  for (const [name, label] of [
    ['descuento_pct', 'porcentaje de descuento'],
    ['descuento_valor', 'valor del descuento'],
    ['total_con_descuento', 'total con descuento'],
  ]) {
    const value = fields[name]
    if (value !== null && (!Number.isFinite(value) || value < 0)) return `El ${label} debe ser un número válido`
  }
  if (fields.descuento_pct !== null && fields.descuento_pct > 100) return 'El porcentaje de descuento no puede superar 100'
  return null
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) return { error: 'Agrega al menos un concepto a la cuenta' }
  if (rawItems.length > 30) return { error: 'Máximo 30 conceptos por mensualidad' }
  const items = []
  for (const raw of rawItems) {
    const concepto = cleanText(raw?.concepto)
    if (!concepto) return { error: 'Cada concepto necesita un nombre' }
    if (concepto.length > 80) return { error: 'El nombre del concepto no puede superar 80 caracteres' }
    const saldo_anterior = toNullableNumber(raw.saldo_anterior) ?? 0
    const cuota_mes = toNullableNumber(raw.cuota_mes) ?? 0
    const nuevo_saldo = toNullableNumber(raw.nuevo_saldo) ?? 0
    if (![saldo_anterior, cuota_mes, nuevo_saldo].every(Number.isFinite)) {
      return { error: `Los valores del concepto "${concepto}" deben ser números válidos` }
    }
    items.push({ concepto, saldo_anterior, cuota_mes, nuevo_saldo })
  }
  return { items }
}

function computeEstado(period, today = todayIso()) {
  const pagado = period.fecha_pago !== null && period.valor_pagado !== null
  if (pagado) {
    if (Number(period.mora_cobrada ?? 0) > 0) return 'en_mora'
    const hasDiscount = Number(period.descuento_valor ?? 0) > 0
      || Number(period.descuento_pct ?? 0) > 0
      || period.total_con_descuento !== null
    if (hasDiscount && period.fecha_limite_descuento && period.fecha_pago <= period.fecha_limite_descuento) {
      return 'pagado_con_descuento'
    }
    return 'pagado_sin_descuento'
  }
  // La mora de un mes sin pagar solo se infiere por el vencimiento real,
  // nunca por la fecha límite de descuento.
  if (period.fecha_vencimiento && today > period.fecha_vencimiento) return 'en_mora'
  return 'pendiente'
}

function discountEarned(period) {
  if (period.descuento_valor !== null && Number.isFinite(Number(period.descuento_valor))) {
    return Number(period.descuento_valor)
  }
  const total = Number(period.total_nuevo_saldo ?? 0)
  const discounted = Number(period.total_con_descuento)
  if (period.total_con_descuento !== null && Number.isFinite(discounted) && total > discounted) {
    return total - discounted
  }
  return 0
}

function enrichPeriod(period, items, today = todayIso()) {
  const total_saldo_anterior = items.reduce((sum, item) => sum + Number(item.saldo_anterior ?? 0), 0)
  const total_cuota_mes = items.reduce((sum, item) => sum + Number(item.cuota_mes ?? 0), 0)
  const total_nuevo_saldo = items.reduce((sum, item) => sum + Number(item.nuevo_saldo ?? 0), 0)
  const enriched = {
    ...period,
    items,
    total_saldo_anterior,
    total_cuota_mes,
    total_nuevo_saldo,
    pagado: period.fecha_pago !== null && period.valor_pagado !== null,
  }
  enriched.estado = computeEstado(enriched, today)
  enriched.descuento_ganado = enriched.estado === 'pagado_con_descuento' ? discountEarned(enriched) : 0
  return enriched
}

async function getEnrichedPeriod(db, id) {
  const period = await first(db, 'SELECT * FROM home_administration_periods WHERE id = ?', id)
  if (!period) return null
  const items = await all(
    db,
    'SELECT id, concepto, saldo_anterior, cuota_mes, nuevo_saldo, orden FROM home_administration_items WHERE period_id = ? ORDER BY orden, id',
    id,
  )
  return enrichPeriod(period, items)
}

async function insertItems(db, periodId, items) {
  const statements = items.map((item, index) => db
    .prepare('INSERT INTO home_administration_items (period_id, concepto, saldo_anterior, cuota_mes, nuevo_saldo, orden) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(periodId, item.concepto, item.saldo_anterior, item.cuota_mes, item.nuevo_saldo, index))
  await db.batch(statements)
}

home.get('/periods', async (c) => {
  const db = c.env.DB
  let propertyId = toInteger(c.req.query('property_id'))
  if (!Number.isInteger(propertyId)) {
    const defaultProperty = await first(db, 'SELECT id FROM home_properties ORDER BY activa DESC, id LIMIT 1')
    propertyId = defaultProperty?.id ?? null
  }
  if (propertyId === null) {
    return ok(c, { property: null, periods: [], anios: [], resumen: null })
  }
  const property = await first(db, 'SELECT * FROM home_properties WHERE id = ?', propertyId)
  if (!property) return fail(c, 'Propiedad no encontrada', 404)

  const estadoFilter = c.req.query('estado') ?? null
  if (estadoFilter && !ESTADOS.has(estadoFilter)) return fail(c, 'El estado del filtro no es válido')

  const anios = (await all(
    db,
    'SELECT DISTINCT anio FROM home_administration_periods WHERE property_id = ? ORDER BY anio DESC',
    propertyId,
  )).map((row) => row.anio)

  const anio = toInteger(c.req.query('anio'), anios[0] ?? new Date().getFullYear())
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return fail(c, 'El año debe ser válido')

  const rows = await all(
    db,
    'SELECT * FROM home_administration_periods WHERE property_id = ? AND anio = ? ORDER BY mes DESC',
    propertyId,
    anio,
  )
  const itemRows = rows.length
    ? await all(
      db,
      `SELECT id, period_id, concepto, saldo_anterior, cuota_mes, nuevo_saldo, orden
       FROM home_administration_items
       WHERE period_id IN (SELECT id FROM home_administration_periods WHERE property_id = ? AND anio = ?)
       ORDER BY orden, id`,
      propertyId,
      anio,
    )
    : []
  const itemsByPeriod = new Map()
  for (const item of itemRows) {
    if (!itemsByPeriod.has(item.period_id)) itemsByPeriod.set(item.period_id, [])
    itemsByPeriod.get(item.period_id).push(item)
  }

  const today = todayIso()
  const periods = rows.map((row) => enrichPeriod(row, itemsByPeriod.get(row.id) ?? [], today))

  const resumen = {
    anio,
    meses_registrados: periods.length,
    pagados: 0,
    pendientes: 0,
    con_descuento: 0,
    sin_descuento: 0,
    en_mora: 0,
    total_pagado: 0,
    total_descuentos: 0,
    total_moras: 0,
  }
  for (const period of periods) {
    if (period.pagado) {
      resumen.pagados += 1
      resumen.total_pagado += Number(period.valor_pagado ?? 0)
      resumen.total_moras += Number(period.mora_cobrada ?? 0)
      resumen.total_descuentos += period.descuento_ganado
    } else {
      resumen.pendientes += 1
    }
    if (period.estado === 'pagado_con_descuento') resumen.con_descuento += 1
    if (period.estado === 'pagado_sin_descuento') resumen.sin_descuento += 1
    if (period.estado === 'en_mora') resumen.en_mora += 1
  }

  const filtered = estadoFilter ? periods.filter((period) => period.estado === estadoFilter) : periods
  return ok(c, { property, periods: filtered, anios, resumen })
})

home.post('/periods', async (c) => {
  const db = c.env.DB
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const propertyId = toInteger(body.property_id)
  if (!Number.isInteger(propertyId)) return fail(c, 'La propiedad es obligatoria')
  const property = await first(db, 'SELECT id FROM home_properties WHERE id = ?', propertyId)
  if (!property) return fail(c, 'Propiedad no encontrada', 404)

  const anio = toInteger(body.anio)
  const mes = toInteger(body.mes)
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return fail(c, 'El año debe ser válido')
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return fail(c, 'El mes debe estar entre 1 y 12')

  const fields = normalizePeriodFields(body)
  const fieldError = validatePeriodFields(fields)
  if (fieldError) return fail(c, fieldError)

  const { items, error: itemsError } = normalizeItems(body.items)
  if (itemsError) return fail(c, itemsError)

  let meta
  try {
    meta = await run(
      db,
      `INSERT INTO home_administration_periods
        (property_id, anio, mes, fecha_emision, numero_cuenta, fecha_limite_descuento, fecha_vencimiento,
         descuento_pct, descuento_valor, total_con_descuento, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      propertyId,
      anio,
      mes,
      fields.fecha_emision,
      fields.numero_cuenta,
      fields.fecha_limite_descuento,
      fields.fecha_vencimiento,
      fields.descuento_pct,
      fields.descuento_valor,
      fields.total_con_descuento,
      fields.notas,
    )
  } catch (error) {
    if (isUniqueError(error)) return fail(c, 'Ya existe una mensualidad registrada para ese mes', 409)
    throw error
  }

  await insertItems(db, meta.last_row_id, items)
  return ok(c, await getEnrichedPeriod(db, meta.last_row_id), 201)
})

home.put('/periods/:id', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(db, 'SELECT * FROM home_administration_periods WHERE id = ?', id)
  if (!current) return fail(c, 'Mensualidad no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const fields = normalizePeriodFields(body, current)
  const fieldError = validatePeriodFields(fields)
  if (fieldError) return fail(c, fieldError)

  let items = null
  if (body.items !== undefined) {
    const normalized = normalizeItems(body.items)
    if (normalized.error) return fail(c, normalized.error)
    items = normalized.items
  }

  await run(
    db,
    `UPDATE home_administration_periods
     SET fecha_emision = ?, numero_cuenta = ?, fecha_limite_descuento = ?, fecha_vencimiento = ?,
         descuento_pct = ?, descuento_valor = ?, total_con_descuento = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    fields.fecha_emision,
    fields.numero_cuenta,
    fields.fecha_limite_descuento,
    fields.fecha_vencimiento,
    fields.descuento_pct,
    fields.descuento_valor,
    fields.total_con_descuento,
    fields.notas,
    id,
  )
  if (items) {
    await run(db, 'DELETE FROM home_administration_items WHERE period_id = ?', id)
    await insertItems(db, id, items)
  }
  return ok(c, await getEnrichedPeriod(db, id))
})

home.delete('/periods/:id', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(db, 'SELECT id, file_key FROM home_administration_periods WHERE id = ?', id)
  if (!current) return fail(c, 'Mensualidad no encontrada', 404)
  if (current.file_key) await c.env.FILES.delete(current.file_key)
  await run(db, 'DELETE FROM home_administration_items WHERE period_id = ?', id)
  await run(db, 'DELETE FROM home_administration_periods WHERE id = ?', id)
  return ok(c, { id })
})

// ── Pago (separado de la cuenta de cobro) ───────────────────────────────────

home.put('/periods/:id/payment', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(db, 'SELECT id FROM home_administration_periods WHERE id = ?', id)
  if (!current) return fail(c, 'Mensualidad no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const fechaPago = cleanNullableText(body.fecha_pago)
  const valorPagado = toNullableNumber(body.valor_pagado)
  const moraCobrada = toNullableNumber(body.mora_cobrada)
  if (!fechaPago || !isValidDate(fechaPago)) return fail(c, 'La fecha de pago no es una fecha válida')
  if (valorPagado === null || !Number.isFinite(valorPagado) || valorPagado <= 0) {
    return fail(c, 'El valor pagado debe ser mayor que cero')
  }
  if (moraCobrada !== null && (!Number.isFinite(moraCobrada) || moraCobrada < 0)) {
    return fail(c, 'La mora cobrada debe ser un número válido')
  }

  await run(
    db,
    `UPDATE home_administration_periods
     SET fecha_pago = ?, valor_pagado = ?, mora_cobrada = ?, updated_at = datetime('now')
     WHERE id = ?`,
    fechaPago,
    valorPagado,
    moraCobrada,
    id,
  )
  return ok(c, await getEnrichedPeriod(db, id))
})

home.delete('/periods/:id/payment', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(db, 'SELECT id, fecha_pago FROM home_administration_periods WHERE id = ?', id)
  if (!current) return fail(c, 'Mensualidad no encontrada', 404)
  if (!current.fecha_pago) return fail(c, 'Esta mensualidad no tiene pago registrado', 404)
  await run(
    db,
    `UPDATE home_administration_periods
     SET fecha_pago = NULL, valor_pagado = NULL, mora_cobrada = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    id,
  )
  return ok(c, await getEnrichedPeriod(db, id))
})

// ── PDF único por periodo (cuenta de cobro + comprobante unidos) ────────────

home.post('/periods/:id/file', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(db, 'SELECT id, file_key FROM home_administration_periods WHERE id = ?', id)
  if (!current) return fail(c, 'Mensualidad no encontrada', 404)
  if (!String(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/pdf')) {
    return fail(c, 'Solo se permiten archivos PDF')
  }

  let fileName = 'administracion.pdf'
  try {
    fileName = decodeURIComponent(c.req.header('x-file-name') ?? fileName)
  } catch {
    return fail(c, 'El nombre del archivo no es válido')
  }
  fileName = cleanText(fileName, 'administracion.pdf').slice(0, 180)

  const buffer = await c.req.arrayBuffer()
  if (!buffer.byteLength) return fail(c, 'El archivo está vacío')
  if (buffer.byteLength > MAX_FILE_BYTES) return fail(c, 'El archivo no puede superar 10 MB')
  const signature = new TextDecoder().decode(buffer.slice(0, 5))
  if (signature !== '%PDF-') return fail(c, 'El archivo no contiene un PDF válido')

  const key = `casa/${id}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`
  await c.env.FILES.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })
  if (current.file_key) await c.env.FILES.delete(current.file_key)

  await run(
    db,
    `UPDATE home_administration_periods
     SET file_key = ?, file_name = ?, file_size = ?, updated_at = datetime('now')
     WHERE id = ?`,
    key,
    fileName,
    buffer.byteLength,
    id,
  )
  return ok(c, await getEnrichedPeriod(db, id), 201)
})

home.get('/periods/:id/file', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT file_key, file_name FROM home_administration_periods WHERE id = ?', id)
  if (!current?.file_key) return fail(c, 'Esta mensualidad no tiene PDF adjunto', 404)
  const object = await c.env.FILES.get(current.file_key)
  if (!object) return fail(c, 'Archivo no encontrado en el almacenamiento', 404)

  const safeName = (current.file_name ?? 'administracion.pdf').replace(/["\r\n]/g, '')
  const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline'
  return c.body(object.body, 200, {
    'content-type': 'application/pdf',
    'content-disposition': `${disposition}; filename="${safeName}"`,
    'cache-control': 'private, no-store',
  })
})

home.delete('/periods/:id/file', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(db, 'SELECT file_key FROM home_administration_periods WHERE id = ?', id)
  if (!current) return fail(c, 'Mensualidad no encontrada', 404)
  if (!current.file_key) return fail(c, 'Esta mensualidad no tiene PDF adjunto', 404)
  await c.env.FILES.delete(current.file_key)
  await run(
    db,
    `UPDATE home_administration_periods
     SET file_key = NULL, file_name = NULL, file_size = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    id,
  )
  return ok(c, await getEnrichedPeriod(db, id))
})

export default home
