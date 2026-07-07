<script setup>
import { computed, onMounted, ref } from 'vue'
import VChart from '../charts/setup.js'
import StatCard from '../components/StatCard.vue'
import CapitalMovementModal from '../components/CapitalMovementModal.vue'
import { formatCOP, formatPct, monthName } from '../utils/format.js'
import { useIsDark } from '../composables/useIsDark.js'
import {
  platformSeriesColor,
  chartInk,
  CATEGORY_PALETTE,
  OTHER_COLOR,
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
} from '../utils/chartColors.js'

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const summary = ref(null)
const loading = ref(false)
const error = ref('')
const autoJumped = ref(false)
const fixedIncomeCount = ref(0)

const isDark = useIsDark()
const mode = computed(() => (isDark.value ? 'dark' : 'light'))
const ink = computed(() => chartInk(mode.value))

const monthLabel = computed(() => monthName(selectedMonth.value, selectedYear.value))
const monthShort = (mes) => monthName(mes).slice(0, 3)

async function fetchSummary(anio, mes) {
  const response = await fetch(`/api/summary?anio=${anio}&mes=${mes}`)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'No se pudo cargar el resumen')
  return json.data
}

async function fetchFixedIncomes() {
  const response = await fetch('/api/subscriptions?activa=1&tipo=ingreso')
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'No se pudieron cargar los ingresos fijos')
  return json.data
}

// Fijos de pago manual sin registrar en el mes REAL en curso (no el mes visualizado)
const manualPending = ref([])
async function fetchManualPending() {
  const response = await fetch(`/api/subscriptions/reminders?anio=${now.getFullYear()}&mes=${now.getMonth() + 1}`)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'No se pudieron cargar los recordatorios')
  return json.data.pendientes
}

