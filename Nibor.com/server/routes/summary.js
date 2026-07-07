import { Hono } from 'hono'
import { all, computeSnapshot, fail, first, getMonthBounds, ok, toInteger } from '../db.js'

const summary = new Hono()

function parseSummaryPeriod(c) {
  const now = new Date()
  const anio = toInteger(c.req.query('anio'), now.getFullYear())
  const mes = toInteger(c.req.query('mes'), now.getMonth() + 1)

  if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) return { error: 'El año debe ser válido' }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { error: 'El mes debe estar entre 1 y 12' }

  return { anio, mes }
}

function previousPeriod(anio, mes) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

async function snapshotRows(db, anio) {
  const rows = await all(
    db,
    `SELECT
       s.id, s.platform_id, s.anio, s.mes, s.saldo_inicial, s.aporte, s.retiros, s.saldo_final,
       p.nombre AS plataforma_nombre, p.color AS plataforma_color, p.orden AS plataforma_orden,
       p.tipo AS plataforma_tipo
     FROM snapshots s
     JOIN platforms p ON p.id = s.platform_id
     WHERE s.anio = ?
     ORDER BY s.mes ASC, p.orden ASC`,
    anio,
  )

  return rows.map(computeSnapshot)
}

function summarizeSnapshots(rows, mes) {
  const completed = rows.filter((row) => row.mes === mes && !row.pendiente)
  const patrimonio_total = completed.reduce((sum, row) => sum + Number(row.saldo_final ?? 0), 0)
  const ganancia_mes = completed.reduce((sum, row) => sum + Number(row.ganancia ?? 0), 0)
  const saldo_total_inicial = completed.reduce((sum, row) => sum + Number(row.saldo_total_inicial ?? 0), 0)

  return {
    patrimonio_total,
    ganancia_mes,
    rentabilidad_mes: saldo_total_inicial > 0 ? ganancia_mes / saldo_total_inicial : null,
    plataformas: completed.map((row) => ({
      platform_id: row.platform_id,
      nombre: row.plataforma_nombre,
      color: row.plataforma_color,
      tipo: row.plataforma_tipo,
      saldo_final: row.saldo_final,
      ganancia: row.ganancia,
      rentabilidad: row.rentabilidad,
    })),
  }
}

function buildSeries(rows) {
  return Array.from({ length: 12 }, (_, index) => {
    const mes = index + 1
    const completed = rows.filter((row) => row.mes === mes && !row.pendiente)
    const plataformas = completed.map((row) => ({
      platform_id: row.platform_id,
      nombre: row.plataforma_nombre,
      color: row.plataforma_color,
      saldo_final: row.saldo_final,
      ganancia: row.ganancia,
    }))

    return {
      mes,
      patrimonio_total: completed.reduce((sum, row) => sum + Number(row.saldo_final ?? 0), 0),
      ganancia: completed.reduce((sum, row) => sum + Number(row.ganancia ?? 0), 0),
      plataformas,
    }
  })
}

