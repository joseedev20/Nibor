import { Hono } from 'hono'
import { all, fail, first, isNonNegative, isValidDate, ok, readJson, run, toInteger, toNumber } from '../db.js'

// Nibor Bansky: perfil de mascota, vacunas con estado calculado en backend y
// gastos que viven en movements (sincronizados con Gastos en ambos sentidos:
// un movimiento cuenta para la mascota si tiene pet_id O categoría 'Mascotas').
const pets = new Hono()

const MAX_FILE_BYTES = 10 * 1024 * 1024
const VALID_ESPECIES = new Set(['perro', 'gato', 'otro'])
const VALID_SEXOS = new Set(['macho', 'hembra'])
const PROXIMA_WARNING_DAYS = 30

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

function computeAge(fechaNacimiento, hoy, especie = null) {
  if (!fechaNacimiento) return null
  const [by, bm, bd] = fechaNacimiento.split('-').map(Number)
  const [hy, hm, hd] = hoy.split('-').map(Number)
  const months = (hy - by) * 12 + (hm - bm) - (hd < bd ? 1 : 0)
  if (months < 0) return null
  return {
    anios: Math.floor(months / 12),
    meses: months % 12,
    edad_humana: computeHumanAge(months, especie),
  }
}

// Equivalencia veterinaria estándar: el primer año ≈ 15 años humanos, el
// segundo suma 9 (24 a los 2 años) y de ahí en adelante +4/año en gatos
// y +5/año en perros. Para 'otro' no hay equivalencia confiable.
function computeHumanAge(months, especie) {
  if (especie !== 'gato' && especie !== 'perro') return null
  const perYearAfterTwo = especie === 'gato' ? 4 : 5
  let human
  if (months <= 12) human = 15 * (months / 12)
  else if (months <= 24) human = 15 + 9 * ((months - 12) / 12)
  else human = 24 + perYearAfterTwo * ((months - 24) / 12)
  return Math.round(human)
}

function computeVaccine(vaccine, hoy) {
  let estado = 'aplicada'
  let dias_restantes = null
  if (vaccine.proxima_dosis) {
    const diffMs = new Date(`${vaccine.proxima_dosis}T00:00:00Z`) - new Date(`${hoy}T00:00:00Z`)
    dias_restantes = Math.round(diffMs / 86400000)
    if (dias_restantes < 0) estado = 'vencida'
    else if (dias_restantes <= PROXIMA_WARNING_DAYS) estado = 'proxima'
    else estado = 'al_dia'
  }
  return { ...vaccine, estado, dias_restantes }
}

async function getMascotasCategoryId(db) {
  const categoria = await first(db, `SELECT id FROM categories WHERE nombre = 'Mascotas' AND tipo = 'gasto'`)
  return categoria?.id ?? null
}

function normalizePet(body, current = {}) {
  return {
    nombre: body.nombre === undefined ? current.nombre : cleanText(body.nombre),
    especie: body.especie === undefined ? current.especie ?? 'perro' : cleanText(body.especie),
    raza: body.raza === undefined ? current.raza ?? null : cleanNullableText(body.raza),
    sexo: body.sexo === undefined ? current.sexo ?? null : cleanNullableText(body.sexo),
    fecha_nacimiento: body.fecha_nacimiento === undefined ? current.fecha_nacimiento ?? null : cleanNullableText(body.fecha_nacimiento),
    color: body.color === undefined ? current.color ?? null : cleanNullableText(body.color),
    microchip: body.microchip === undefined ? current.microchip ?? null : cleanNullableText(body.microchip),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
    activa: body.activa === undefined ? current.activa ?? 1 : (body.activa ? 1 : 0),
  }
}

function validatePet(pet) {
  if (!pet.nombre) return 'El nombre es obligatorio'
  if (pet.nombre.length > 80) return 'El nombre no puede superar 80 caracteres'
  if (!VALID_ESPECIES.has(pet.especie)) return 'La especie debe ser perro, gato u otro'
  if (pet.sexo !== null && !VALID_SEXOS.has(pet.sexo)) return 'El sexo debe ser macho o hembra'
  if (pet.fecha_nacimiento !== null && !isValidDate(pet.fecha_nacimiento)) return 'La fecha de nacimiento no es una fecha válida'
  if (pet.raza && pet.raza.length > 80) return 'La raza no puede superar 80 caracteres'
  if (pet.color && pet.color.length > 60) return 'El color no puede superar 60 caracteres'
  if (pet.microchip && pet.microchip.length > 60) return 'El microchip no puede superar 60 caracteres'
  if (pet.notas && pet.notas.length > 800) return 'Las notas no pueden superar 800 caracteres'
  return null
}

