import { Hono } from 'hono'
import { all, fail, first, isNonNegative, isValidDate, ok, readJson, run, toInteger, toNumber } from '../db.js'

// Nibor Vehículos: vencimientos con estado calculado en backend, PDFs en R2
// (binding FILES) y gastos que se registran como movements normales.
const vehicles = new Hono()

const VALID_TIPOS = new Set(['carro', 'moto', 'otro'])
const DEFAULT_ITEMS = [
  { nombre: 'Seguro SOAT', requiere_vencimiento: 1 },
  { nombre: 'Técnico mecánica', requiere_vencimiento: 1 },
  { nombre: 'Tarjeta de propiedad', requiere_vencimiento: 0 },
]
const LICENSE_CATEGORIES = new Set(['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'])
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

function todayBogota() {
  // UTC-5 fijo
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)
}

function daysBetween(desde, hasta) {
  return Math.round((new Date(`${hasta}T00:00:00Z`) - new Date(`${desde}T00:00:00Z`)) / 86400000)
}

// Estado del item: por_configurar (sin fecha), vencida, por_vencer (≤30 días), vigente
function computeItem(item, hoy) {
  if (Number(item.requiere_vencimiento) === 0) {
    return { ...item, estado: 'sin_vencimiento', dias_restantes: null }
  }
  if (!item.vence) return { ...item, estado: 'por_configurar', dias_restantes: null }
  const dias = daysBetween(hoy, item.vence)
  const estado = dias < 0 ? 'vencida' : dias <= 30 ? 'por_vencer' : 'vigente'
  return { ...item, estado, dias_restantes: dias }
}

async function getVehicleFull(db, id, hoy) {
  const vehicle = await first(db, 'SELECT * FROM vehicles WHERE id = ?', id)
  if (!vehicle) return null
  const items = await all(
    db,
    `SELECT id, vehicle_id, nombre, vence, notas, requiere_vencimiento, file_key, file_name, file_size, updated_at
     FROM vehicle_items WHERE vehicle_id = ?
     ORDER BY vence IS NULL, vence ASC, nombre ASC`,
    id,
  )
  const gastos = await first(
    db,
    `SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS n FROM movements WHERE vehicle_id = ? AND tipo = 'gasto'`,
    id,
  )
  return {
    ...vehicle,
    items: items.map((item) => computeItem(item, hoy)),
    gastos_total: Number(gastos?.total ?? 0),
    gastos_count: Number(gastos?.n ?? 0),
  }
}

function computeLicenseCategory(category, hoy) {
  const computed = computeItem({ ...category, requiere_vencimiento: 1 }, hoy)
  return {
    ...computed,
    tipo_vehiculo: category.categoria.startsWith('A') ? 'moto' : 'carro',
  }
}

async function getDriverLicense(db, hoy) {
  const license = await first(db, 'SELECT * FROM driver_licenses WHERE id = 1')
  const categories = await all(
    db,
    `SELECT id, license_id, categoria, vence, notas, created_at, updated_at
     FROM driver_license_categories
     WHERE license_id = 1
     ORDER BY categoria ASC`,
  )
  return {
    ...(license ?? { id: 1, file_key: null, file_name: null, file_size: null, notas: null }),
    categories: categories.map((category) => computeLicenseCategory(category, hoy)),
  }
}

vehicles.get('/', async (c) => {
  const hoy = todayBogota()
  const rows = await all(c.env.DB, 'SELECT id FROM vehicles ORDER BY activa DESC, nombre ASC')
  const data = []
  for (const row of rows) {
    data.push(await getVehicleFull(c.env.DB, row.id, hoy))
  }
  return ok(c, data)
})

// ── Licencia de conducción personal ───────────────────────────────────────

vehicles.get('/license', async (c) => {
  return ok(c, await getDriverLicense(c.env.DB, todayBogota()))
})