async function movementTotals(db, anio, mes) {
  const { start, end } = getMonthBounds(anio, mes)
  const totals = await first(
    db,
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS total_ingresos,
       COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) AS total_gastos
     FROM movements
     WHERE fecha BETWEEN ? AND ?`,
    start,
    end,
  )

  const categorias = await all(
    db,
    `SELECT
       c.id AS categoria_id,
       COALESCE(c.nombre, 'Sin categoría') AS nombre,
       c.icono,
       c.color,
       SUM(m.monto) AS total
     FROM movements m
     LEFT JOIN categories c ON c.id = m.categoria_id
     WHERE m.tipo = 'gasto' AND m.fecha BETWEEN ? AND ?
     GROUP BY c.id, c.nombre, c.icono, c.color
     ORDER BY total DESC`,
    start,
    end,
  )

  const total_ingresos = Number(totals?.total_ingresos ?? 0)
  const total_gastos = Number(totals?.total_gastos ?? 0)
  const balance = total_ingresos - total_gastos

  return {
    total_ingresos,
    total_gastos,
    balance,
    tasa_ahorro: total_ingresos > 0 ? balance / total_ingresos : null,
    gastos_por_categoria: categorias.map((category) => ({
      ...category,
      total: Number(category.total ?? 0),
      porcentaje: total_gastos > 0 ? Number(category.total ?? 0) / total_gastos : null,
    })),
  }
}

// Posición actual del año: último cierre por plataforma + aportes/retiros de
// meses pendientes posteriores. Es "lo que el usuario tiene hoy" aunque el mes
// en curso no esté cerrado (coincide con el TOTAL INVERSIONES de su Excel).
function buildCurrentPosition(rows) {
  const byPlatform = new Map()
  for (const row of rows) {
    if (!byPlatform.has(row.platform_id)) byPlatform.set(row.platform_id, [])
    byPlatform.get(row.platform_id).push(row)
  }

  const plataformas = []
  for (const platformRows of byPlatform.values()) {
    const sorted = [...platformRows].sort((a, b) => a.mes - b.mes)
    const closed = sorted.filter((row) => !row.pendiente)
    const lastClosed = closed[closed.length - 1] ?? null
    const pendingAfter = sorted.filter((row) => row.pendiente && (!lastClosed || row.mes > lastClosed.mes))

    let base
    if (lastClosed) {
      base = Number(lastClosed.saldo_final ?? 0)
    } else {
      base = pendingAfter.length ? Number(pendingAfter[0].saldo_inicial ?? 0) : 0
    }

    const en_transito = pendingAfter.reduce(
      (sum, row) => sum + Number(row.aporte ?? 0) - Number(row.retiros ?? 0),
      0,
    )

    const sample = sorted[0]
    plataformas.push({
      platform_id: sample.platform_id,
      nombre: sample.plataforma_nombre,
      color: sample.plataforma_color,
      tipo: sample.plataforma_tipo,
      orden: sample.plataforma_orden,
      ultimo_cierre_mes: lastClosed?.mes ?? null,
      base,
      en_transito,
      posicion: base + en_transito,
    })
  }

  plataformas.sort((a, b) => a.orden - b.orden)

  return {
    total: plataformas.reduce((sum, p) => sum + p.posicion, 0),
    en_transito: plataformas.reduce((sum, p) => sum + p.en_transito, 0),
    total_inversion: plataformas.filter((p) => p.tipo !== 'fondo').reduce((sum, p) => sum + p.posicion, 0),
    total_fondo: plataformas.filter((p) => p.tipo === 'fondo').reduce((sum, p) => sum + p.posicion, 0),
    plataformas,
  }
}

export async function buildSummaryData(db, anio, mes) {
  const [currentYearRows, previousYearRows, movimientos] = await Promise.all([
    snapshotRows(db, anio),
    mes === 1 ? snapshotRows(db, anio - 1) : Promise.resolve([]),
    movementTotals(db, anio, mes),
  ])

  const selected = summarizeSnapshots(currentYearRows, mes)
  const previous = previousPeriod(anio, mes)
  const previousRows = previous.anio === anio ? currentYearRows : previousYearRows
  const previousSummary = summarizeSnapshots(previousRows, previous.mes)
  const variacion_patrimonio = selected.patrimonio_total - previousSummary.patrimonio_total

  return {
    anio,
    mes,
    patrimonio_total: selected.patrimonio_total,
    variacion_patrimonio,
    variacion_patrimonio_pct: previousSummary.patrimonio_total > 0 ? variacion_patrimonio / previousSummary.patrimonio_total : null,
    ganancia_mes: selected.ganancia_mes,
    rentabilidad_mes: selected.rentabilidad_mes,
    plataformas: selected.plataformas,
    serie_mensual: buildSeries(currentYearRows),
    posicion_actual: buildCurrentPosition(currentYearRows),
    movimientos,
  }
}

summary.get('/', async (c) => {
  const period = parseSummaryPeriod(c)
  if (period.error) return fail(c, period.error)

  return ok(c, await buildSummaryData(c.env.DB, period.anio, period.mes))
})

export default summary