pets.get('/', async (c) => {
  const hoy = todayIso()
  const rows = await all(c.env.DB, 'SELECT * FROM pets ORDER BY activa DESC, id')
  return ok(c, rows.map((pet) => ({ ...pet, edad: computeAge(pet.fecha_nacimiento, hoy, pet.especie) })))
})

pets.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const pet = normalizePet(body)
  const error = validatePet(pet)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO pets (nombre, especie, raza, sexo, fecha_nacimiento, color, microchip, notas, activa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pet.nombre, pet.especie, pet.raza, pet.sexo, pet.fecha_nacimiento, pet.color, pet.microchip, pet.notas, pet.activa,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM pets WHERE id = ?', meta.last_row_id), 201)
})

pets.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM pets WHERE id = ?', id)
  if (!current) return fail(c, 'Mascota no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const pet = normalizePet(body, current)
  const error = validatePet(pet)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE pets
     SET nombre = ?, especie = ?, raza = ?, sexo = ?, fecha_nacimiento = ?, color = ?, microchip = ?, notas = ?, activa = ?, updated_at = datetime('now')
     WHERE id = ?`,
    pet.nombre, pet.especie, pet.raza, pet.sexo, pet.fecha_nacimiento, pet.color, pet.microchip, pet.notas, pet.activa, id,
  )
  return ok(c, await first(c.env.DB, 'SELECT * FROM pets WHERE id = ?', id))
})

pets.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id FROM pets WHERE id = ?', id)
  if (!current) return fail(c, 'Mascota no encontrada', 404)
  const usage = await first(c.env.DB, 'SELECT COUNT(*) AS n FROM movements WHERE pet_id = ?', id)
  if (Number(usage?.n ?? 0) > 0) {
    return fail(c, 'Esta mascota tiene gastos registrados; desactívala en vez de borrarla', 409)
  }
  const documents = await all(c.env.DB, 'SELECT file_key FROM pet_documents WHERE pet_id = ?', id)
  for (const document of documents) {
    await c.env.FILES.delete(document.file_key)
  }
  await run(c.env.DB, 'DELETE FROM pet_documents WHERE pet_id = ?', id)
  await run(c.env.DB, 'DELETE FROM pet_vaccines WHERE pet_id = ?', id)
  await run(c.env.DB, 'DELETE FROM pets WHERE id = ?', id)
  return ok(c, { id })
})

// Detalle: perfil + vacunas con estado + gastos sincronizados con Gastos.
pets.get('/:id', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const pet = await first(db, 'SELECT * FROM pets WHERE id = ?', id)
  if (!pet) return fail(c, 'Mascota no encontrada', 404)

  const hoy = todayIso()
  const vaccines = await all(
    db,
    `SELECT * FROM pet_vaccines WHERE pet_id = ?
     ORDER BY proxima_dosis IS NULL, proxima_dosis ASC, fecha DESC`,
    id,
  )
  const documents = await all(
    db,
    'SELECT id, nombre, file_name, file_size, created_at FROM pet_documents WHERE pet_id = ? ORDER BY created_at DESC, id DESC',
    id,
  )

  // Sincronización con Gastos: cuentan los movimientos creados desde aquí
  // (pet_id) y los registrados en Gastos con la categoría 'Mascotas'.
  const categoriaId = await getMascotasCategoryId(db)
  const gastos = await all(
    db,
    `SELECT m.id, m.fecha, m.descripcion, m.monto, m.categoria_id, m.pet_id,
            c.nombre AS categoria_nombre, c.icono AS categoria_icono
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     WHERE m.tipo = 'gasto' AND (m.pet_id = ? OR m.categoria_id = ?)
     ORDER BY m.fecha DESC, m.id DESC`,
    id,
    categoriaId ?? -1,
  )

  const anioActual = hoy.slice(0, 4)
  const mesActual = hoy.slice(0, 7)
  const resumen = {
    total: 0,
    total_anio: 0,
    total_mes: 0,
    count: gastos.length,
  }
  for (const gasto of gastos) {
    const monto = Number(gasto.monto ?? 0)
    resumen.total += monto
    if (String(gasto.fecha).startsWith(anioActual)) resumen.total_anio += monto
    if (String(gasto.fecha).startsWith(mesActual)) resumen.total_mes += monto
  }

  return ok(c, {
    pet: { ...pet, edad: computeAge(pet.fecha_nacimiento, hoy, pet.especie) },
    vaccines: vaccines.map((vaccine) => computeVaccine(vaccine, hoy)),
    documents,
    gastos,
    gastos_resumen: resumen,
  })
})

// ── Documentos PDF (R2 privado, metadatos en D1) ────────────────────────────

pets.post('/:id/documents', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const pet = await first(db, 'SELECT id FROM pets WHERE id = ?', id)
  if (!pet) return fail(c, 'Mascota no encontrada', 404)
  if (!String(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/pdf')) {
    return fail(c, 'Solo se permiten archivos PDF')
  }

  let fileName = 'documento.pdf'
  try {
    fileName = decodeURIComponent(c.req.header('x-file-name') ?? fileName)
  } catch {
    return fail(c, 'El nombre del archivo no es válido')
  }
  fileName = cleanText(fileName, 'documento.pdf').slice(0, 180)
  const nombre = cleanText(fileName.replace(/\.pdf$/i, ''), 'Documento').slice(0, 120)

  const buffer = await c.req.arrayBuffer()
  if (!buffer.byteLength) return fail(c, 'El archivo está vacío')
  if (buffer.byteLength > MAX_FILE_BYTES) return fail(c, 'El archivo no puede superar 10 MB')
  const signature = new TextDecoder().decode(buffer.slice(0, 5))
  if (signature !== '%PDF-') return fail(c, 'El archivo no contiene un PDF válido')

  const key = `pets/${id}/docs/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`
  await c.env.FILES.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })
  const meta = await run(
    db,
    'INSERT INTO pet_documents (pet_id, nombre, file_key, file_name, file_size) VALUES (?, ?, ?, ?, ?)',
    id,
    nombre,
    key,
    fileName,
    buffer.byteLength,
  )
  return ok(c, await first(db, 'SELECT id, nombre, file_name, file_size, created_at FROM pet_documents WHERE id = ?', meta.last_row_id), 201)
})

pets.get('/documents/:docId/file', async (c) => {
  const docId = toInteger(c.req.param('docId'))
  if (!Number.isInteger(docId)) return fail(c, 'ID inválido')
  const document = await first(c.env.DB, 'SELECT file_key, file_name FROM pet_documents WHERE id = ?', docId)
  if (!document) return fail(c, 'Documento no encontrado', 404)
  const object = await c.env.FILES.get(document.file_key)
  if (!object) return fail(c, 'Archivo no encontrado en el almacenamiento', 404)

  const safeName = (document.file_name ?? 'documento.pdf').replace(/["\r\n]/g, '')
  const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline'
  return c.body(object.body, 200, {
    'content-type': 'application/pdf',
    'content-disposition': `${disposition}; filename="${safeName}"`,
    'cache-control': 'private, no-store',
  })
})

pets.put('/documents/:docId', async (c) => {
  const docId = toInteger(c.req.param('docId'))
  if (!Number.isInteger(docId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id FROM pet_documents WHERE id = ?', docId)
  if (!current) return fail(c, 'Documento no encontrado', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const nombre = cleanText(body.nombre)
  if (!nombre) return fail(c, 'El nombre del documento es obligatorio')
  if (nombre.length > 120) return fail(c, 'El nombre no puede superar 120 caracteres')

  await run(c.env.DB, `UPDATE pet_documents SET nombre = ?, updated_at = datetime('now') WHERE id = ?`, nombre, docId)
  return ok(c, await first(c.env.DB, 'SELECT id, nombre, file_name, file_size, created_at FROM pet_documents WHERE id = ?', docId))
})

pets.delete('/documents/:docId', async (c) => {
  const docId = toInteger(c.req.param('docId'))
  if (!Number.isInteger(docId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id, file_key FROM pet_documents WHERE id = ?', docId)
  if (!current) return fail(c, 'Documento no encontrado', 404)
  await c.env.FILES.delete(current.file_key)
  await run(c.env.DB, 'DELETE FROM pet_documents WHERE id = ?', docId)
  return ok(c, { id: docId })
})

// ── Vacunas ─────────────────────────────────────────────────────────────────

function normalizeVaccine(body, current = {}) {
  return {
    nombre: body.nombre === undefined ? current.nombre : cleanText(body.nombre),
    fecha: body.fecha === undefined ? current.fecha : cleanText(body.fecha),
    proxima_dosis: body.proxima_dosis === undefined ? current.proxima_dosis ?? null : cleanNullableText(body.proxima_dosis),
    veterinaria: body.veterinaria === undefined ? current.veterinaria ?? null : cleanNullableText(body.veterinaria),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateVaccine(vaccine) {
  if (!vaccine.nombre) return 'El nombre de la vacuna es obligatorio'
  if (vaccine.nombre.length > 120) return 'El nombre no puede superar 120 caracteres'
  if (!isValidDate(vaccine.fecha)) return 'La fecha de aplicación no es una fecha válida'
  if (vaccine.proxima_dosis !== null && !isValidDate(vaccine.proxima_dosis)) return 'La próxima dosis no es una fecha válida'
  if (vaccine.veterinaria && vaccine.veterinaria.length > 120) return 'La veterinaria no puede superar 120 caracteres'
  if (vaccine.notas && vaccine.notas.length > 800) return 'Las notas no pueden superar 800 caracteres'
  return null
}

pets.post('/:id/vaccines', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const pet = await first(c.env.DB, 'SELECT id FROM pets WHERE id = ?', id)
  if (!pet) return fail(c, 'Mascota no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const vaccine = normalizeVaccine(body)
  const error = validateVaccine(vaccine)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO pet_vaccines (pet_id, nombre, fecha, proxima_dosis, veterinaria, notas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, vaccine.nombre, vaccine.fecha, vaccine.proxima_dosis, vaccine.veterinaria, vaccine.notas,
  )
  const row = await first(c.env.DB, 'SELECT * FROM pet_vaccines WHERE id = ?', meta.last_row_id)
  return ok(c, computeVaccine(row, todayIso()), 201)
})

pets.put('/vaccines/:vaccineId', async (c) => {
  const vaccineId = toInteger(c.req.param('vaccineId'))
  if (!Number.isInteger(vaccineId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM pet_vaccines WHERE id = ?', vaccineId)
  if (!current) return fail(c, 'Vacuna no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const vaccine = normalizeVaccine(body, current)
  const error = validateVaccine(vaccine)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE pet_vaccines
     SET nombre = ?, fecha = ?, proxima_dosis = ?, veterinaria = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    vaccine.nombre, vaccine.fecha, vaccine.proxima_dosis, vaccine.veterinaria, vaccine.notas, vaccineId,
  )
  const row = await first(c.env.DB, 'SELECT * FROM pet_vaccines WHERE id = ?', vaccineId)
  return ok(c, computeVaccine(row, todayIso()))
})

pets.delete('/vaccines/:vaccineId', async (c) => {
  const vaccineId = toInteger(c.req.param('vaccineId'))
  if (!Number.isInteger(vaccineId)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id FROM pet_vaccines WHERE id = ?', vaccineId)
  if (!current) return fail(c, 'Vacuna no encontrada', 404)
  await run(c.env.DB, 'DELETE FROM pet_vaccines WHERE id = ?', vaccineId)
  return ok(c, { id: vaccineId })
})

// ── Gastos (integrados a movements, aparecen en Gastos e Ingresos) ──────────

pets.post('/:id/gastos', async (c) => {
  const db = c.env.DB
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const pet = await first(db, 'SELECT * FROM pets WHERE id = ?', id)
  if (!pet) return fail(c, 'Mascota no encontrada', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const concepto = cleanText(body.concepto)
  const fecha = cleanText(body.fecha, todayIso())
  const monto = toNumber(body.monto)
  if (!concepto) return fail(c, 'El concepto es obligatorio')
  if (concepto.length > 120) return fail(c, 'El concepto no puede superar 120 caracteres')
  if (!isNonNegative(monto) || monto <= 0) return fail(c, 'El monto debe ser mayor a 0')
  if (!isValidDate(fecha)) return fail(c, 'La fecha debe ser una fecha real YYYY-MM-DD')

  const categoriaId = await getMascotasCategoryId(db)
  const meta = await run(
    db,
    `INSERT INTO movements (fecha, tipo, categoria_id, descripcion, monto, subscription_id, pet_id)
     VALUES (?, 'gasto', ?, ?, ?, NULL, ?)`,
    fecha,
    categoriaId,
    `${pet.nombre}: ${concepto}`,
    monto,
    id,
  )
  return ok(c, await first(db, 'SELECT * FROM movements WHERE id = ?', meta.last_row_id), 201)
})

export default pets