vehicles.post('/license/categories', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const categoria = String(body.categoria ?? '').trim().toUpperCase()
  const vence = String(body.vence ?? '').trim()
  const notas = String(body.notas ?? '').trim() || null
  if (!LICENSE_CATEGORIES.has(categoria)) return fail(c, 'La categoría debe ser A1, A2, B1, B2, B3, C1, C2 o C3')
  if (!isValidDate(vence)) return fail(c, 'La fecha de vencimiento debe ser una fecha real YYYY-MM-DD')

  const exists = await first(
    c.env.DB,
    'SELECT id FROM driver_license_categories WHERE license_id = 1 AND categoria = ?',
    categoria,
  )
  if (exists) return fail(c, `La categoría ${categoria} ya está registrada`, 409)

  const meta = await run(
    c.env.DB,
    `INSERT INTO driver_license_categories (license_id, categoria, vence, notas)
     VALUES (1, ?, ?, ?)`,
    categoria,
    vence,
    notas,
  )
  const category = await first(c.env.DB, 'SELECT * FROM driver_license_categories WHERE id = ?', meta.last_row_id)
  return ok(c, computeLicenseCategory(category, todayBogota()), 201)
})

vehicles.put('/license/categories/:categoryId', async (c) => {
  const categoryId = toInteger(c.req.param('categoryId'))
  if (!Number.isInteger(categoryId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM driver_license_categories WHERE id = ?', categoryId)
  if (!current) return fail(c, 'Categoría de licencia no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const categoria = body.categoria === undefined ? current.categoria : String(body.categoria).trim().toUpperCase()
  const vence = body.vence === undefined ? current.vence : String(body.vence).trim()
  const notas = body.notas === undefined ? current.notas : (String(body.notas).trim() || null)
  if (!LICENSE_CATEGORIES.has(categoria)) return fail(c, 'La categoría debe ser A1, A2, B1, B2, B3, C1, C2 o C3')
  if (!isValidDate(vence)) return fail(c, 'La fecha de vencimiento debe ser una fecha real YYYY-MM-DD')

  const duplicate = await first(
    c.env.DB,
    'SELECT id FROM driver_license_categories WHERE license_id = 1 AND categoria = ? AND id <> ?',
    categoria,
    categoryId,
  )
  if (duplicate) return fail(c, `La categoría ${categoria} ya está registrada`, 409)

  await run(
    c.env.DB,
    `UPDATE driver_license_categories
     SET categoria = ?, vence = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    categoria,
    vence,
    notas,
    categoryId,
  )
  const category = await first(c.env.DB, 'SELECT * FROM driver_license_categories WHERE id = ?', categoryId)
  return ok(c, computeLicenseCategory(category, todayBogota()))
})

vehicles.delete('/license/categories/:categoryId', async (c) => {
  const categoryId = toInteger(c.req.param('categoryId'))
  if (!Number.isInteger(categoryId)) return fail(c, 'ID inválido')
  const meta = await run(c.env.DB, 'DELETE FROM driver_license_categories WHERE id = ?', categoryId)
  if (!meta.changes) return fail(c, 'Categoría de licencia no encontrada', 404)
  return ok(c, { id: categoryId })
})

vehicles.post('/license/file', async (c) => {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('application/pdf')) return fail(c, 'Solo se aceptan archivos PDF')

  const fileName = decodeURIComponent(c.req.header('x-file-name') ?? 'licencia-conduccion.pdf')
  const buffer = await c.req.arrayBuffer()
  if (!buffer.byteLength) return fail(c, 'El archivo está vacío')
  if (buffer.byteLength > MAX_FILE_BYTES) return fail(c, 'El archivo no puede superar 10 MB')

  const current = await first(c.env.DB, 'SELECT * FROM driver_licenses WHERE id = 1')
  if (current?.file_key) await c.env.FILES.delete(current.file_key)

  const key = `vehiculos/licencia/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`
  await c.env.FILES.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })
  await run(
    c.env.DB,
    `UPDATE driver_licenses
     SET file_key = ?, file_name = ?, file_size = ?, updated_at = datetime('now')
     WHERE id = 1`,
    key,
    fileName,
    buffer.byteLength,
  )
  return ok(c, await getDriverLicense(c.env.DB, todayBogota()), 201)
})

vehicles.get('/license/file', async (c) => {
  const license = await first(c.env.DB, 'SELECT * FROM driver_licenses WHERE id = 1')
  if (!license?.file_key) return fail(c, 'La licencia no tiene PDF adjunto', 404)
  const object = await c.env.FILES.get(license.file_key)
  if (!object) return fail(c, 'Archivo no encontrado en el almacenamiento', 404)
  return c.body(object.body, 200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${(license.file_name ?? 'licencia-conduccion.pdf').replace(/"/g, '')}"`,
    'cache-control': 'private, no-store',
  })
})

vehicles.delete('/license/file', async (c) => {
  const license = await first(c.env.DB, 'SELECT * FROM driver_licenses WHERE id = 1')
  if (!license?.file_key) return fail(c, 'La licencia no tiene PDF adjunto', 404)
  await c.env.FILES.delete(license.file_key)
  await run(
    c.env.DB,
    `UPDATE driver_licenses
     SET file_key = NULL, file_name = NULL, file_size = NULL, updated_at = datetime('now')
     WHERE id = 1`,
  )
  return ok(c, { id: 1 })
})

vehicles.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = String(body.nombre ?? '').trim()
  const tipo = String(body.tipo ?? 'carro').trim()
  const placa = String(body.placa ?? '').trim().toUpperCase() || null
  const color = String(body.color ?? '#2563eb').trim()

  if (!nombre) return fail(c, 'El nombre es obligatorio')
  if (!VALID_TIPOS.has(tipo)) return fail(c, 'El tipo debe ser carro, moto u otro')

  const meta = await run(
    c.env.DB,
    'INSERT INTO vehicles (nombre, tipo, placa, color) VALUES (?, ?, ?, ?)',
    nombre,
    tipo,
    placa,
    color,
  )

  // Items por defecto estilo R5 (quedan "por configurar" hasta poner fecha)
  for (const item of DEFAULT_ITEMS) {
    await run(
      c.env.DB,
      'INSERT INTO vehicle_items (vehicle_id, nombre, requiere_vencimiento) VALUES (?, ?, ?)',
      meta.last_row_id,
      item.nombre,
      item.requiere_vencimiento,
    )
  }

  return ok(c, await getVehicleFull(c.env.DB, meta.last_row_id, todayBogota()), 201)
})

