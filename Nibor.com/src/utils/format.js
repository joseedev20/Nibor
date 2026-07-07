// Formato único de moneda, porcentajes y fechas (CONVENCIONES.md).
// Usar SIEMPRE estas funciones; nunca Intl directo en componentes.

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const pctFormatter = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** formatCOP(-928551.04) → "($ 928.551)" · formatCOP(4048013.73) → "$ 4.048.014" */
export function formatCOP(value) {
  if (value === null || value === undefined) return '—'
  const abs = copFormatter.format(Math.abs(value))
  return value < 0 ? `(${abs})` : abs
}

/** formatPct(0.0125) → "1,25 %" · negativos con paréntesis: "(1,25 %)" */
export function formatPct(value) {
  if (value === null || value === undefined) return '—'
  const abs = pctFormatter.format(Math.abs(value)).replace('%', ' %').replace('  %', ' %')
  return value < 0 ? `(${abs})` : abs
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** monthName(1) → "Enero" · monthName(1, 2026) → "Enero 2026" */
export function monthName(mes, anio) {
  const name = MONTHS[mes - 1] ?? '¿?'
  return anio ? `${name} ${anio}` : name
}

/** formatDate('2026-07-04') → "4 jul 2026" */
export function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}
