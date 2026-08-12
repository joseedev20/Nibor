import { Hono } from 'hono'
import { all, fail, first, ok, readJson, run, toInteger } from '../db.js'

// Nibor Ideas: archivo de ideas de captura rápida. La lista completa
// (activas + archivadas) siempre viaja en GET /; el frontend separa
// favoritas/archivadas igual que Recordatorios separa pendientes/completados.
// Las etiquetas se guardan delimitadas (",tag1,tag2,") para filtrar con LIKE
// sin coincidencias parciales ambiguas; las respuestas siempre exponen un
// arreglo normalizado.
const ideas = new Hono()

const VALID_TYPES = new Set(['idea', 'cita', 'reflexion', 'enlace', 'otro'])
const MAX_TAGS = 8
const EMPTY_TYPE_COUNTS = { idea: 0, cita: 0, reflexion: 0, enlace: 0, otro: 0 }

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function normalizeTags(raw) {
  const source = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
  const seen = new Set()
  const tags = []
  for (const item of source) {
    const tag = String(item ?? '').trim().toLowerCase()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

function tagsToDb(tags) {
  return tags.length ? `,${tags.join(',')},` : null
}

function tagsFromDb(value) {
  if (!value) return []
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function mapRow(row) {
  return { ...row, etiquetas: tagsFromDb(row.etiquetas), favorita: Number(row.favorita), archivada: Number(row.archivada) }
}

function normalizeIdea(body, current = {}) {
  const tags = body.etiquetas === undefined ? undefined : normalizeTags(body.etiquetas)
  return {
    contenido: body.contenido === undefined ? current.contenido : cleanText(body.contenido),
    tipo: body.tipo === undefined ? current.tipo ?? 'idea' : cleanText(body.tipo, 'idea'),
    fuente: body.fuente === undefined ? current.fuente ?? null : cleanNullableText(body.fuente),
    etiquetas: tags === undefined ? (current.etiquetas ? tagsFromDb(current.etiquetas) : []) : tags,
    favorita: body.favorita === undefined ? Number(current.favorita ?? 0) : (body.favorita ? 1 : 0),
    archivada: body.archivada === undefined ? Number(current.archivada ?? 0) : (body.archivada ? 1 : 0),
  }
}

function validateIdea(idea) {
  if (!idea.contenido) return 'El contenido es obligatorio'
  if (idea.contenido.length > 2000) return 'El contenido no puede superar 2000 caracteres'
  if (!VALID_TYPES.has(idea.tipo)) return 'El tipo debe ser idea, cita, reflexion, enlace u otro'
  if (idea.fuente && idea.fuente.length > 200) return 'La fuente no puede superar 200 caracteres'
  if (idea.etiquetas.length > MAX_TAGS) return `No puedes usar más de ${MAX_TAGS} etiquetas`
  if (idea.etiquetas.some((tag) => tag.length > 30)) return 'Cada etiqueta debe tener máximo 30 caracteres'
  return null
}

async function getIdeaById(db, id) {
  const row = await first(
    db,
    `SELECT id, contenido, tipo, fuente, etiquetas, favorita, archivada, created_at, updated_at
     FROM ideas
     WHERE id = ?`,
    id,
  )
  return row ? mapRow(row) : null
}

async function getTypeCounts(db) {
  const rows = await all(db, `SELECT tipo, COUNT(*) AS total FROM ideas GROUP BY tipo`)
  return rows.reduce((counts, row) => {
    counts[row.tipo] = Number(row.total ?? 0)
    return counts
  }, { ...EMPTY_TYPE_COUNTS })
}

async function getTagCloud(db) {
  const rows = await all(db, `SELECT etiquetas FROM ideas WHERE etiquetas IS NOT NULL`)
  const counts = new Map()
  for (const row of rows) {
    for (const tag of tagsFromDb(row.etiquetas)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([etiqueta, total]) => ({ etiqueta, total }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta))
}

ideas.get('/', async (c) => {
  const tipo = c.req.query('tipo')
  const etiqueta = cleanText(c.req.query('etiqueta')).toLowerCase()
  const q = cleanText(c.req.query('q'))
  const favoritas = c.req.query('favoritas')
  const where = []
  const params = []

  if (tipo !== undefined && tipo !== 'todos') {
    if (!VALID_TYPES.has(tipo)) return fail(c, 'El tipo debe ser idea, cita, reflexion, enlace u otro')
    where.push('tipo = ?')
    params.push(tipo)
  }

  if (etiqueta) {
    where.push('etiquetas LIKE ?')
    params.push(`%,${etiqueta},%`)
  }

  if (favoritas === '1') {
    where.push('favorita = 1')
  }

  if (q) {
    where.push('(contenido LIKE ? OR fuente LIKE ? OR etiquetas LIKE ?)')
    const pattern = `%${q}%`
    params.push(pattern, pattern, pattern)
  }

  const rows = await all(
    c.env.DB,
    `SELECT id, contenido, tipo, fuente, etiquetas, favorita, archivada, created_at, updated_at
     FROM ideas
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY archivada ASC, favorita DESC, created_at DESC, id DESC`,
    ...params,
  )

  return ok(c, {
    ideas: rows.map(mapRow),
    counts: {
      total: rows.length,
      por_tipo: await getTypeCounts(c.env.DB),
      tags: await getTagCloud(c.env.DB),
    },
  })
})

ideas.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const idea = normalizeIdea(body)
  const error = validateIdea(idea)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO ideas (contenido, tipo, fuente, etiquetas, favorita, archivada)
     VALUES (?, ?, ?, ?, ?, ?)`,
    idea.contenido,
    idea.tipo,
    idea.fuente,
    tagsToDb(idea.etiquetas),
    idea.favorita,
    idea.archivada,
  )

  return ok(c, await getIdeaById(c.env.DB, meta.last_row_id), 201)
})

ideas.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM ideas WHERE id = ?', id)
  if (!current) return fail(c, 'Idea no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const idea = normalizeIdea(body, current)
  const error = validateIdea(idea)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE ideas
     SET contenido = ?, tipo = ?, fuente = ?, etiquetas = ?, favorita = ?, archivada = ?, updated_at = datetime('now')
     WHERE id = ?`,
    idea.contenido,
    idea.tipo,
    idea.fuente,
    tagsToDb(idea.etiquetas),
    idea.favorita,
    idea.archivada,
    id,
  )

  return ok(c, await getIdeaById(c.env.DB, id))
})

ideas.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const meta = await run(c.env.DB, 'DELETE FROM ideas WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Idea no encontrada', 404)

  return ok(c, { id })
})

export default ideas
