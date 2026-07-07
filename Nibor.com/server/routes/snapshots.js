import { Hono } from 'hono'
import {
  all,
  computeSnapshot,
  fail,
  first,
  getPeriodFromSearch,
  isNonNegative,
  isUniqueError,
  ok,
  readJson,
  run,
  toInteger,
  toNullableNumber,
  toNumber,
} from '../db.js'

const snapshots = new Hono()

function previousPeriod(anio, mes) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

async function getPreviousFinal(db, platformId, anio, mes) {
  const previous = previousPeriod(anio, mes)
  const row = await first(
    db,
    `SELECT saldo_final
     FROM snapshots
     WHERE platform_id = ? AND anio = ? AND mes = ? AND saldo_final IS NOT NULL`,
    platformId,
    previous.anio,
    previous.mes,
  )

  return row ? Number(row.saldo_final) : 0
}

async function getSnapshotById(db, id) {
  const row = await first(
    db,
    `SELECT id, platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final, notas
     FROM snapshots
     WHERE id = ?`,
    id,
  )
  return row ? computeSnapshot(row) : null
}

function validateAmounts({ saldo_inicial, aporte, retiros, saldo_final }) {
  if (!isNonNegative(saldo_inicial)) return 'El saldo inicial debe ser mayor o igual a 0'
  if (!isNonNegative(aporte)) return 'El aporte debe ser mayor o igual a 0'
  if (!isNonNegative(retiros)) return 'Los retiros deben ser mayores o iguales a 0'
  if (saldo_final !== null && !isNonNegative(saldo_final)) return 'El saldo final debe ser mayor o igual a 0 o null'
  return null
}

function summarizeRows(rows) {
  const existing = rows.filter((row) => row.exists !== false)
  const completed = rows.filter((row) => row.exists !== false && !row.pendiente && row.saldo_final !== null)
  const partial = completed.length ? completed : existing.filter((row) => row.saldo_inicial !== null || row.saldo_total_inicial !== null)
  const hasCompleted = completed.length > 0
  const rowsForMovementTotals = completed.length ? completed : partial
  const saldo_total_inicial = completed.reduce((sum, row) => sum + Number(row.saldo_total_inicial ?? 0), 0)
  const ganancia = completed.reduce((sum, row) => sum + Number(row.ganancia ?? 0), 0)
  // Último con capital calculado (incluye pendientes) y último mes cerrado
  const capitalUltimo = [...existing].reverse().find((row) => row.capital_invertido !== null && row.capital_invertido !== undefined) ?? null
  const capitalCerrado = completed.length ? completed[completed.length - 1] : null

  return {
    // El total del año usa lo que ya existe: arranque del primer mes
    // registrado y saldo del último, sin esperar a diciembre
    saldo_inicial: partial.length ? Number(partial[0].saldo_inicial ?? 0) : null,
    saldo_final: hasCompleted ? Number(completed[completed.length - 1].saldo_final ?? 0) : null,
    aporte: rowsForMovementTotals.reduce((sum, row) => sum + Number(row.aporte ?? 0), 0),
    retiros: rowsForMovementTotals.reduce((sum, row) => sum + Number(row.retiros ?? 0), 0),
    saldo_total_inicial: hasCompleted
      ? saldo_total_inicial
      : partial.reduce((sum, row) => sum + Number(row.saldo_total_inicial ?? row.saldo_inicial ?? 0), 0),
    ganancia: hasCompleted ? ganancia : null,
    rentabilidad: saldo_total_inicial > 0 ? ganancia / saldo_total_inicial : null,
    capital_invertido: capitalUltimo?.capital_invertido ?? null,
    ganancia_acumulada: capitalCerrado?.ganancia_acumulada ?? null,
    rentabilidad_capital: capitalCerrado && capitalCerrado.capital_invertido > 0 && capitalCerrado.ganancia_acumulada !== null
      ? capitalCerrado.ganancia_acumulada / capitalCerrado.capital_invertido
      : null,
  }
}

