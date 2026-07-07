import { Hono } from 'hono'
import {
  all,
  fail,
  first,
  isValidDate,
  ok,
  readJson,
  run,
  toInteger,
} from '../db.js'

const knowledge = new Hono()

const VALID_TYPES = new Set(['libro', 'curso', 'idioma', 'articulo', 'video', 'tema', 'otro'])
const VALID_STATUSES = new Set(['pendiente', 'progreso', 'pausado', 'completado', 'repasar'])
const VALID_LANGUAGES = new Set(['espanol', 'ingles'])
const EMPTY_STATUS_COUNTS = {
  pendiente: 0,
  progreso: 0,
  pausado: 0,
  completado: 0,
  repasar: 0,
}
const EMPTY_TYPE_COUNTS = {
  libro: 0,
  curso: 0,
  idioma: 0,
  articulo: 0,
  video: 0,
  tema: 0,
  otro: 0,
}
const EMPTY_LANGUAGE_COUNTS = {
  espanol: 0,
  ingles: 0,
}

function normalizeYear(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  return toInteger(value)
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function normalizeProgress(value, fallback = 0) {
  const progress = toInteger(value, fallback)
  return Number.isInteger(progress) ? progress : Number.NaN
}

function normalizeItem(body, current = {}) {
  const item = {
    titulo: body.titulo === undefined ? current.titulo : cleanText(body.titulo),
    tipo: body.tipo === undefined ? current.tipo ?? 'libro' : cleanText(body.tipo),
    estado: body.estado === undefined ? current.estado ?? 'pendiente' : cleanText(body.estado),
    idioma: body.idioma === undefined ? current.idioma ?? 'espanol' : cleanText(body.idioma),
    anio: body.anio === undefined ? current.anio ?? null : normalizeYear(body.anio, null),
    area: body.area === undefined ? current.area ?? null : cleanNullableText(body.area),
    autor: body.autor === undefined ? current.autor ?? null : cleanNullableText(body.autor),
    progreso: body.progreso === undefined ? Number(current.progreso ?? 0) : normalizeProgress(body.progreso, 0),
    fecha_inicio: body.fecha_inicio === undefined ? current.fecha_inicio ?? null : cleanNullableText(body.fecha_inicio),
    fecha_fin: body.fecha_fin === undefined ? current.fecha_fin ?? null : cleanNullableText(body.fecha_fin),
    enlace: body.enlace === undefined ? current.enlace ?? null : cleanNullableText(body.enlace),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }

  if (item.estado === 'completado') item.progreso = 100
  return item
}

function validateItem(item) {
  if (!item.titulo) return 'El titulo es obligatorio'
  if (!VALID_TYPES.has(item.tipo)) return 'El tipo debe ser libro, curso, idioma, articulo, video, tema u otro'
  if (!VALID_STATUSES.has(item.estado)) return 'El estado debe ser pendiente, progreso, pausado, completado o repasar'
  if (!VALID_LANGUAGES.has(item.idioma)) return 'El idioma debe ser espanol o ingles'
  if (item.anio !== null && (!Number.isInteger(item.anio) || item.anio < 1900 || item.anio > 2100)) {
    return 'El anio debe estar entre 1900 y 2100'
  }
  if (!Number.isInteger(item.progreso) || item.progreso < 0 || item.progreso > 100) return 'El progreso debe estar entre 0 y 100'
  if (item.fecha_inicio !== null && !isValidDate(item.fecha_inicio)) return 'La fecha de inicio debe tener formato YYYY-MM-DD'
  if (item.fecha_fin !== null && !isValidDate(item.fecha_fin)) return 'La fecha de fin debe tener formato YYYY-MM-DD'
  if (item.fecha_inicio !== null && item.fecha_fin !== null && item.fecha_fin < item.fecha_inicio) {
    return 'La fecha de fin no puede ser anterior a la fecha de inicio'
  }
  return null
}

async function getItemById(db, id) {
  return first(
    db,
    `SELECT id, titulo, tipo, estado, idioma, anio, area, autor, progreso, fecha_inicio, fecha_fin, enlace, notas, created_at, updated_at
     FROM knowledge_items
     WHERE id = ?`,
    id,
  )
}

async function getStatusCounts(db) {
  const rows = await all(
    db,
    `SELECT estado, COUNT(*) AS total
     FROM knowledge_items
     GROUP BY estado`,
  )

  return rows.reduce((counts, row) => {
    counts[row.estado] = Number(row.total ?? 0)
    return counts
  }, { ...EMPTY_STATUS_COUNTS })
}

async function getTypeCounts(db) {
  const rows = await all(
    db,
    `SELECT tipo, COUNT(*) AS total
     FROM knowledge_items
     GROUP BY tipo`,
  )

  return rows.reduce((counts, row) => {
    counts[row.tipo] = Number(row.total ?? 0)
    return counts
  }, { ...EMPTY_TYPE_COUNTS })
}

async function getLanguageCounts(db) {
  const rows = await all(
    db,
    `SELECT idioma, COUNT(*) AS total
     FROM knowledge_items
     GROUP BY idioma`,
  )

  return rows.reduce((counts, row) => {
    counts[row.idioma] = Number(row.total ?? 0)
    return counts
  }, { ...EMPTY_LANGUAGE_COUNTS })
}

async function getYearCounts(db) {
  const rows = await all(
    db,
    `SELECT anio, COUNT(*) AS total
     FROM knowledge_items
     WHERE anio IS NOT NULL
     GROUP BY anio
     ORDER BY anio DESC`,
  )

  return rows.reduce((counts, row) => {
    counts[row.anio] = Number(row.total ?? 0)
    return counts
  }, {})
}

knowledge.get('/items', async (c) => {
  const tipo = c.req.query('tipo')
  const estado = c.req.query('estado')
  const idioma = c.req.query('idioma')
  const anioParam = c.req.query('anio')
  const q = cleanText(c.req.query('q'))
  const where = []
  const params = []

  if (tipo !== undefined && tipo !== 'todos') {
    if (!VALID_TYPES.has(tipo)) return fail(c, 'El tipo debe ser libro, curso, idioma, articulo, video, tema u otro')
    where.push('tipo = ?')
    params.push(tipo)
  }

  if (estado !== undefined && estado !== 'todos') {
    if (!VALID_STATUSES.has(estado)) return fail(c, 'El estado debe ser pendiente, progreso, pausado, completado o repasar')
    where.push('estado = ?')
    params.push(estado)
  }

  if (idioma !== undefined && idioma !== 'todos') {
    if (!VALID_LANGUAGES.has(idioma)) return fail(c, 'El idioma debe ser espanol o ingles')
    where.push('idioma = ?')
    params.push(idioma)
  }

  if (anioParam !== undefined && anioParam !== 'todos') {
    const anio = toInteger(anioParam)
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) return fail(c, 'El anio debe estar entre 1900 y 2100')
    where.push('anio = ?')
    params.push(anio)
  }

  if (q) {
    where.push('(titulo LIKE ? OR area LIKE ? OR autor LIKE ? OR notas LIKE ? OR CAST(anio AS TEXT) LIKE ?)')
    const pattern = `%${q}%`
    params.push(pattern, pattern, pattern, pattern, pattern)
  }

  const items = await all(
    c.env.DB,
    `SELECT id, titulo, tipo, estado, idioma, anio, area, autor, progreso, fecha_inicio, fecha_fin, enlace, notas, created_at, updated_at
     FROM knowledge_items
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY
       CASE estado
         WHEN 'progreso' THEN 1
         WHEN 'pendiente' THEN 2
         WHEN 'pausado' THEN 3
         WHEN 'repasar' THEN 4
         WHEN 'completado' THEN 5
         ELSE 6
       END,
       updated_at DESC,
       titulo ASC`,
    ...params,
  )

  return ok(c, {
    items,
    counts: {
      by_estado: await getStatusCounts(c.env.DB),
      by_tipo: await getTypeCounts(c.env.DB),
      by_idioma: await getLanguageCounts(c.env.DB),
      by_anio: await getYearCounts(c.env.DB),
    },
  })
})

