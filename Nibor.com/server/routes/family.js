import { Hono } from 'hono'
import { all, fail, first, ok, readJson, run, toInteger } from '../db.js'

const family = new Hono()
const MAX_FILE_BYTES = 10 * 1024 * 1024
const VALID_DOCUMENT_TYPES = new Set([
  'cedula_ciudadania',
  'tarjeta_identidad',
  'cedula_extranjeria',
  'pasaporte',
  'registro_civil',
  'otro',
])

family.use('*', async (c, next) => {
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

function normalizeMember(body, current = {}) {
  return {
    nombre: body.nombre === undefined ? current.nombre : cleanText(body.nombre),
    parentesco: body.parentesco === undefined ? current.parentesco : cleanText(body.parentesco),
    tipo_documento: body.tipo_documento === undefined
      ? current.tipo_documento ?? 'cedula_ciudadania'
      : cleanText(body.tipo_documento),
    numero_documento: body.numero_documento === undefined
      ? current.numero_documento
      : cleanText(body.numero_documento),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateMember(member) {
  if (!member.nombre) return 'El nombre es obligatorio'
  if (member.nombre.length > 120) return 'El nombre no puede superar 120 caracteres'
  if (!member.parentesco) return 'El parentesco es obligatorio'
  if (member.parentesco.length > 60) return 'El parentesco no puede superar 60 caracteres'
  if (!VALID_DOCUMENT_TYPES.has(member.tipo_documento)) return 'El tipo de documento no es válido'
  if (!member.numero_documento) return 'El número de documento es obligatorio'
  if (member.numero_documento.length > 40) return 'El número de documento no puede superar 40 caracteres'
  if (!/^[\p{L}\p{N}.\-\s]+$/u.test(member.numero_documento)) return 'El número de documento contiene caracteres no permitidos'
  if (member.notas && member.notas.length > 800) return 'Las notas no pueden superar 800 caracteres'
  return null
}

function getMember(db, id) {
  return first(
    db,
    `SELECT id, nombre, parentesco, tipo_documento, numero_documento, notas,
            file_name, file_size, created_at, updated_at
     FROM family_members WHERE id = ?`,
    id,
  )
}

family.get('/', async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT id, nombre, parentesco, tipo_documento, numero_documento, notas,
            file_name, file_size, created_at, updated_at
     FROM family_members
     ORDER BY parentesco COLLATE NOCASE, nombre COLLATE NOCASE`,
  )
  return ok(c, rows)
})

family.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const member = normalizeMember(body)
  const error = validateMember(member)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO family_members (nombre, parentesco, tipo_documento, numero_documento, notas)
     VALUES (?, ?, ?, ?, ?)`,
    member.nombre,
    member.parentesco,
    member.tipo_documento,
    member.numero_documento,
    member.notas,
  )
  return ok(c, await getMember(c.env.DB, meta.last_row_id), 201)
})

family.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM family_members WHERE id = ?', id)
  if (!current) return fail(c, 'Familiar no encontrado', 404)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')
  const member = normalizeMember(body, current)
  const error = validateMember(member)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE family_members
     SET nombre = ?, parentesco = ?, tipo_documento = ?, numero_documento = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    member.nombre,
    member.parentesco,
    member.tipo_documento,
    member.numero_documento,
    member.notas,
    id,
  )
  return ok(c, await getMember(c.env.DB, id))
})

family.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT id, file_key FROM family_members WHERE id = ?', id)
  if (!current) return fail(c, 'Familiar no encontrado', 404)
  if (current.file_key) await c.env.FILES.delete(current.file_key)
  await run(c.env.DB, 'DELETE FROM family_members WHERE id = ?', id)
  return ok(c, { id })
})

family.post('/:id/file', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT * FROM family_members WHERE id = ?', id)
  if (!current) return fail(c, 'Familiar no encontrado', 404)
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

  const buffer = await c.req.arrayBuffer()
  if (!buffer.byteLength) return fail(c, 'El archivo está vacío')
  if (buffer.byteLength > MAX_FILE_BYTES) return fail(c, 'El archivo no puede superar 10 MB')
  const signature = new TextDecoder().decode(buffer.slice(0, 5))
  if (signature !== '%PDF-') return fail(c, 'El archivo no contiene un PDF válido')

  const key = `familia/${id}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, '_')}`
  await c.env.FILES.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })
  if (current.file_key) await c.env.FILES.delete(current.file_key)

  await run(
    c.env.DB,
    `UPDATE family_members
     SET file_key = ?, file_name = ?, file_size = ?, updated_at = datetime('now')
     WHERE id = ?`,
    key,
    fileName,
    buffer.byteLength,
    id,
  )
  return ok(c, await getMember(c.env.DB, id), 201)
})

family.get('/:id/file', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT file_key, file_name FROM family_members WHERE id = ?', id)
  if (!current?.file_key) return fail(c, 'Este familiar no tiene PDF adjunto', 404)
  const object = await c.env.FILES.get(current.file_key)
  if (!object) return fail(c, 'Archivo no encontrado en el almacenamiento', 404)

  const safeName = (current.file_name ?? 'documento.pdf').replace(/["\r\n]/g, '')
  const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline'
  return c.body(object.body, 200, {
    'content-type': 'application/pdf',
    'content-disposition': `${disposition}; filename="${safeName}"`,
    'cache-control': 'private, no-store',
  })
})

family.delete('/:id/file', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')
  const current = await first(c.env.DB, 'SELECT file_key FROM family_members WHERE id = ?', id)
  if (!current) return fail(c, 'Familiar no encontrado', 404)
  if (!current.file_key) return fail(c, 'Este familiar no tiene PDF adjunto', 404)
  await c.env.FILES.delete(current.file_key)
  await run(
    c.env.DB,
    `UPDATE family_members
     SET file_key = NULL, file_name = NULL, file_size = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    id,
  )
  return ok(c, await getMember(c.env.DB, id))
})

export default family