// Capital realmente invertido: base = saldo_inicial del primer mes registrado,
// luego solo acumula aportes y resta retiros (las ganancias/pérdidas NO entran).
// ganancia_acumulada = saldo_final − capital_invertido (cuánto ha producido la plata).
function withInvestedCapital(snapshotRows) {
  let capital = null
  return snapshotRows.map((row) => {
    if (row.exists === false) {
      return { ...row, capital_invertido: capital, ganancia_acumulada: null }
    }
    capital = (capital === null ? Number(row.saldo_inicial ?? 0) : capital)
      + Number(row.aporte ?? 0) - Number(row.retiros ?? 0)
    const cerrado = row.saldo_final !== null && row.saldo_final !== undefined
    return {
      ...row,
      capital_invertido: capital,
      ganancia_acumulada: cerrado ? Number(row.saldo_final) - capital : null,
    }
  })
}

function consolidateMonth(rows, anio, mes) {
  const existing = rows.filter((row) => row.exists !== false)
  const completed = rows.filter((row) => row.exists !== false && !row.pendiente && row.saldo_final !== null)
  const allCompleted = existing.length > 0 && completed.length === existing.length
  const rowsForDisplay = allCompleted ? completed : existing
  const saldo_inicial = rowsForDisplay.reduce((sum, row) => sum + Number(row.saldo_inicial ?? 0), 0)
  const aporte = rowsForDisplay.reduce((sum, row) => sum + Number(row.aporte ?? 0), 0)
  const retiros = rowsForDisplay.reduce((sum, row) => sum + Number(row.retiros ?? 0), 0)
  const saldo_final = completed.reduce((sum, row) => sum + Number(row.saldo_final ?? 0), 0)
  const saldo_total_inicial = rowsForDisplay.reduce((sum, row) => sum + Number(row.saldo_total_inicial ?? row.saldo_inicial ?? 0), 0)
  const ganancia = completed.reduce((sum, row) => sum + Number(row.ganancia ?? 0), 0)
  const capitalRows = rowsForDisplay.filter((row) => row.capital_invertido !== null && row.capital_invertido !== undefined)
  const capital_invertido = capitalRows.length ? capitalRows.reduce((sum, row) => sum + row.capital_invertido, 0) : null
  const gananciaAcumRows = completed.filter((row) => row.ganancia_acumulada !== null && row.ganancia_acumulada !== undefined)

  return {
    id: null,
    platform_id: null,
    anio,
    mes,
    saldo_inicial: rowsForDisplay.length ? saldo_inicial : null,
    aporte,
    retiros,
    saldo_final: allCompleted ? saldo_final : null,
    saldo_total_inicial: rowsForDisplay.length ? saldo_total_inicial : null,
    ganancia: allCompleted ? ganancia : null,
    rentabilidad: allCompleted && saldo_total_inicial > 0 ? ganancia / saldo_total_inicial : null,
    capital_invertido,
    ganancia_acumulada: allCompleted && gananciaAcumRows.length ? gananciaAcumRows.reduce((sum, row) => sum + row.ganancia_acumulada, 0) : null,
    pendiente: !allCompleted,
    exists: existing.length > 0,
  }
}

function buildConsolidatedGroup(platforms, anio, id, nombre, color, tipo, filterPlatform) {
  const snapshots = Array.from({ length: 12 }, (_, index) => {
    const mes = index + 1
    const monthRows = platforms
      .filter(filterPlatform)
      .flatMap((platform) => platform.snapshots.filter((snapshot) => snapshot.mes === mes))
    return consolidateMonth(monthRows, anio, mes)
  })

  return {
    id,
    nombre,
    color,
    tipo,
    snapshots,
    total: summarizeRows(snapshots),
  }
}

