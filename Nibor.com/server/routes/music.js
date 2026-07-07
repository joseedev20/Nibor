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

const music = new Hono()

const VALID_STATUSES = new Set(['idea', 'proceso', 'lista', 'publicada'])
const EMPTY_COUNTS = {
  idea: 0,
  proceso: 0,
  lista: 0,
  publicada: 0,
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function normalizeSong(body, current = {}) {
  const creating = !current.id
  const estado = body.estado === undefined
    ? current.estado ?? 'proceso'
    : cleanText(body.estado)
  const genero = body.genero === undefined
    ? creating ? 'Rap' : current.genero ?? null
    : cleanNullableText(body.genero) ?? (creating ? 'Rap' : null)

  return {
    titulo: body.titulo === undefined ? current.titulo : cleanText(body.titulo),
    artista: 'Nibor',
    estado,
    genero,
    bpm: null,
    tonalidad: null,
    fecha_publicacion: body.fecha_publicacion === undefined ? current.fecha_publicacion ?? null : cleanNullableText(body.fecha_publicacion),
    enlace: body.enlace === undefined ? current.enlace ?? null : cleanNullableText(body.enlace),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateSong(song) {
  if (!song.titulo) return 'El titulo de la cancion es obligatorio'
  if (!VALID_STATUSES.has(song.estado)) return 'El estado debe ser idea, proceso, lista o publicada'
  if (song.bpm !== null && (!Number.isInteger(song.bpm) || song.bpm <= 0)) return 'El BPM debe ser un numero mayor a 0'
  if (song.fecha_publicacion !== null && !isValidDate(song.fecha_publicacion)) return 'La fecha de publicacion debe tener formato YYYY-MM-DD'
  return null
}

async function getSongById(db, id) {
  return first(
    db,
    `SELECT id, titulo, artista, estado, genero, bpm, tonalidad, fecha_publicacion, enlace, notas, created_at, updated_at
     FROM music_songs
     WHERE id = ?`,
    id,
  )
}

async function getCounts(db) {
  const rows = await all(
    db,
    `SELECT estado, COUNT(*) AS total
     FROM music_songs
     GROUP BY estado`,
  )

  return rows.reduce((counts, row) => {
    counts[row.estado] = Number(row.total ?? 0)
    return counts
  }, { ...EMPTY_COUNTS })
}

music.get('/songs', async (c) => {
  const estado = c.req.query('estado')
  const q = cleanText(c.req.query('q'))
  const where = []
  const params = []

  if (estado !== undefined && estado !== 'todas') {
    if (!VALID_STATUSES.has(estado)) return fail(c, 'El estado debe ser idea, proceso, lista o publicada')
    where.push('estado = ?')
    params.push(estado)
  }

  if (q) {
    where.push('(titulo LIKE ? OR artista LIKE ? OR genero LIKE ? OR notas LIKE ?)')
    const pattern = `%${q}%`
    params.push(pattern, pattern, pattern, pattern)
  }

  const songs = await all(
    c.env.DB,
    `SELECT id, titulo, artista, estado, genero, bpm, tonalidad, fecha_publicacion, enlace, notas, created_at, updated_at
     FROM music_songs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY
       CASE estado
         WHEN 'proceso' THEN 1
         WHEN 'lista' THEN 2
         WHEN 'idea' THEN 3
         WHEN 'publicada' THEN 4
         ELSE 5
       END,
       COALESCE(fecha_publicacion, updated_at) DESC,
       titulo ASC`,
    ...params,
  )

  return ok(c, {
    songs,
    counts: await getCounts(c.env.DB),
  })
})

music.post('/songs', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const song = normalizeSong(body)
  const error = validateSong(song)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO music_songs (titulo, artista, estado, genero, bpm, tonalidad, fecha_publicacion, enlace, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    song.titulo,
    song.artista,
    song.estado,
    song.genero,
    song.bpm,
    song.tonalidad,
    song.fecha_publicacion,
    song.enlace,
    song.notas,
  )

  return ok(c, await getSongById(c.env.DB, meta.last_row_id), 201)
})

music.put('/songs/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getSongById(c.env.DB, id)
  if (!current) return fail(c, 'Cancion no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const song = normalizeSong(body, current)
  const error = validateSong(song)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE music_songs
     SET titulo = ?, artista = ?, estado = ?, genero = ?, bpm = ?, tonalidad = ?,
         fecha_publicacion = ?, enlace = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    song.titulo,
    song.artista,
    song.estado,
    song.genero,
    song.bpm,
    song.tonalidad,
    song.fecha_publicacion,
    song.enlace,
    song.notas,
    id,
  )

  return ok(c, await getSongById(c.env.DB, id))
})

music.delete('/songs/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM music_songs WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Cancion no encontrada', 404)

  return ok(c, { id })
})

export default music
