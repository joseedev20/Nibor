import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dumpPath = resolve(root, 'habitos old', 'if0_40034937_habits_app.sql')
const tempPathRelative = join('data', '.tmp_import_habits_old.sql')
const tempPath = resolve(root, tempPathRelative)
const databaseName = 'nibor-finanzas'
const isRemote = process.argv.includes('--remote')
const dryRun = process.argv.includes('--dry-run')

const HABIT_NORMALIZATION = new Map([
  [14, { name: 'Inglés', emoji: '', behavior: 'language_practice', module: 'knowledge', targetLabel: 'Inglés' }],
  [15, { name: 'Ejercicio', emoji: '', behavior: 'exercise_done', module: 'salud', targetLabel: 'Ejercicio' }],
  [16, { name: 'Leer', emoji: '', behavior: 'reading_done', module: 'knowledge', targetLabel: 'Lectura' }],
  [20, { name: 'Cepillarse', emoji: '', behavior: 'hygiene_done', module: 'salud', targetLabel: 'Cepillarse' }],
  [35, { name: 'Losartán 50 mg', emoji: '', behavior: 'medication_taken', module: 'salud', targetLabel: 'Losartán 50 mg' }],
])

function extractInsertBlock(sql, table) {
  const pattern = new RegExp(`INSERT INTO \`${table}\`[\\s\\S]*? VALUES\\s*([\\s\\S]*?);`, 'm')
  const match = sql.match(pattern)
  return match?.[1] ?? ''
}

function splitRows(valuesBlock) {
  const rows = []
  let inString = false
  let escaped = false
  let depth = 0
  let start = -1

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === "'") {
      inString = true
      continue
    }

    if (char === '(') {
      if (depth === 0) start = index + 1
      depth += 1
      continue
    }

    if (char === ')') {
      depth -= 1
      if (depth === 0 && start >= 0) rows.push(valuesBlock.slice(start, index))
    }
  }

  return rows
}

function splitFields(row) {
  const fields = []
  let inString = false
  let escaped = false
  let start = 0

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === "'") {
        inString = false
      }
      continue
    }

    if (char === "'") {
      inString = true
      continue
    }

    if (char === ',') {
      fields.push(row.slice(start, index).trim())
      start = index + 1
    }
  }

  fields.push(row.slice(start).trim())
  return fields
}