snapshots.get('/', async (c) => {
  const period = getPeriodFromSearch(c)
  if (period.error) return fail(c, period.error)

  const anio = period.anio
  const platforms = await all(
    c.env.DB,
    `SELECT id, nombre, color, orden, activa, tipo
     FROM platforms
     ORDER BY orden ASC, nombre ASC`,
  )

  const rows = await all(
    c.env.DB,
    `SELECT id, platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final, notas
     FROM snapshots
     WHERE anio = ?
     ORDER BY platform_id ASC, mes ASC`,
    anio,
  )

  const byPlatformMonth = new Map()
  for (const row of rows) {
    byPlatformMonth.set(`${row.platform_id}:${row.mes}`, computeSnapshot(row))
  }

  const data = platforms.map((platform) => {
    const platformSnapshots = Array.from({ length: 12 }, (_, index) => {
      const mes = index + 1
      return byPlatformMonth.get(`${platform.id}:${mes}`) ?? {
        id: null,
        platform_id: platform.id,
        anio,
        mes,
        saldo_inicial: null,
        aporte: 0,
        retiros: 0,
        saldo_final: null,
        saldo_total_inicial: null,
        ganancia: null,
        rentabilidad: null,
        pendiente: true,
        exists: false,
      }
    })

    const enriched = withInvestedCapital(platformSnapshots)
    return {
      ...platform,
      snapshots: enriched,
      total: summarizeRows(enriched),
    }
  })

  const consolidatedSnapshots = Array.from({ length: 12 }, (_, index) => {
    const mes = index + 1
    const monthRows = data.flatMap((platform) => platform.snapshots.filter((snapshot) => snapshot.mes === mes))
    return consolidateMonth(monthRows, anio, mes)
  })

  const consolidated_by_tipo = {
    inversion: buildConsolidatedGroup(
      data,
      anio,
      'all-investments',
      'Inversiones',
      '#059669',
      'inversion',
      (platform) => platform.tipo !== 'fondo',
    ),
    fondo: buildConsolidatedGroup(
      data,
      anio,
      'all-funds',
      'Fondos de ahorro',
      '#0891B2',
      'fondo',
      (platform) => platform.tipo === 'fondo',
    ),
  }

  return ok(c, {
    anio,
    platforms: data,
    consolidated_by_tipo,
    consolidated: {
      id: 'all',
      nombre: 'Todas',
      color: '#059669',
      snapshots: consolidatedSnapshots,
      total: summarizeRows(consolidatedSnapshots),
    },
  })
})

// Aporte o retiro a mitad de mes: acumula sobre el snapshot pendiente del mes
// (lo crea si no existe). Distinto del cierre: no toca saldo_final.
snapshots.post('/movement', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const platform_id = toInteger(body.platform_id)
  const anio = toInteger(body.anio)
  const mes = toInteger(body.mes)
  const tipo = String(body.tipo ?? '').trim()
  const monto = toNumber(body.monto)

  if (!Number.isInteger(platform_id)) return fail(c, 'La plataforma es obligatoria')
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return fail(c, 'El año debe ser válido')
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return fail(c, 'El mes debe estar entre 1 y 12')
  if (tipo !== 'aporte' && tipo !== 'retiro') return fail(c, 'El tipo debe ser aporte o retiro')
  if (!isNonNegative(monto) || monto <= 0) return fail(c, 'El monto debe ser mayor a 0')

  const motivo = String(body.motivo ?? '').trim()
  if (tipo === 'retiro' && !motivo) return fail(c, 'El motivo del retiro es obligatorio')
  if (motivo.length > 300) return fail(c, 'El motivo no puede superar 300 caracteres')

  const platform = await first(c.env.DB, 'SELECT id, nombre FROM platforms WHERE id = ?', platform_id)
  if (!platform) return fail(c, 'Plataforma no encontrada', 404)

  const existing = await first(
    c.env.DB,
    'SELECT * FROM snapshots WHERE platform_id = ? AND anio = ? AND mes = ?',
    platform_id,
    anio,
    mes,
  )

  if (existing && existing.saldo_final !== null) {
    return fail(c, 'Ese mes ya está cerrado; edítalo desde Inversiones para ajustar sus aportes o retiros', 409)
  }

  // Bitácora del movimiento (los retiros siempre llevan motivo)
  const hoy = new Date().toISOString().slice(0, 10)
  const nota = motivo ? `[${hoy}] ${tipo === 'retiro' ? 'Retiro' : 'Aporte'} $${monto}: ${motivo}` : null

  let id
  if (existing) {
    const column = tipo === 'aporte' ? 'aporte' : 'retiros'
    await run(
      c.env.DB,
      `UPDATE snapshots
       SET ${column} = ${column} + ?,
           notas = CASE WHEN ? IS NULL THEN notas ELSE COALESCE(notas || char(10), '') || ? END
       WHERE id = ?`,
      monto,
      nota,
      nota,
      existing.id,
    )
    id = existing.id
  } else {
    const saldo_inicial = await getPreviousFinal(c.env.DB, platform_id, anio, mes)
    const meta = await run(
      c.env.DB,
      `INSERT INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final, notas)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      platform_id,
      anio,
      mes,
      saldo_inicial,
      tipo === 'aporte' ? monto : 0,
      tipo === 'retiro' ? monto : 0,
      nota,
    )
    id = meta.last_row_id
  }

  return ok(c, await getSnapshotById(c.env.DB, id), existing ? 200 : 201)
})

snapshots.post('/', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const platform_id = toInteger(body.platform_id)
  const anio = toInteger(body.anio)
  const mes = toInteger(body.mes)
  const aporte = toNumber(body.aporte, 0)
  const retiros = toNumber(body.retiros, 0)
  const saldo_final = toNullableNumber(body.saldo_final)

  if (!Number.isInteger(platform_id)) return fail(c, 'La plataforma es obligatoria')
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return fail(c, 'El año debe ser válido')
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return fail(c, 'El mes debe estar entre 1 y 12')

  const platform = await first(c.env.DB, 'SELECT id FROM platforms WHERE id = ?', platform_id)
  if (!platform) return fail(c, 'Plataforma no encontrada', 404)

  const existing = await first(
    c.env.DB,
    'SELECT id FROM snapshots WHERE platform_id = ? AND anio = ? AND mes = ?',
    platform_id,
    anio,
    mes,
  )
  if (existing) return fail(c, 'Ya existe un snapshot para esa plataforma y mes', 409)

  const saldo_inicial = body.saldo_inicial === undefined || body.saldo_inicial === null || body.saldo_inicial === ''
    ? await getPreviousFinal(c.env.DB, platform_id, anio, mes)
    : toNumber(body.saldo_inicial, 0)

  const amountError = validateAmounts({ saldo_inicial, aporte, retiros, saldo_final })
  if (amountError) return fail(c, amountError)

  try {
    const meta = await run(
      c.env.DB,
      `INSERT INTO snapshots (platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      platform_id,
      anio,
      mes,
      saldo_inicial,
      aporte,
      retiros,
      saldo_final,
    )
    return ok(c, await getSnapshotById(c.env.DB, meta.last_row_id), 201)
  } catch (error) {
    if (isUniqueError(error)) return fail(c, 'Ya existe un snapshot para esa plataforma y mes', 409)
    throw error
  }
})

