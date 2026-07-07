import { Hono } from 'hono'
import { all, booleanToInt, fail, first, isNonNegative, ok, readJson, run, toInteger, toNumber } from '../db.js'

const goals = new Hono()

function periodKey(row) {
  return Number(row.anio ?? 0) * 12 + Number(row.mes ?? 0)
}

async function readPlatformPositions(db) {
  const rows = await all(
    db,
    `SELECT
       p.id AS platform_id, p.nombre, p.color, p.orden, p.activa, p.tipo,
       s.anio, s.mes, s.saldo_inicial, s.aporte, s.retiros, s.saldo_final
     FROM platforms p
     LEFT JOIN snapshots s ON s.platform_id = p.id
     WHERE p.activa = 1
     ORDER BY p.orden ASC, p.id ASC, s.anio ASC, s.mes ASC`,
  )

  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.platform_id)) {
      grouped.set(row.platform_id, {
        platform_id: row.platform_id,
        nombre: row.nombre,
        color: row.color,
        orden: row.orden,
        activa: row.activa,
        tipo: row.tipo ?? 'inversion',
        snapshots: [],
      })
    }

    if (row.anio !== null && row.anio !== undefined && row.mes !== null && row.mes !== undefined) {
      grouped.get(row.platform_id).snapshots.push(row)
    }
  }

  return [...grouped.values()].map((platform) => {
    const sorted = [...platform.snapshots].sort((a, b) => periodKey(a) - periodKey(b))
    const closed = sorted.filter((row) => row.saldo_final !== null && row.saldo_final !== undefined)
    const lastClosed = closed[closed.length - 1] ?? null
    const pendingAfter = sorted.filter((row) => {
      const pending = row.saldo_final === null || row.saldo_final === undefined
      return pending && (!lastClosed || periodKey(row) > periodKey(lastClosed))
    })

    const base = lastClosed
      ? Number(lastClosed.saldo_final ?? 0)
      : Number(pendingAfter[0]?.saldo_inicial ?? 0)

    const en_transito = pendingAfter.reduce(
      (sum, row) => sum + Number(row.aporte ?? 0) - Number(row.retiros ?? 0),
      0,
    )

    return {
      platform_id: platform.platform_id,
      nombre: platform.nombre,
      color: platform.color,
      orden: platform.orden,
      activa: platform.activa,
      tipo: platform.tipo,
      ultimo_cierre_anio: lastClosed?.anio ?? null,
      ultimo_cierre_mes: lastClosed?.mes ?? null,
      base,
      en_transito,
      posicion: base + en_transito,
    }
  })
}

function computeGoal(goal, allocations, positionsById) {
  const monto_objetivo = Number(goal.monto_objetivo ?? 0)
  const enrichedAllocations = allocations.map((allocation) => {
    const platform = positionsById.get(allocation.platform_id)
    const objetivo_fuente = allocation.monto_asignado === null || allocation.monto_asignado === undefined
      ? monto_objetivo * (Number(allocation.porcentaje ?? 0) / 100)
      : Number(allocation.monto_asignado)
    const porcentaje = monto_objetivo > 0 ? (objetivo_fuente / monto_objetivo) * 100 : 0
    const posicion_plataforma = Number(platform?.posicion ?? 0)
    const disponible = Math.min(posicion_plataforma, objetivo_fuente)

    return {
      platform_id: allocation.platform_id,
      porcentaje,
      monto_asignado: objetivo_fuente,
      objetivo_fuente,
      posicion_plataforma,
      disponible,
      faltante_fuente: Math.max(objetivo_fuente - disponible, 0),
      plataforma_nombre: platform?.nombre ?? 'Plataforma eliminada',
      plataforma_color: platform?.color ?? '#64748b',
      plataforma_tipo: platform?.tipo ?? 'inversion',
    }
  })

  const monto_actual = enrichedAllocations.reduce((sum, allocation) => sum + allocation.disponible, 0)
  const monto_asignado = enrichedAllocations.reduce((sum, allocation) => sum + allocation.objetivo_fuente, 0)
  const porcentaje_asignado = monto_objetivo > 0 ? (monto_asignado / monto_objetivo) * 100 : 0
  const monto_sin_asignar = Math.max(monto_objetivo - monto_asignado, 0)

  return {
    ...goal,
    monto_objetivo,
    activa: Number(goal.activa ?? 1),
    allocations: enrichedAllocations,
    monto_asignado,
    porcentaje_asignado,
    monto_actual,
    monto_faltante: Math.max(monto_objetivo - monto_actual, 0),
    monto_sin_asignar,
    progreso: monto_objetivo > 0 ? Math.min(monto_actual / monto_objetivo, 1) : null,
  }
}