function parseValue(value) {
  if (value === 'NULL') return null
  if (value.startsWith("'") && value.endsWith("'")) {
    return value
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

function parseTable(sql, table) {
  return splitRows(extractInsertBlock(sql, table)).map((row) => splitFields(row).map(parseValue))
}

function q(value) {
  if (value === null || value === undefined || value === '') return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function boolInt(value) {
  return Number(value) ? 1 : 0
}

function combinedOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n')
}

function outputMetric(output, metric) {
  const pattern = new RegExp(`"metric"\\s*:\\s*"${metric}"[\\s\\S]*?"total"\\s*:\\s*(\\d+)`)
  return Number(output.match(pattern)?.[1] ?? 0)
}

function buildInsertSql({ userId, habits, schedules, events }) {
  const habitIds = new Set(habits.map((habit) => Number(habit[0])))
  const scheduleRows = schedules.filter((row) => habitIds.has(Number(row[0])))
  const eventRows = events.filter((row) => habitIds.has(Number(row[1])))

  const lines = [
    'BEGIN TRANSACTION;',
  ]

  for (const row of habits) {
    const oldId = Number(row[0])
    const normalized = HABIT_NORMALIZATION.get(oldId) ?? {}
    const originalName = String(row[2] ?? '')
    const name = normalized.name ?? originalName
    const description = oldId === 35 ? 'Migrado desde el hábito viejo Pills y vinculado a Losartán 50 mg.' : null
    const emoji = normalized.emoji ?? row[4]
    const color = row[5] || '#10b981'
    lines.push(
      `INSERT INTO habits (old_id, name, description, emoji, color, sort_index, target_per_day, is_active, start_date, end_date, created_at, updated_at) VALUES (${oldId}, ${q(name)}, ${q(description)}, ${q(emoji)}, ${q(color)}, ${Number(row[6] ?? 0)}, ${Number(row[7] ?? 1)}, ${boolInt(row[8])}, ${q(row[9])}, ${q(row[10])}, ${q(row[11])}, ${q(row[12])}) ON CONFLICT(old_id) DO UPDATE SET name = excluded.name, description = excluded.description, emoji = excluded.emoji, color = excluded.color, sort_index = excluded.sort_index, target_per_day = excluded.target_per_day, is_active = excluded.is_active, start_date = excluded.start_date, end_date = excluded.end_date, updated_at = excluded.updated_at;`,
    )
  }

  for (const row of scheduleRows) {
    lines.push(
      `INSERT OR IGNORE INTO habit_schedule (habit_id, day_of_week) SELECT id, ${Number(row[1])} FROM habits WHERE old_id = ${Number(row[0])};`,
    )
  }

  for (const row of eventRows) {
    lines.push(
      `INSERT OR IGNORE INTO habit_events (old_event_id, habit_id, event_time, source, note, created_at) SELECT ${Number(row[0])}, h.id, ${q(row[2])}, 'import', ${q(row[4])}, datetime('now') FROM habits h WHERE h.old_id = ${Number(row[1])};`,
    )
  }

  for (const [oldId, link] of HABIT_NORMALIZATION.entries()) {
    if (!habitIds.has(oldId)) continue
    const targetIdSql = link.behavior === 'medication_taken'
      ? "(SELECT id FROM health_medications WHERE lower(nombre) = lower('Losartán') ORDER BY id LIMIT 1)"
      : 'NULL'
    lines.push(
      `INSERT OR IGNORE INTO habit_links (habit_id, module, behavior, target_id, target_label) SELECT h.id, ${q(link.module)}, ${q(link.behavior)}, ${targetIdSql}, ${q(link.targetLabel)} FROM habits h WHERE h.old_id = ${oldId};`,
    )
    lines.push(
      `UPDATE habit_links SET target_id = ${targetIdSql}, target_label = ${q(link.targetLabel)}, updated_at = datetime('now') WHERE habit_id = (SELECT id FROM habits WHERE old_id = ${oldId}) AND module = ${q(link.module)} AND behavior = ${q(link.behavior)};`,
    )
  }

  lines.push(
    'COMMIT;',
    `SELECT 'imported_habits' AS metric, COUNT(*) AS total FROM habits WHERE old_id IN (${[...habitIds].join(',')});`,
    `SELECT 'imported_events' AS metric, COUNT(*) AS total FROM habit_events WHERE old_event_id IS NOT NULL AND habit_id IN (SELECT id FROM habits WHERE old_id IN (${[...habitIds].join(',')}));`,
    `SELECT 'nibor_user_id' AS metric, ${userId} AS total;`,
  )

  return { sql: lines.join('\n'), eventCount: eventRows.length, scheduleCount: scheduleRows.length }
}

if (!existsSync(dumpPath)) {
  console.error(`No existe el dump viejo: ${dumpPath}`)
  process.exit(1)
}

const sql = readFileSync(dumpPath, 'utf8')
const users = parseTable(sql, 'users')
const nibor = users.find((row) => String(row[1]).toLowerCase() === 'nibor')
if (!nibor) {
  console.error('No se encontró username = nibor en el dump viejo.')
  process.exit(1)
}

const userId = Number(nibor[0])
const allHabits = parseTable(sql, 'habits')
const niborHabits = allHabits.filter((row) => Number(row[1]) === userId && Number(row[8]) === 1)
const schedules = parseTable(sql, 'habit_schedule')
const events = parseTable(sql, 'habit_events')
const { sql: importSql, eventCount, scheduleCount } = buildInsertSql({
  userId,
  habits: niborHabits,
  schedules,
  events,
})

console.log(`Usuario detectado: nibor (${userId})`)
console.log(`Hábitos activos a importar: ${niborHabits.length}`)
console.log(`Eventos históricos a importar: ${eventCount}`)
console.log(`Días de agenda a importar: ${scheduleCount}`)

if (niborHabits.length !== 5) {
  console.error(`Se esperaban 5 hábitos activos de Nibor y se encontraron ${niborHabits.length}.`)
  process.exit(1)
}

if (eventCount !== 910) {
  console.error(`Se esperaban 910 eventos históricos de Nibor y se encontraron ${eventCount}.`)
  process.exit(1)
}

if (dryRun) {
  console.log('Dry run OK. No se escribió ni ejecutó SQL.')
  process.exit(0)
}

mkdirSync(dirname(tempPath), { recursive: true })
writeFileSync(tempPath, importSql, 'utf8')

try {
  const args = [
    'wrangler',
    'd1',
    'execute',
    databaseName,
    isRemote ? '--remote' : '--local',
    '--file',
    tempPathRelative,
  ]
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx ${args.join(' ')}`], {
      cwd: root,
      encoding: 'utf8',
    })
    : spawnSync('npx', args, {
      cwd: root,
      encoding: 'utf8',
    })

  if (result.error) throw result.error
  if (result.status !== 0) {
    console.error(combinedOutput(result))
    process.exitCode = result.status ?? 1
  } else {
    const output = combinedOutput(result)
    console.log(`Confirmado en D1: ${outputMetric(output, 'imported_habits')} hábitos importados.`)
    console.log(`Confirmado en D1: ${outputMetric(output, 'imported_events')} eventos importados.`)
    console.log(`Importación completada en D1 ${isRemote ? 'remoto' : 'local'}.`)
  }
} finally {
  rmSync(tempPath, { force: true })
}