snapshots.put('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const current = await first(c.env.DB, 'SELECT * FROM snapshots WHERE id = ?', id)
  if (!current) return fail(c, 'Snapshot no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON inválido')

  const platform_id = body.platform_id === undefined ? current.platform_id : toInteger(body.platform_id)
  const anio = body.anio === undefined ? current.anio : toInteger(body.anio)
  const mes = body.mes === undefined ? current.mes : toInteger(body.mes)
  const saldo_inicial = body.saldo_inicial === undefined ? current.saldo_inicial : toNumber(body.saldo_inicial, 0)
  const aporte = body.aporte === undefined ? current.aporte : toNumber(body.aporte, 0)
  const retiros = body.retiros === undefined ? current.retiros : toNumber(body.retiros, 0)
  const saldo_final = body.saldo_final === undefined ? current.saldo_final : toNullableNumber(body.saldo_final)

  if (!Number.isInteger(platform_id)) return fail(c, 'La plataforma es obligatoria')
  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return fail(c, 'El año debe ser válido')
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return fail(c, 'El mes debe estar entre 1 y 12')

  const amountError = validateAmounts({ saldo_inicial, aporte, retiros, saldo_final })
  if (amountError) return fail(c, amountError)

  try {
    await run(
      c.env.DB,
      `UPDATE snapshots
       SET platform_id = ?, anio = ?, mes = ?, saldo_inicial = ?, aporte = ?, retiros = ?, saldo_final = ?
       WHERE id = ?`,
      platform_id,
      anio,
      mes,
      saldo_inicial,
      aporte,
      retiros,
      saldo_final,
      id,
    )
  } catch (error) {
    if (isUniqueError(error)) return fail(c, 'Ya existe un snapshot para esa plataforma y mes', 409)
    throw error
  }

  return ok(c, await getSnapshotById(c.env.DB, id))
})

snapshots.delete('/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID inválido')

  const meta = await run(c.env.DB, 'DELETE FROM snapshots WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Snapshot no encontrado', 404)
  return ok(c, { id })
})

export default snapshots