async function readGoals(db, id = null) {
  const [goalRows, allocationRows, positions] = await Promise.all([
    all(
      db,
      `SELECT id, nombre, monto_objetivo, activa, created_at
       FROM goals
       ${id === null ? '' : 'WHERE id = ?'}
       ORDER BY activa DESC, created_at DESC, id DESC`,
      ...(id === null ? [] : [id]),
    ),
    all(
      db,
      `SELECT ga.id, ga.goal_id, ga.platform_id, ga.porcentaje, ga.monto_asignado
       FROM goal_allocations ga
       ${id === null ? '' : 'WHERE ga.goal_id = ?'}
       ORDER BY ga.id ASC`,
      ...(id === null ? [] : [id]),
    ),
    readPlatformPositions(db),
  ])

  const positionsById = new Map(positions.map((platform) => [platform.platform_id, platform]))
  const allocationsByGoal = new Map()
  for (const allocation of allocationRows) {
    if (!allocationsByGoal.has(allocation.goal_id)) allocationsByGoal.set(allocation.goal_id, [])
    allocationsByGoal.get(allocation.goal_id).push(allocation)
  }

  return {
    goals: goalRows.map((goal) => computeGoal(goal, allocationsByGoal.get(goal.id) ?? [], positionsById)),
    platforms: positions,
  }
}

function normalizeGoal(body, current = {}) {
  return {
    nombre: body.nombre === undefined ? current.nombre : String(body.nombre).trim(),
    monto_objetivo: body.monto_objetivo === undefined ? current.monto_objetivo : toNumber(body.monto_objetivo),
    activa: body.activa === undefined ? current.activa ?? 1 : booleanToInt(body.activa, current.activa ?? 1),
    allocations: Array.isArray(body.allocations) ? body.allocations : [],
  }
}

async function validateGoal(db, goal) {
  if (!goal.nombre) return 'El nombre de la meta es obligatorio'
  if (!isNonNegative(goal.monto_objetivo) || goal.monto_objetivo <= 0) return 'El monto objetivo debe ser mayor a 0'

  const seen = new Set()
  let total = 0
  for (const input of goal.allocations) {
    const platform_id = toInteger(input?.platform_id)
    const monto_asignado = input?.monto_asignado === undefined
      ? toNumber(input?.porcentaje) * goal.monto_objetivo / 100
      : toNumber(input?.monto_asignado)

    if (!Number.isInteger(platform_id)) return 'Cada asignacion necesita una plataforma valida'
    if (!isNonNegative(monto_asignado) || monto_asignado <= 0) {
      return 'Cada asignacion necesita un monto mayor a 0'
    }
    if (seen.has(platform_id)) return 'No repitas una plataforma dentro de la misma meta'
    seen.add(platform_id)
    total += monto_asignado
  }

  if (total > goal.monto_objetivo + 0.000001) return 'La suma asignada no puede superar el monto objetivo'

  if (seen.size) {
    const placeholders = [...seen].map(() => '?').join(', ')
    const rows = await all(db, `SELECT id FROM platforms WHERE activa = 1 AND id IN (${placeholders})`, ...seen)
    if (rows.length !== seen.size) return 'Una de las plataformas no existe o esta inactiva'
  }

  return null
}

async function replaceAllocations(db, goalId, montoObjetivo, allocations) {
  await run(db, 'DELETE FROM goal_allocations WHERE goal_id = ?', goalId)

  for (const allocation of allocations) {
    const montoAsignado = allocation.monto_asignado === undefined
      ? toNumber(allocation.porcentaje) * montoObjetivo / 100
      : toNumber(allocation.monto_asignado)
    const porcentaje = montoObjetivo > 0 ? (montoAsignado / montoObjetivo) * 100 : 0

    await run(
      db,
      `INSERT INTO goal_allocations (goal_id, platform_id, porcentaje, monto_asignado)
       VALUES (?, ?, ?, ?)`,
      goalId,
      toInteger(allocation.platform_id),
      porcentaje,
      montoAsignado,
    )
  }
}

goals.get('/', async (c) => {
  return ok(c, await readGoals(c.env.DB))
})

goals.get('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const data = await readGoals(c.env.DB, id)
  if (!data.goals.length) return fail(c, 'Meta no encontrada', 404)
  return ok(c, { goal: data.goals[0], platforms: data.platforms })
})

goals.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const goal = normalizeGoal(body)
  const error = await validateGoal(c.env.DB, goal)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO goals (nombre, monto_objetivo, activa)
     VALUES (?, ?, ?)`,
    goal.nombre,
    goal.monto_objetivo,
    goal.activa,
  )

  await replaceAllocations(c.env.DB, meta.last_row_id, goal.monto_objetivo, goal.allocations)
  const data = await readGoals(c.env.DB, meta.last_row_id)
  return ok(c, data.goals[0], 201)
})

goals.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await first(c.env.DB, 'SELECT * FROM goals WHERE id = ?', id)
  if (!current) return fail(c, 'Meta no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const goal = normalizeGoal(body, current)
  const error = await validateGoal(c.env.DB, goal)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE goals
     SET nombre = ?, monto_objetivo = ?, activa = ?
     WHERE id = ?`,
    goal.nombre,
    goal.monto_objetivo,
    goal.activa,
    id,
  )

  await replaceAllocations(c.env.DB, id, goal.monto_objetivo, goal.allocations)
  const data = await readGoals(c.env.DB, id)
  return ok(c, data.goals[0])
})

goals.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  await run(c.env.DB, 'DELETE FROM goal_allocations WHERE goal_id = ?', id)
  const meta = await run(c.env.DB, 'DELETE FROM goals WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Meta no encontrada', 404)
  return ok(c, { id })
})

export default goals