knowledge.post('/items', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const item = normalizeItem(body)
  const error = validateItem(item)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO knowledge_items (titulo, tipo, estado, idioma, anio, area, autor, progreso, fecha_inicio, fecha_fin, enlace, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.titulo,
    item.tipo,
    item.estado,
    item.idioma,
    item.anio,
    item.area,
    item.autor,
    item.progreso,
    item.fecha_inicio,
    item.fecha_fin,
    item.enlace,
    item.notas,
  )

  return ok(c, await getItemById(c.env.DB, meta.last_row_id), 201)
})

knowledge.put('/items/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getItemById(c.env.DB, id)
  if (!current) return fail(c, 'Recurso no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const item = normalizeItem(body, current)
  const error = validateItem(item)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE knowledge_items
     SET titulo = ?, tipo = ?, estado = ?, idioma = ?, anio = ?, area = ?, autor = ?, progreso = ?,
         fecha_inicio = ?, fecha_fin = ?, enlace = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    item.titulo,
    item.tipo,
    item.estado,
    item.idioma,
    item.anio,
    item.area,
    item.autor,
    item.progreso,
    item.fecha_inicio,
    item.fecha_fin,
    item.enlace,
    item.notas,
    id,
  )

  return ok(c, await getItemById(c.env.DB, id))
})

knowledge.delete('/items/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM knowledge_items WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Recurso no encontrado', 404)

  return ok(c, { id })
})

export default knowledge