vehicles.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM vehicles WHERE id = ?', id)
  if (!current) return fail(c, 'Vehículo no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = body.nombre === undefined ? current.nombre : String(body.nombre).trim()
  const tipo = body.tipo === undefined ? current.tipo : String(body.tipo).trim()
  const placa = body.placa === undefined ? current.placa : (String(body.placa).trim().toUpperCase() || null)
  const color = body.color === undefined ? current.color : String(body.color).trim()
  const activa = body.activa === undefined ? current.activa : (body.activa ? 1 : 0)

  if (!nombre) return fail(c, 'El nombre es obligatorio')
  if (!VALID_TIPOS.has(tipo)) return fail(c, 'El tipo debe ser carro, moto u otro')

  await run(
    c.env.DB,
    `UPDATE vehicles SET nombre = ?, tipo = ?, placa = ?, color = ?, activa = ?, updated_at = datetime('now') WHERE id = ?`,
    nombre,
    tipo,
    placa,
    color,
    activa,
    id,
  )
  return ok(c, await getVehicleFull(c.env.DB, id, todayBogota()))
})

vehicles.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const usage = await first(c.env.DB, 'SELECT COUNT(*) AS n FROM movements WHERE vehicle_id = ?', id)
  if ((usage?.n ?? 0) > 0) {
    return fail(c, 'Este vehículo tiene gastos registrados; desactívalo en vez de borrarlo', 409)
  }

  // Borrar archivos R2 de sus items antes de eliminar
  const items = await all(c.env.DB, 'SELECT file_key FROM vehicle_items WHERE vehicle_id = ? AND file_key IS NOT NULL', id)
  for (const item of items) {
    await c.env.FILES.delete(item.file_key)
  }

  const meta = await run(c.env.DB, 'DELETE FROM vehicles WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Vehículo no encontrado', 404)
  return ok(c, { id })
})

