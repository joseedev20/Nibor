// Colores de series VALIDADOS por modo (bandas OKLCH, separación CVD y
// contraste vs superficie — scripts/validate_palette.js del skill dataviz).
// El color de marca de la DB se usa en chips y tabs; en las gráficas se usa
// la variante del modo para garantizar legibilidad.

const PLATFORM_SERIES = {
  'Binance':             { light: '#CA8A04', dark: '#A16207' },
  'Colfondos':           { light: '#E4002B', dark: '#F43F5E' },
  'Nubank':              { light: '#820AD1', dark: '#9333EA' },
  'Happi':               { light: '#047857', dark: '#059669' },
  'Pensión Obligatoria': { light: '#1D4ED8', dark: '#2563EB' },
  'Cesantías':           { light: '#0891B2', dark: '#0891B2' },
}

// Paleta categórica para plataformas/categorías nuevas (orden fijo, nunca ciclada)
export const CATEGORY_PALETTE = {
  light: ['#1D4ED8', '#CA8A04', '#047857', '#E4002B', '#820AD1'],
  dark: ['#2563EB', '#A16207', '#059669', '#F43F5E', '#9333EA'],
}

// Neutro reservado para "Otros" (fuera de la paleta categórica a propósito)
export const OTHER_COLOR = { light: '#52525B', dark: '#A1A1AA' }

// Polaridad ganancia/pérdida (par divergente)
export const POSITIVE_COLOR = { light: '#047857', dark: '#059669' }
export const NEGATIVE_COLOR = { light: '#BE123C', dark: '#F43F5E' }

/** Color de serie para una plataforma según el modo ('light' | 'dark'). */
export function platformSeriesColor(nombre, mode, fallbackIndex = 0) {
  return PLATFORM_SERIES[nombre]?.[mode]
    ?? CATEGORY_PALETTE[mode][fallbackIndex % CATEGORY_PALETTE[mode].length]
}

/** Tokens de tinta/superficie para ejes, grid y tooltips por modo. */
export function chartInk(mode) {
  const dark = mode === 'dark'
  return {
    surface: dark ? '#18181b' : '#ffffff',
    text: dark ? '#d4d4d8' : '#3f3f46',
    muted: dark ? '#71717a' : '#a1a1aa',
    grid: dark ? '#27272a' : '#f4f4f5',
    axisLine: dark ? '#3f3f46' : '#e4e4e7',
  }
}