async function loadSummary({ allowJump = false } = {}) {
  loading.value = true
  error.value = ''
  try {
    const [summaryData, incomeData, pendingData] = await Promise.all([
      fetchSummary(selectedYear.value, selectedMonth.value),
      fetchFixedIncomes(),
      fetchManualPending(),
    ])
    let data = summaryData
    fixedIncomeCount.value = incomeData.length
    manualPending.value = pendingData

    // Si el mes elegido no tiene cierres, saltar al último mes del año con datos
    if (allowJump && data.plataformas.length === 0) {
      const withData = data.serie_mensual.filter((m) => m.plataformas.length > 0)
      const last = withData[withData.length - 1]
      if (last && last.mes !== selectedMonth.value) {
        selectedMonth.value = last.mes
        data = await fetchSummary(selectedYear.value, last.mes)
        autoJumped.value = true
      }
    }
    summary.value = data
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function shiftMonth(delta) {
  const date = new Date(selectedYear.value, selectedMonth.value - 1 + delta, 1)
  selectedYear.value = date.getFullYear()
  selectedMonth.value = date.getMonth() + 1
  autoJumped.value = false
  loadSummary()
}

function setCurrentMonth() {
  selectedYear.value = now.getFullYear()
  selectedMonth.value = now.getMonth() + 1
  autoJumped.value = false
  loadSummary({ allowJump: true })
}

// ── Datos derivados ────────────────────────────────────────────────────────

const serie = computed(() => summary.value?.serie_mensual ?? [])
const hasSnapshots = computed(() => serie.value.some((m) => m.plataformas.length > 0))
const movimientos = computed(() => summary.value?.movimientos ?? null)
const hasGastos = computed(() => (movimientos.value?.gastos_por_categoria?.length ?? 0) > 0)
const needsIncomeSetup = computed(() => summary.value && tasaAhorro.value === null && fixedIncomeCount.value === 0)

// Plataformas en orden estable (primera aparición en el año)
const platformList = computed(() => {
  const seen = new Map()
  for (const month of serie.value) {
    for (const p of month.plataformas) {
      if (!seen.has(p.platform_id)) seen.set(p.platform_id, p)
    }
  }
  return [...seen.values()]
})

// Recordatorio de cierre: el mes anterior al actual no está cerrado
const pendingReminder = computed(() => {
  if (selectedYear.value !== now.getFullYear() || !hasSnapshots.value) return null
  const prev = now.getMonth() // mes anterior al actual, 1-based
  if (prev < 1) return null
  const prevData = serie.value.find((m) => m.mes === prev)
  if (prevData && prevData.plataformas.length === 0) return monthName(prev, now.getFullYear())
  return null
})

const tasaAhorro = computed(() => movimientos.value?.tasa_ahorro ?? null)
const savingsRateValue = computed(() => (tasaAhorro.value === null ? 'Sin ingresos' : formatPct(tasaAhorro.value)))
const savingsRateSub = computed(() => {
  if (tasaAhorro.value !== null) return 'del ingreso del mes'
  return fixedIncomeCount.value === 0
    ? 'configura salario o arriendo fijo'
    : 'aplica tus ingresos fijos al mes'
})

// Posición actual = último cierre + aportes en tránsito (calculada en backend)
const posicion = computed(() => summary.value?.posicion_actual ?? null)
const enTransito = computed(() => posicion.value?.en_transito ?? 0)
const movementOpen = ref(false)

function platformPosicion(platformId) {
  return posicion.value?.plataformas.find((p) => p.platform_id === platformId) ?? null
}

// Inversiones activas vs fondos de ahorro (cesantías, pensión)
const inversionesCards = computed(() => (summary.value?.plataformas ?? []).filter((p) => p.tipo !== 'fondo'))
const fondosCards = computed(() => (posicion.value?.plataformas ?? []).filter((p) => p.tipo === 'fondo'))

const patrimonioSub = computed(() => {
  if (!posicion.value) return variacionSub.value
  if (posicion.value.total_fondo > 0) {
    return `inversiones: ${formatCOP(posicion.value.total_inversion)} · fondos: ${formatCOP(posicion.value.total_fondo)}`
  }
  if (enTransito.value > 0 && summary.value) {
    return `cierre de ${monthLabel.value}: ${formatCOP(summary.value.patrimonio_total)} + ${formatCOP(enTransito.value)} aportados después`
  }
  return variacionSub.value
})

// Tarjeta grande de inversiones: posición hoy + detalle del último cierre
const inversionesSub = computed(() => {
  if (!posicion.value || !summary.value) return ''
  const transito = posicion.value.plataformas
    .filter((p) => p.tipo !== 'fondo')
    .reduce((sum, p) => sum + p.en_transito, 0)
  const cierre = posicion.value.total_inversion - transito
  if (transito > 0) {
    return `cierre de ${monthLabel.value}: ${formatCOP(cierre)} + ${formatCOP(transito)} aportados después`
  }
  return `cierre de ${monthLabel.value}${summary.value.rentabilidad_mes !== null ? ` · rentabilidad ${formatPct(summary.value.rentabilidad_mes)}` : ''}`
})

const variacionSub = computed(() => {
  if (!summary.value) return ''
  const { variacion_patrimonio: v, variacion_patrimonio_pct: pct } = summary.value
  if (v === 0 && pct === null) return 'sin mes anterior para comparar'
  // signo ya expresado con el prefijo +/−; abs evita doble paréntesis de formatPct
  const pctText = pct === null ? '' : ` (${formatPct(Math.abs(pct))})`
  return `${v >= 0 ? '+' : '−'}${formatCOP(Math.abs(v)).replace(/[()]/g, '')}${pctText} vs mes anterior`
})

function tone(value) {
  if (value === null || value === undefined || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function trendColor(value) {
  if (value === null || value === undefined || value === 0) return OTHER_COLOR[mode.value]
  return value > 0 ? POSITIVE_COLOR[mode.value] : NEGATIVE_COLOR[mode.value]
}

// ── Opciones de gráficas ───────────────────────────────────────────────────

const baseAxis = computed(() => ({
  axisLine: { lineStyle: { color: ink.value.axisLine } },
  axisTick: { show: false },
  axisLabel: { color: ink.value.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: ink.value.grid } },
}))

const tooltipBase = computed(() => ({
  backgroundColor: ink.value.surface,
  borderColor: ink.value.axisLine,
  textStyle: { color: ink.value.text, fontSize: 12 },
}))

const compactCOP = (value) => `$ ${(value / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`

// Área apilada: evolución del patrimonio por plataforma
const areaOption = computed(() => ({
  tooltip: {
    ...tooltipBase.value,
    trigger: 'axis',
    axisPointer: { type: 'cross', label: { show: false }, crossStyle: { color: ink.value.muted } },
    valueFormatter: (v) => (v === null || v === undefined ? 'pendiente' : formatCOP(v)),
  },
  legend: { top: 0, textStyle: { color: ink.value.text, fontSize: 12 }, itemWidth: 14, itemHeight: 8 },
  grid: { left: 56, right: 16, top: 36, bottom: 28 },
  xAxis: { type: 'category', boundaryGap: false, data: serie.value.map((m) => monthShort(m.mes)), ...baseAxis.value, splitLine: { show: false } },
  yAxis: { type: 'value', ...baseAxis.value, axisLine: { show: false }, axisLabel: { ...baseAxis.value.axisLabel, formatter: compactCOP } },
  series: platformList.value.map((p, i) => ({
    name: p.nombre,
    type: 'line',
    stack: 'patrimonio',
    data: serie.value.map((m) => m.plataformas.find((x) => x.platform_id === p.platform_id)?.saldo_final ?? null),
    color: platformSeriesColor(p.nombre, mode.value, i),
    lineStyle: { width: 2 },
    areaStyle: { opacity: 0.28 },
    symbol: 'circle',
    symbolSize: 7,
    showSymbol: false,
    emphasis: { focus: 'series' },
  })),
}))

// Barras +/-: ganancia/pérdida mensual consolidada
const barOption = computed(() => ({
  tooltip: {
    ...tooltipBase.value,
    trigger: 'axis',
    valueFormatter: (v) => (v === null || v === undefined ? 'sin datos' : formatCOP(v)),
  },
  grid: { left: 56, right: 16, top: 16, bottom: 28 },
  xAxis: { type: 'category', data: serie.value.map((m) => monthShort(m.mes)), ...baseAxis.value, splitLine: { show: false } },
  yAxis: { type: 'value', ...baseAxis.value, axisLine: { show: false }, axisLabel: { ...baseAxis.value.axisLabel, formatter: compactCOP } },
  series: [{
    name: 'Ganancia',
    type: 'bar',
    barMaxWidth: 26,
    data: serie.value.map((m) => {
      if (m.plataformas.length === 0) return null
      const positive = m.ganancia >= 0
      return {
        value: m.ganancia,
        itemStyle: {
          color: positive ? POSITIVE_COLOR[mode.value] : NEGATIVE_COLOR[mode.value],
          borderRadius: positive ? [4, 4, 0, 0] : [0, 0, 4, 4],
        },
      }
    }),
  }],
}))

// Dona: gastos por categoría (top 5 + Otros)
const donutData = computed(() => {
  const cats = movimientos.value?.gastos_por_categoria ?? []
  const palette = CATEGORY_PALETTE[mode.value]
  const top = cats.slice(0, 5).map((c, i) => ({ name: c.nombre, value: c.total, itemStyle: { color: palette[i] } }))
  const rest = cats.slice(5)
  if (rest.length) {
    top.push({
      name: 'Otros',
      value: rest.reduce((sum, c) => sum + c.total, 0),
      itemStyle: { color: OTHER_COLOR[mode.value] },
    })
  }
  return top
})

const donutOption = computed(() => ({
  tooltip: { ...tooltipBase.value, trigger: 'item', valueFormatter: (v) => formatCOP(v) },
  legend: { bottom: 0, type: 'scroll', textStyle: { color: ink.value.text, fontSize: 12 }, itemWidth: 12, itemHeight: 12 },
  series: [{
    type: 'pie',
    radius: ['58%', '82%'],
    center: ['50%', '44%'],
    data: donutData.value,
    itemStyle: { borderColor: ink.value.surface, borderWidth: 2 },
    label: { show: false },
    emphasis: { scaleSize: 4 },
  }],
}))

// Sparkline por plataforma: color por desempeño, no por marca.
function sparkOption(platformId, trendValue) {
  const data = serie.value.map((m) => m.plataformas.find((x) => x.platform_id === platformId)?.saldo_final ?? null)
  const color = trendColor(trendValue)
  return {
    grid: { left: 2, right: 2, top: 4, bottom: 2 },
    xAxis: { type: 'category', show: false, data: serie.value.map((m) => m.mes), boundaryGap: false },
    yAxis: { type: 'value', show: false, min: 'dataMin' },
    tooltip: { show: false },
    series: [{
      type: 'line',
      data,
      color,
      lineStyle: { width: 2 },
      areaStyle: { color, opacity: 0.15 },
      symbol: 'none',
      silent: true,
    }],
  }
}

onMounted(() => loadSummary({ allowJump: true }))
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Resumen</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tu patrimonio y el balance del mes, de un vistazo.</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="movementOpen = true">＋ Aporte / retiro</button>
        <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Mes anterior" @click="shiftMonth(-1)">‹</button>
        <div class="flex h-10 min-w-40 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">{{ monthLabel }}</div>
        <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Mes siguiente" @click="shiftMonth(1)">›</button>
        <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" @click="setCurrentMonth">Actual</button>
      </div>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>

    <div v-if="autoJumped" class="mt-4 rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      El mes actual aún no tiene cierres — mostrando <strong>{{ monthLabel }}</strong>, el último mes con datos.
    </div>

    <RouterLink v-if="pendingReminder" to="/cierre" class="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900">
      <span><strong>{{ pendingReminder }}</strong> aún no está cerrado. Hazlo en ~2 minutos →</span>
    </RouterLink>

    <RouterLink v-if="manualPending.length" to="/gastos" class="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900">
      <span>
        💡 <strong>Pagos manuales de {{ monthName(new Date().getMonth() + 1) }} sin registrar:</strong>
        {{ manualPending.map((p) => `${p.nombre} (día ${p.dia_cobro})`).join(', ') }}
      </span>
      <span class="shrink-0 font-semibold">Registrar →</span>
    </RouterLink>

    <RouterLink v-if="needsIncomeSetup" to="/suscripciones" class="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900">
      <span><strong>Registra tu salario</strong> para ver tu tasa de ahorro.</span>
      <span class="shrink-0 font-semibold">Configurar ingresos fijos →</span>
    </RouterLink>

    <div v-if="!loading && summary && !hasSnapshots" class="mt-8 rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
      Aún no has registrado ningún mes de {{ selectedYear }}. Empieza en <RouterLink to="/cierre" class="font-medium text-emerald-700 underline dark:text-emerald-400">Cierre de mes</RouterLink> o registra tus saldos en <RouterLink to="/inversiones" class="font-medium text-emerald-700 underline dark:text-emerald-400">Inversiones</RouterLink>.
    </div>

    <template v-if="summary && hasSnapshots">
      <!-- StatCards: dos grandes (posición) + tres del mes -->
      <div class="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard :label="enTransito > 0 ? 'Patrimonio actual' : 'Patrimonio total'" :value="formatCOP(posicion?.total ?? summary.patrimonio_total)" :sub="patrimonioSub" tone="neutral" />
        <StatCard label="Inversiones (hoy)" :value="formatCOP(posicion?.total_inversion ?? summary.patrimonio_total)" :sub="inversionesSub" tone="neutral" />
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <StatCard label="Ganancia del mes" :value="formatCOP(summary.ganancia_mes)" :tone="tone(summary.ganancia_mes)" :sub="`rentabilidad ${formatPct(summary.rentabilidad_mes)}`" />
        <StatCard label="Ingresos vs gastos" :value="formatCOP((movimientos?.total_ingresos ?? 0) - (movimientos?.total_gastos ?? 0))" :tone="tone((movimientos?.total_ingresos ?? 0) - (movimientos?.total_gastos ?? 0))" :sub="`${formatCOP(movimientos?.total_ingresos)} in · ${formatCOP(movimientos?.total_gastos)} out`" />
        <StatCard label="Tasa de ahorro" :value="savingsRateValue" :tone="tone(tasaAhorro)" :sub="savingsRateSub" />
      </div>

      <!-- Inversiones activas -->
      <div class="mt-6 flex items-baseline justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Inversiones</h2>
        <p v-if="posicion" class="text-sm font-semibold tabular-nums">{{ formatCOP(posicion.total_inversion) }}</p>
      </div>
      <div class="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="(p, i) in inversionesCards" :key="p.platform_id" class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: p.color }" />
            <p class="text-sm font-semibold">{{ p.nombre }}</p>
          </div>
          <p class="mt-2 text-lg font-bold tabular-nums">{{ formatCOP(platformPosicion(p.platform_id)?.posicion ?? p.saldo_final) }}</p>
          <p class="text-xs" :class="p.ganancia >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'">
            {{ formatCOP(p.ganancia) }} · {{ formatPct(p.rentabilidad) }} en {{ monthLabel.split(' ')[0].toLowerCase() }}
          </p>
          <p v-if="platformPosicion(p.platform_id)?.en_transito" class="text-xs text-zinc-500 dark:text-zinc-400">
            incluye {{ formatCOP(platformPosicion(p.platform_id).en_transito) }} aportados después del cierre
          </p>
          <!-- altura inline: la clase h-12 pierde contra el height:100% interno de vue-echarts y el canvas crece sin fin -->
          <div class="mt-2 w-full overflow-hidden" style="height: 48px">
            <VChart style="height: 48px; width: 100%" :option="sparkOption(p.platform_id, p.ganancia)" autoresize />
          </div>
        </div>
      </div>

      <!-- Fondos de ahorro (cesantías, pensión) -->
      <template v-if="fondosCards.length">
        <div class="mt-6 flex items-baseline justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fondos de ahorro</h2>
          <p class="text-sm font-semibold tabular-nums">{{ formatCOP(posicion.total_fondo) }}</p>
        </div>
        <div class="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="f in fondosCards" :key="f.platform_id" class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: f.color }" />
              <p class="text-sm font-semibold">{{ f.nombre }}</p>
              <span class="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">fondo</span>
            </div>
            <p class="mt-2 text-lg font-bold tabular-nums">{{ formatCOP(f.posicion) }}</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              {{ f.ultimo_cierre_mes ? `último cierre: ${monthName(f.ultimo_cierre_mes)}` : 'saldo registrado — se actualiza en el cierre de mes' }}
            </p>
          </div>
        </div>
      </template>

      <!-- Evolución del patrimonio -->
      <section class="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 class="text-sm font-semibold">Evolución del patrimonio · {{ selectedYear }}</h2>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">Saldo final por plataforma, apilado</p>
        <VChart class="mt-3 w-full" style="height: 320px" :option="areaOption" autoresize />
      </section>

      <div class="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <!-- Ganancia mensual -->
        <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 class="text-sm font-semibold">Ganancia / pérdida mensual · {{ selectedYear }}</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Consolidado de todas las plataformas</p>
          <VChart class="mt-3 w-full" style="height: 280px" :option="barOption" autoresize />
        </section>

        <!-- Gastos por categoría -->
        <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 class="text-sm font-semibold">Gastos por categoría · {{ monthLabel }}</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Total: {{ formatCOP(movimientos?.total_gastos) }}</p>
          <VChart v-if="hasGastos" class="mt-3 w-full" style="height: 280px" :option="donutOption" autoresize />
          <div v-else class="mt-3 flex items-center justify-center rounded-xl border border-dashed border-zinc-300 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500" style="height: 280px">
            <p>Aún no has registrado gastos en {{ monthLabel }}.<br><RouterLink to="/gastos" class="font-medium text-emerald-700 underline dark:text-emerald-400">Agregar movimientos</RouterLink></p>
          </div>
        </section>
      </div>
    </template>

    <div v-if="loading" class="mt-8 p-12 text-center text-sm text-zinc-400">Cargando…</div>

    <CapitalMovementModal :open="movementOpen" @close="movementOpen = false" @saved="loadSummary({ allowJump: true })" />
  </div>
</template>
