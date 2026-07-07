import { Hono } from 'hono'
import {
  all,
  booleanToInt,
  fail,
  first,
  isValidDate,
  ok,
  readJson,
  run,
  toInteger,
} from '../db.js'

const habits = new Hono()

const VALID_MODULES = new Set(['salud', 'knowledge'])
const VALID_BEHAVIORS = new Set([
  'medication_taken',
  'exercise_done',
  'hygiene_done',
  'reading_done',
  'language_practice',
])

const BEHAVIOR_LABELS = {
  medication_taken: 'Medicamento tomado',
  exercise_done: 'Ejercicio',
  hygiene_done: 'Higiene',
  reading_done: 'Lectura',
  language_practice: 'Práctica de idioma',
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function todayBogota() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function nowBogotaDateTime() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

function normalizeDateTime(value) {
  const text = cleanText(value)
  if (!text) return nowBogotaDateTime()
  const normalized = text.replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)
    ? (normalized.length === 16 ? `${normalized}:00` : normalized)
    : null
}

function parseDateParts(date) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function dayOfWeek(date) {
  const { year, month, day } = parseDateParts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function addDays(date, amount) {
  const { year, month, day } = parseDateParts(date)
  const next = new Date(Date.UTC(year, month - 1, day + amount))
  return next.toISOString().slice(0, 10)
}

function startOfWeek(date) {
  const offset = (dayOfWeek(date) + 6) % 7
  return addDays(date, -offset)
}

function startOfMonth(date) {
  return `${date.slice(0, 7)}-01`
}

function startOfNextMonth(date) {
  const { year, month } = parseDateParts(date)
  const next = new Date(Date.UTC(year, month, 1))
  return next.toISOString().slice(0, 10)
}

function startOfQuarter(date) {
  const { year, month } = parseDateParts(date)
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1
  return `${year}-${String(firstMonth).padStart(2, '0')}-01`
}

function addMonths(date, amount) {
  const { year, month, day } = parseDateParts(date)
  const next = new Date(Date.UTC(year, month - 1 + amount, day))
  return next.toISOString().slice(0, 10)
}

function startOfHalf(date) {
  const { year, month } = parseDateParts(date)
  return `${year}-${month <= 6 ? '01' : '07'}-01`
}

function startOfYear(date) {
  return `${date.slice(0, 4)}-01-01`
}

function isPlanned(schedule, date) {
  return schedule.length === 0 || schedule.includes(dayOfWeek(date))
}

function expectedCount(start, endExclusive, schedule, target) {
  let count = 0
  for (let cursor = start; cursor < endExclusive; cursor = addDays(cursor, 1)) {
    if (isPlanned(schedule, cursor)) count += target
  }
  return count
}

function clampPercent(events, planned) {
  return planned > 0 ? Math.min(100, Math.round((events / planned) * 100)) : 0
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return []
  return [...new Set(days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b)
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) return []
  const normalized = []
  const seen = new Set()

  for (const link of links) {
    const module = cleanText(link?.module)
    const behavior = cleanText(link?.behavior)
    const key = `${module}:${behavior}`
    if (!VALID_MODULES.has(module) || !VALID_BEHAVIORS.has(behavior) || seen.has(key)) continue
    seen.add(key)
    normalized.push({
      module,
      behavior,
      target_id: toInteger(link?.target_id, null),
      target_label: cleanNullableText(link?.target_label),
    })
  }

  return normalized
}

function normalizeHabit(body, current = {}) {
  return {
    name: body.name === undefined ? current.name : cleanText(body.name),
    description: body.description === undefined ? current.description ?? null : cleanNullableText(body.description),
    emoji: body.emoji === undefined ? current.emoji ?? null : cleanNullableText(body.emoji),
    color: body.color === undefined ? current.color ?? '#10b981' : cleanText(body.color, '#10b981'),
    sort_index: body.sort_index === undefined ? Number(current.sort_index ?? 0) : toInteger(body.sort_index, 0),
    target_per_day: body.target_per_day === undefined ? Number(current.target_per_day ?? 1) : toInteger(body.target_per_day, 1),
    is_active: body.is_active === undefined ? Number(current.is_active ?? 1) : booleanToInt(body.is_active, current.is_active ?? 1),
    start_date: body.start_date === undefined ? current.start_date ?? todayBogota() : cleanNullableText(body.start_date),
    end_date: body.end_date === undefined ? current.end_date ?? null : cleanNullableText(body.end_date),
  }
}

function validateHabit(habit) {
  if (!habit.name) return 'El nombre del hábito es obligatorio'
  if (habit.name.length > 120) return 'El nombre no puede superar 120 caracteres'
  if (!Number.isInteger(habit.target_per_day) || habit.target_per_day < 1 || habit.target_per_day > 50) {
    return 'La meta diaria debe estar entre 1 y 50'
  }
  if (!Number.isInteger(habit.sort_index)) return 'El orden debe ser un número entero'
  if (habit.start_date !== null && !isValidDate(habit.start_date)) return 'La fecha de inicio debe tener formato YYYY-MM-DD'
  if (habit.end_date !== null && !isValidDate(habit.end_date)) return 'La fecha de cierre debe tener formato YYYY-MM-DD'
  if (habit.start_date !== null && habit.end_date !== null && habit.end_date < habit.start_date) {
    return 'La fecha de cierre no puede ser anterior al inicio'
  }
  return null
}

async function getHabitById(db, id) {
  return first(
    db,
    `SELECT id, old_id, name, description, emoji, color, sort_index, target_per_day,
            is_active, start_date, end_date, created_at, updated_at
     FROM habits
     WHERE id = ?`,
    id,
  )
}

async function getSchedules(db, ids) {
  const schedules = new Map(ids.map((id) => [id, []]))
  if (!ids.length) return schedules
  const placeholders = ids.map(() => '?').join(',')
  const rows = await all(
    db,
    `SELECT habit_id, day_of_week
     FROM habit_schedule
     WHERE habit_id IN (${placeholders})
     ORDER BY day_of_week ASC`,
    ...ids,
  )
  for (const row of rows) schedules.get(row.habit_id)?.push(Number(row.day_of_week))
  return schedules
}

async function getLinks(db, ids) {
  const links = new Map(ids.map((id) => [id, []]))
  if (!ids.length) return links
  const placeholders = ids.map(() => '?').join(',')
  const rows = await all(
    db,
    `SELECT id, habit_id, module, behavior, target_id, target_label, created_at, updated_at
     FROM habit_links
     WHERE habit_id IN (${placeholders})
     ORDER BY module ASC, behavior ASC`,
    ...ids,
  )
  for (const row of rows) {
    links.get(row.habit_id)?.push({
      ...row,
      behavior_label: BEHAVIOR_LABELS[row.behavior] ?? row.behavior,
    })
  }
  return links
}

async function enrichHabits(db, rows) {
  const ids = rows.map((row) => row.id)
  const schedules = await getSchedules(db, ids)
  const links = await getLinks(db, ids)
  return rows.map((row) => ({
    ...row,
    days: schedules.get(row.id) ?? [],
    links: links.get(row.id) ?? [],
  }))
}

async function replaceSchedule(db, habitId, days) {
  const statements = [
    db.prepare('DELETE FROM habit_schedule WHERE habit_id = ?').bind(habitId),
    ...days.map((day) => (
      db.prepare('INSERT OR IGNORE INTO habit_schedule (habit_id, day_of_week) VALUES (?, ?)').bind(habitId, day)
    )),
  ]
  if (statements.length) await db.batch(statements)
}

async function replaceLinks(db, habitId, links) {
  const statements = [
    db.prepare('DELETE FROM habit_links WHERE habit_id = ?').bind(habitId),
    ...links.map((link) => (
      db.prepare(
        `INSERT INTO habit_links (habit_id, module, behavior, target_id, target_label)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(habitId, link.module, link.behavior, link.target_id, link.target_label)
    )),
  ]
  if (statements.length) await db.batch(statements)
}

async function upsertDefer(db, habitId, date) {
  await run(
    db,
    `INSERT INTO habit_defer (habit_id, day_date, defer_rank, updated_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(habit_id, day_date) DO UPDATE SET
       defer_rank = defer_rank + 1,
       updated_at = datetime('now')`,
    habitId,
    date,
  )
  return first(db, 'SELECT habit_id, day_date, defer_rank, updated_at FROM habit_defer WHERE habit_id = ? AND day_date = ?', habitId, date)
}

async function countHabitEventsForDate(db, habitId, date) {
  const row = await first(
    db,
    `SELECT COUNT(*) AS total
     FROM habit_events
     WHERE habit_id = ? AND substr(event_time, 1, 10) = ?`,
    habitId,
    date,
  )
  return Number(row?.total ?? 0)
}

function buildStreaks(byDate, target, schedule, today) {
  let current = 0
  for (let cursor = today; ; cursor = addDays(cursor, -1)) {
    if (!isPlanned(schedule, cursor)) continue
    if (Number(byDate.get(cursor) ?? 0) >= target) current += 1
    else break
    if (current > 1095) break
  }

  let longest = 0
  let run = 0
  const start = addDays(today, -365)
  for (let cursor = start; cursor <= today; cursor = addDays(cursor, 1)) {
    if (!isPlanned(schedule, cursor)) continue
    if (Number(byDate.get(cursor) ?? 0) >= target) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }

  return { current, longest }
}

function rangeMetric(eventsByDate, start, end, schedule, target) {
  let events = 0
  let days = 0
  for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
    const count = Number(eventsByDate.get(cursor) ?? 0)
    events += count
    if (count > 0) days += 1
  }
  const planned = expectedCount(start, end, schedule, target)
  return { events, days, planned, percent: clampPercent(events, planned) }
}

async function buildProgress(db, date = todayBogota()) {
  const rows = await all(
    db,
    `SELECT id, old_id, name, description, emoji, color, sort_index, target_per_day,
            is_active, start_date, end_date, created_at, updated_at
     FROM habits
     WHERE is_active = 1
     ORDER BY sort_index ASC, id ASC`,
  )
  const enriched = await enrichHabits(db, rows)
  const weekStart = startOfWeek(date)
  const monthStart = startOfMonth(date)
  const quarterStart = startOfQuarter(date)
  const halfStart = startOfHalf(date)
  const yearStart = startOfYear(date)
  const windows = {
    weekly: [weekStart, addDays(weekStart, 7)],
    monthly: [monthStart, startOfNextMonth(date)],
    quarterly: [quarterStart, addMonths(quarterStart, 3)],
    semiannual: [halfStart, addMonths(halfStart, 6)],
    annual: [yearStart, `${Number(date.slice(0, 4)) + 1}-01-01`],
  }

  let doneToday = 0
  let plannedToday = 0
  let bestCurrentStreak = 0
  const items = []

  // Serie diaria global (todos los hábitos) para calendario y semanas
  const dailyStart = addDays(date, -181)
  const dailyMap = new Map() // fecha -> { done, planned }

  for (const habit of enriched) {
    const target = Number(habit.target_per_day)
    const schedule = habit.days
    const historyStart = addDays(date, -365)
    const events = await all(
      db,
      `SELECT substr(event_time, 1, 10) AS day, COUNT(*) AS total
       FROM habit_events
       WHERE habit_id = ? AND substr(event_time, 1, 10) >= ?
       GROUP BY substr(event_time, 1, 10)`,
      habit.id,
      historyStart,
    )
    const byDate = new Map(events.map((row) => [row.day, Number(row.total ?? 0)]))
    const todayCount = Number(byDate.get(date) ?? 0)
    const planned = isPlanned(schedule, date)

    if (planned) {
      plannedToday += target
      doneToday += Math.min(todayCount, target)
    }

    const streaks = buildStreaks(byDate, target, schedule, date)
    bestCurrentStreak = Math.max(bestCurrentStreak, streaks.current)

    const heatmap = []
    for (let cursor = dailyStart; cursor <= date; cursor = addDays(cursor, 1)) {
      const count = Number(byDate.get(cursor) ?? 0)
      const plannedDay = isPlanned(schedule, cursor)
      heatmap.push({
        date: cursor,
        planned: plannedDay,
        done: count,
        met: count >= target,
      })
      if (plannedDay) {
        const entry = dailyMap.get(cursor) ?? { done: 0, planned: 0 }
        entry.planned += target
        entry.done += Math.min(count, target)
        dailyMap.set(cursor, entry)
      }
    }

    const item = {
      ...habit,
      done_today: todayCount,
      planned_today: planned,
      streak_current: streaks.current,
      streak_longest: streaks.longest,
      heatmap,
    }

    for (const [key, [start, end]] of Object.entries(windows)) {
      item[key] = rangeMetric(byDate, start, end, schedule, target)
    }

    items.push(item)
  }

  // Serie diaria (últimos 182 días) con % global de cumplimiento
  const daily = []
  for (let cursor = dailyStart; cursor <= date; cursor = addDays(cursor, 1)) {
    const entry = dailyMap.get(cursor)
    daily.push({
      date: cursor,
      done: entry?.done ?? 0,
      planned: entry?.planned ?? 0,
      percent: entry?.planned ? clampPercent(entry.done, entry.planned) : null,
    })
  }

  // Últimas 12 semanas (semana de la fecha incluida)
  const weekly_series = []
  let weekCursor = startOfWeek(date)
  for (let i = 0; i < 12; i++) {
    const weekEnd = addDays(weekCursor, 6)
    let done = 0
    let planned = 0
    for (let cur = weekCursor; cur <= (weekEnd < date ? weekEnd : date); cur = addDays(cur, 1)) {
      const entry = dailyMap.get(cur)
      if (entry) {
        done += entry.done
        planned += entry.planned
      }
    }
    weekly_series.unshift({
      week_start: weekCursor,
      done,
      planned,
      percent: planned ? clampPercent(done, planned) : null,
    })
    weekCursor = addDays(weekCursor, -7)
  }

  return {
    items,
    habits: items,
    daily,
    weekly_series,
    summary: {
      total_habits: items.length,
      done_today: doneToday,
      planned_today: plannedToday,
      percent_today: clampPercent(doneToday, plannedToday),
      best_current_streak: bestCurrentStreak,
    },
  }
}

habits.get('/', async (c) => {
  const includeInactive = c.req.query('include_inactive') === '1'
  const rows = await all(
    c.env.DB,
    `SELECT id, old_id, name, description, emoji, color, sort_index, target_per_day,
            is_active, start_date, end_date, created_at, updated_at
     FROM habits
     ${includeInactive ? '' : 'WHERE is_active = 1'}
     ORDER BY is_active DESC, sort_index ASC, id ASC`,
  )
  const enriched = await enrichHabits(c.env.DB, rows)
  const importedHabits = await first(c.env.DB, 'SELECT COUNT(*) AS total FROM habits WHERE old_id IS NOT NULL')
  const importedEvents = await first(c.env.DB, 'SELECT COUNT(*) AS total FROM habit_events WHERE old_event_id IS NOT NULL')
  return ok(c, {
    habits: enriched,
    summary: {
      total: enriched.length,
      active: enriched.filter((habit) => Number(habit.is_active) === 1).length,
      linked: enriched.filter((habit) => habit.links.length > 0).length,
      imported_habits: Number(importedHabits?.total ?? 0),
      imported_events: Number(importedEvents?.total ?? 0),
    },
  })
})

habits.get('/today', async (c) => {
  const date = c.req.query('date') ?? todayBogota()
  if (!isValidDate(date)) return fail(c, 'La fecha debe tener formato YYYY-MM-DD')

  const rows = await all(
    c.env.DB,
    `SELECT h.id, h.old_id, h.name, h.description, h.emoji, h.color, h.sort_index, h.target_per_day,
            h.is_active, h.start_date, h.end_date, h.created_at, h.updated_at,
            COALESCE(d.defer_rank, NULL) AS defer_rank,
            COALESCE(today.done_today, 0) AS done_today
     FROM habits h
     LEFT JOIN habit_defer d ON d.habit_id = h.id AND d.day_date = ?
     LEFT JOIN (
       SELECT habit_id, COUNT(*) AS done_today
       FROM habit_events
       WHERE substr(event_time, 1, 10) = ?
       GROUP BY habit_id
     ) today ON today.habit_id = h.id
     WHERE h.is_active = 1
       AND (h.start_date IS NULL OR h.start_date <= ?)
       AND (h.end_date IS NULL OR h.end_date >= ?)
     ORDER BY h.sort_index ASC, h.id ASC`,
    date,
    date,
    date,
    date,
  )
  const enriched = await enrichHabits(c.env.DB, rows)
  const todayRows = []
  let planned = 0
  let done = 0

  for (const habit of enriched) {
    if (!isPlanned(habit.days, date)) continue
    const target = Number(habit.target_per_day)
    const doneToday = Number(habit.done_today ?? 0)
    planned += target
    done += Math.min(doneToday, target)
    if (doneToday < target) {
      todayRows.push({
        ...habit,
        done_today: doneToday,
        remaining_today: target - doneToday,
      })
    }
  }

  todayRows.sort((a, b) => {
    const aDeferred = a.defer_rank !== null && a.defer_rank !== undefined
    const bDeferred = b.defer_rank !== null && b.defer_rank !== undefined
    if (aDeferred !== bDeferred) return aDeferred ? 1 : -1
    if (aDeferred && bDeferred && a.defer_rank !== b.defer_rank) return Number(a.defer_rank) - Number(b.defer_rank)
    return Number(a.sort_index) - Number(b.sort_index) || Number(a.id) - Number(b.id)
  })

  return ok(c, {
    date,
    habits: todayRows,
    summary: {
      planned_today: planned,
      done_today: done,
      pending_today: todayRows.length,
      percent_today: clampPercent(done, planned),
    },
  })
})

habits.get('/progress', async (c) => {
  const date = c.req.query('date') ?? todayBogota()
  if (!isValidDate(date)) return fail(c, 'La fecha debe tener formato YYYY-MM-DD')
  return ok(c, await buildProgress(c.env.DB, date))
})

habits.get('/activity', async (c) => {
  const module = c.req.query('module')
  if (!VALID_MODULES.has(module)) return fail(c, 'El modulo debe ser salud o knowledge')

  const behavior = c.req.query('behavior')
  if (behavior !== undefined && behavior !== 'todos' && !VALID_BEHAVIORS.has(behavior)) {
    return fail(c, 'El comportamiento no es valido')
  }

  const from = c.req.query('from')
  const to = c.req.query('to')
  if (from !== undefined && !isValidDate(from)) return fail(c, 'La fecha inicial debe tener formato YYYY-MM-DD')
  if (to !== undefined && !isValidDate(to)) return fail(c, 'La fecha final debe tener formato YYYY-MM-DD')
  if (from !== undefined && to !== undefined && to < from) return fail(c, 'La fecha final no puede ser anterior a la inicial')

  const limit = toInteger(c.req.query('limit'), 30)
  if (!Number.isInteger(limit) || limit < 1 || limit > 300) return fail(c, 'El limite debe estar entre 1 y 300')

  const where = ['l.module = ?']
  const params = [module]
  if (behavior !== undefined && behavior !== 'todos') {
    where.push('l.behavior = ?')
    params.push(behavior)
  }
  if (from !== undefined) {
    where.push('substr(e.event_time, 1, 10) >= ?')
    params.push(from)
  }
  if (to !== undefined) {
    where.push('substr(e.event_time, 1, 10) <= ?')
    params.push(to)
  }

  const events = await all(
    c.env.DB,
    `SELECT e.id, e.habit_id, h.name AS habit_name, h.emoji, h.color,
            l.module, l.behavior, l.target_id, l.target_label,
            e.event_time, e.source, e.note
     FROM habit_events e
     JOIN habits h ON h.id = e.habit_id
     JOIN habit_links l ON l.habit_id = h.id
     WHERE ${where.join(' AND ')}
     ORDER BY e.event_time DESC, e.id DESC
     LIMIT ?`,
    ...params,
    limit,
  )

  const summaryRows = await all(
    c.env.DB,
    `SELECT l.behavior, l.target_label, COUNT(*) AS total, MAX(e.event_time) AS last_event
     FROM habit_events e
     JOIN habits h ON h.id = e.habit_id
     JOIN habit_links l ON l.habit_id = h.id
     WHERE ${where.join(' AND ')}
     GROUP BY l.behavior, l.target_label
     ORDER BY total DESC, l.behavior ASC`,
    ...params,
  )

  return ok(c, {
    module,
    events: events.map((event) => ({
      ...event,
      behavior_label: BEHAVIOR_LABELS[event.behavior] ?? event.behavior,
    })),
    summary: summaryRows.map((row) => ({
      ...row,
      total: Number(row.total ?? 0),
      behavior_label: BEHAVIOR_LABELS[row.behavior] ?? row.behavior,
    })),
  })
})

habits.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const habit = normalizeHabit(body)
  const error = validateHabit(habit)
  if (error) return fail(c, error)

  const days = normalizeDays(body.days)
  const links = normalizeLinks(body.links)
  const meta = await run(
    c.env.DB,
    `INSERT INTO habits (name, description, emoji, color, sort_index, target_per_day, is_active, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    habit.name,
    habit.description,
    habit.emoji,
    habit.color,
    habit.sort_index,
    habit.target_per_day,
    habit.is_active,
    habit.start_date,
    habit.end_date,
  )

  await replaceSchedule(c.env.DB, meta.last_row_id, days)
  await replaceLinks(c.env.DB, meta.last_row_id, links)
  const [created] = await enrichHabits(c.env.DB, [await getHabitById(c.env.DB, meta.last_row_id)])
  return ok(c, created, 201)
})

habits.post('/reorder', async (c) => {
  const body = await readJson(c)
  if (!body || !Array.isArray(body.order) || body.order.length === 0) return fail(c, 'El orden es obligatorio')
  const order = body.order.map((id) => Number(id)).filter((id) => Number.isInteger(id))
  if (order.length !== body.order.length) return fail(c, 'El orden contiene IDs invalidos')
  if (new Set(order).size !== order.length) return fail(c, 'El orden contiene IDs duplicados')

  const placeholders = order.map(() => '?').join(',')
  const rows = await all(c.env.DB, `SELECT id FROM habits WHERE id IN (${placeholders})`, ...order)
  if (rows.length !== order.length) return fail(c, 'Hay hábitos inexistentes en el orden', 404)

  await c.env.DB.batch(order.map((id, index) => (
    c.env.DB.prepare('UPDATE habits SET sort_index = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(index, id)
  )))
  return ok(c, { order })
})

habits.get('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')
  const habit = await getHabitById(c.env.DB, id)
  if (!habit) return fail(c, 'Hábito no encontrado', 404)
  const [enriched] = await enrichHabits(c.env.DB, [habit])
  return ok(c, enriched)
})

habits.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')
  const current = await getHabitById(c.env.DB, id)
  if (!current) return fail(c, 'Hábito no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')
  const habit = normalizeHabit(body, current)
  const error = validateHabit(habit)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE habits
     SET name = ?, description = ?, emoji = ?, color = ?, sort_index = ?, target_per_day = ?,
         is_active = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
     WHERE id = ?`,
    habit.name,
    habit.description,
    habit.emoji,
    habit.color,
    habit.sort_index,
    habit.target_per_day,
    habit.is_active,
    habit.start_date,
    habit.end_date,
    id,
  )

  if (body.days !== undefined) await replaceSchedule(c.env.DB, id, normalizeDays(body.days))
  if (body.links !== undefined) await replaceLinks(c.env.DB, id, normalizeLinks(body.links))
  const [updated] = await enrichHabits(c.env.DB, [await getHabitById(c.env.DB, id)])
  return ok(c, updated)
})

habits.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getHabitById(c.env.DB, id)
  if (!current) return fail(c, 'Hábito no encontrado', 404)

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM habit_links WHERE habit_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM habit_defer WHERE habit_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM habit_schedule WHERE habit_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM habit_events WHERE habit_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM habits WHERE id = ?').bind(id),
  ])
  return ok(c, { id })
})

habits.post('/:id/check', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')
  const habit = await getHabitById(c.env.DB, id)
  if (!habit || Number(habit.is_active) !== 1) return fail(c, 'Hábito no encontrado', 404)

  const body = (await readJson(c)) ?? {}
  const eventTime = normalizeDateTime(body.event_time ?? (body.date ? `${body.date} 12:00:00` : null))
  if (!eventTime) return fail(c, 'La fecha y hora deben tener formato YYYY-MM-DD HH:mm:ss')
  const date = eventTime.slice(0, 10)
  if (!isValidDate(date)) return fail(c, 'La fecha debe tener formato YYYY-MM-DD')

  const done = await countHabitEventsForDate(c.env.DB, id, date)
  const target = Number(habit.target_per_day)
  if (done >= target) {
    return ok(c, { met: true, done_today: done, target, event: null, deferred: false })
  }

  const meta = await run(
    c.env.DB,
    `INSERT INTO habit_events (habit_id, event_time, source, note)
     VALUES (?, ?, 'manual', ?)`,
    id,
    eventTime,
    cleanNullableText(body.note),
  )
  const doneToday = done + 1
  const met = doneToday >= target
  let deferred = false
  if (!met && body.auto_defer !== false) {
    await upsertDefer(c.env.DB, id, date)
    deferred = true
  }

  const event = await first(
    c.env.DB,
    `SELECT id, habit_id, event_time, source, note, created_at
     FROM habit_events
     WHERE id = ?`,
    meta.last_row_id,
  )
  return ok(c, { met, done_today: doneToday, target, event, deferred }, 201)
})

habits.post('/:id/defer', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')
  const habit = await getHabitById(c.env.DB, id)
  if (!habit || Number(habit.is_active) !== 1) return fail(c, 'Hábito no encontrado', 404)

  const body = (await readJson(c)) ?? {}
  const date = body.date ?? todayBogota()
  if (!isValidDate(date)) return fail(c, 'La fecha debe tener formato YYYY-MM-DD')
  const deferred = await upsertDefer(c.env.DB, id, date)
  return ok(c, deferred)
})

export default habits