// ── Items (vencimientos/documentos) ─────────────────────────────────────────

vehicles.post('/:id/items', async (c) => {
  const vehicleId = toInteger(c.req.param('id'))
  if (!Number.isInteger(vehicleId)) return fail(c, 'ID inválido')
  const vehicle = await first(c.env.DB, 'SELECT id FROM vehicles WHERE id = ?', vehicleId)
  if (!vehicle) return fail(c, 'Vehículo no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = String(body.nombre ?? '').trim()
  const vence = body.vence ? String(body.vence).trim() : null
  const notas = String(body.notas ?? '').trim() || null
  const requiereVencimiento = body.requiere_vencimiento === false || Number(body.requiere_vencimiento) === 0 ? 0 : 1

  if (!nombre) return fail(c, 'El nombre del documento es obligatorio')
  if (requiereVencimiento === 1 && vence !== null && !isValidDate(vence)) return fail(c, 'La fecha de vencimiento debe ser una fecha real YYYY-MM-DD')

  const meta = await run(
    c.env.DB,
    'INSERT INTO vehicle_items (vehicle_id, nombre, vence, notas, requiere_vencimiento) VALUES (?, ?, ?, ?, ?)',
    vehicleId,
    nombre,
    requiereVencimiento === 1 ? vence : null,
    notas,
    requiereVencimiento,
  )
  const item = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', meta.last_row_id)
  return ok(c, computeItem(item, todayBogota()), 201)
})

vehicles.put('/items/:itemId', async (c) => {
  const itemId = toInteger(c.req.param('itemId'))
  if (!Number.isInteger(itemId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  if (!current) return fail(c, 'Documento no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const nombre = body.nombre === undefined ? current.nombre : String(body.nombre).trim()
  const vence = body.vence === undefined ? current.vence : (body.vence ? String(body.vence).trim() : null)
  const notas = body.notas === undefined ? current.notas : (String(body.notas).trim() || null)
  const requiereVencimiento = body.requiere_vencimiento === undefined
    ? Number(current.requiere_vencimiento)
    : (body.requiere_vencimiento === false || Number(body.requiere_vencimiento) === 0 ? 0 : 1)

  if (!nombre) return fail(c, 'El nombre del documento es obligatorio')
  if (requiereVencimiento === 1 && vence !== null && !isValidDate(vence)) return fail(c, 'La fecha de vencimiento debe ser una fecha real YYYY-MM-DD')

  await run(
    c.env.DB,
    `UPDATE vehicle_items SET nombre = ?, vence = ?, notas = ?, requiere_vencimiento = ?, updated_at = datetime('now') WHERE id = ?`,
    nombre,
    requiereVencimiento === 1 ? vence : null,
    notas,
    requiereVencimiento,
    itemId,
  )
  const item = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  return ok(c, computeItem(item, todayBogota()))
})

vehicles.delete('/items/:itemId', async (c) => {
  const itemId = toInteger(c.req.param('itemId'))
  if (!Number.isInteger(itemId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  if (!current) return fail(c, 'Documento no encontrado', 404)

  if (current.file_key) await c.env.FILES.delete(current.file_key)
  await run(c.env.DB, 'DELETE FROM vehicle_items WHERE id = ?', itemId)
  return ok(c, { id: itemId })
})

// ── Archivos PDF (R2) ───────────────────────────────────────────────────────

vehicles.post('/items/:itemId/file', async (c) => {
  const itemId = toInteger(c.req.param('itemId'))
  if (!Number.isInteger(itemId)) return fail(c, 'ID inválido')
  const item = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  if (!item) return fail(c, 'Documento no encontrado', 404)

  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('application/pdf')) return fail(c, 'Solo se aceptan archivos PDF')

  const fileName = decodeURIComponent(c.req.header('x-file-name') ?? 'documento.pdf')
  const buffer = await c.req.arrayBuffer()
  if (!buffer.byteLength) return fail(c, 'El archivo está vacío')
  if (buffer.byteLength > MAX_FILE_BYTES) return fail(c, 'El archivo no puede superar 10 MB')

  // Reemplaza el anterior si existía
  if (item.file_key) await c.env.FILES.delete(item.file_key)

  const key = `vehiculos/${itemId}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`
  await c.env.FILES.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })

  await run(
    c.env.DB,
    `UPDATE vehicle_items SET file_key = ?, file_name = ?, file_size = ?, updated_at = datetime('now') WHERE id = ?`,
    key,
    fileName,
    buffer.byteLength,
    itemId,
  )
  const updated = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  return ok(c, computeItem(updated, todayBogota()), 201)
})

vehicles.get('/items/:itemId/file', async (c) => {
  const itemId = toInteger(c.req.param('itemId'))
  if (!Number.isInteger(itemId)) return fail(c, 'ID inválido')
  const item = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  if (!item?.file_key) return fail(c, 'Este documento no tiene archivo adjunto', 404)

  const object = await c.env.FILES.get(item.file_key)
  if (!object) return fail(c, 'Archivo no encontrado en el almacenamiento', 404)

  return c.body(object.body, 200, {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${(item.file_name ?? 'documento.pdf').replace(/"/g, '')}"`,
  })
})

vehicles.delete('/items/:itemId/file', async (c) => {
  const itemId = toInteger(c.req.param('itemId'))
  if (!Number.isInteger(itemId)) return fail(c, 'ID inválido')
  const item = await first(c.env.DB, 'SELECT * FROM vehicle_items WHERE id = ?', itemId)
  if (!item?.file_key) return fail(c, 'Este documento no tiene archivo adjunto', 404)

  await c.env.FILES.delete(item.file_key)
  await run(
    c.env.DB,
    `UPDATE vehicle_items SET file_key = NULL, file_name = NULL, file_size = NULL, updated_at = datetime('now') WHERE id = ?`,
    itemId,
  )
  return ok(c, { id: itemId })
})

// ── Gastos del vehículo (integrados a movements) ────────────────────────────

vehicles.get('/:id/gastos', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const rows = await all(
    c.env.DB,
    `SELECT m.id, m.fecha, m.descripcion, m.monto, m.categoria_id, c.nombre AS categoria_nombre, c.icono AS categoria_icono
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     WHERE m.vehicle_id = ? AND m.tipo = 'gasto'
     ORDER BY m.fecha DESC, m.id DESC`,
    id,
  )
  return ok(c, rows)
})

vehicles.post('/:id/gastos', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const vehicle = await first(c.env.DB, 'SELECT * FROM vehicles WHERE id = ?', id)
  if (!vehicle) return fail(c, 'Vehículo no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const concepto = String(body.concepto ?? '').trim()
  const monto = toNumber(body.monto)
  const fecha = String(body.fecha ?? todayBogota()).trim()

  if (!concepto) return fail(c, 'El concepto es obligatorio')
  if (!isNonNegative(monto) || monto <= 0) return fail(c, 'El monto debe ser mayor a 0')
  if (!isValidDate(fecha)) return fail(c, 'La fecha debe ser una fecha real YYYY-MM-DD')

  const categoria = await first(c.env.DB, `SELECT id FROM categories WHERE nombre = 'Vehículos' AND tipo = 'gasto'`)

  const meta = await run(
    c.env.DB,
    `INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id, vehicle_id)
     VALUES (?, 'gasto', ?, ?, ?, NULL, ?)`,
    fecha,
    categoria?.id ?? null,
    `${vehicle.nombre}: ${concepto}`,
    monto,
    id,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM movements WHERE id = ?', meta.last_row_id), 201)
})

export default vehicles
