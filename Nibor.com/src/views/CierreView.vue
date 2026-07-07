<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatPct, monthName } from '../utils/format.js'

const now = new Date()
const step = ref(1)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const saved = ref(null) // resumen devuelto por el backend tras guardar

const anio = ref(now.getFullYear())
const mes = ref(now.getMonth() + 1)
const platforms = ref([]) // { id, nombre, color, saldo_inicial, aporte, retiros, saldo_final, prevClosed }
const categories = ref([])
const subscriptions = ref([])
const applySubs = ref(true)
const movimientos = ref([])
const movForm = ref(null)

const monthLabel = computed(() => monthName(mes.value, anio.value))
const lastDay = computed(() => new Date(anio.value, mes.value, 0).getDate())

const steps = [
  { n: 1, label: 'Saldos' },
  { n: 2, label: 'Movimientos' },
  { n: 3, label: 'Confirmar' },
]

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

function toInput(value) {
  return value === null || value === undefined ? '' : value
}

function moneyPreview(value) {
  return formatCOP(Number(value || 0))
}

async function loadPeriodData() {
  loading.value = true
  error.value = ''
  try {
    const [platformsData, categoriesData, subsData, snapshotsData] = await Promise.all([
      fetchJson('/api/platforms'),
      fetchJson('/api/categories'),
      fetchJson('/api/subscriptions'),
      fetchJson(`/api/snapshots?anio=${anio.value}`),
    ])

    categories.value = categoriesData
    subscriptions.value = subsData.filter((s) => Number(s.activa) === 1)

    const prevMes = mes.value === 1 ? 12 : mes.value - 1
    const prevAnio = mes.value === 1 ? anio.value - 1 : anio.value
    const prevYearData = mes.value === 1 ? await fetchJson(`/api/snapshots?anio=${prevAnio}`) : snapshotsData

    platforms.value = platformsData
      .filter((p) => Number(p.activa) === 1)
      .map((p) => {
        const group = snapshotsData.platforms.find((g) => g.id === p.id)
        const current = group?.snapshots.find((s) => s.mes === mes.value)
        const prevGroup = prevYearData.platforms.find((g) => g.id === p.id)
        const prev = prevGroup?.snapshots.find((s) => s.mes === prevMes && !s.pendiente)
        return {
          id: p.id,
          nombre: p.nombre,
          color: p.color,
          saldo_inicial: toInput(current?.saldo_inicial ?? prev?.saldo_final),
          aporte: toInput(current?.aporte) || 0,
          retiros: toInput(current?.retiros) || 0,
          saldo_final: current?.pendiente === false ? toInput(current?.saldo_final) : '',
          yaCerrado: current ? current.pendiente === false : false,
        }
      })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function shiftMonth(delta) {
  const date = new Date(anio.value, mes.value - 1 + delta, 1)
  anio.value = date.getFullYear()
  mes.value = date.getMonth() + 1
  step.value = 1
  saved.value = null
  loadPeriodData()
}

// Estimación local SOLO como preview del paso 1/3 (PLAN §3);
// los valores definitivos siempre vienen del backend al guardar.
function preview(p) {
  if (p.saldo_final === '' || p.saldo_final === null) return null
  const base = Number(p.saldo_inicial || 0) + Number(p.aporte || 0)
  const ganancia = Number(p.saldo_final) + Number(p.retiros || 0) - base
  return { ganancia, rentabilidad: base > 0 ? ganancia / base : null }
}

const included = computed(() => platforms.value.filter((p) => p.saldo_final !== '' && p.saldo_final !== null))
const omitted = computed(() => platforms.value.filter((p) => p.saldo_final === '' || p.saldo_final === null))
const canContinue = computed(() => included.value.length > 0)

const totalMovs = computed(() => ({
  gastos: movimientos.value.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + Number(m.monto || 0), 0),
  ingresos: movimientos.value.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto || 0), 0),
}))

const subsGastos = computed(() => subscriptions.value
  .filter((x) => x.tipo !== 'ingreso')
  .reduce((s, x) => s + Number(x.monto ?? 0), 0))
const subsIngresos = computed(() => subscriptions.value
  .filter((x) => x.tipo === 'ingreso')
  .reduce((s, x) => s + Number(x.monto ?? 0), 0))

function movCategories(tipo) {
  return categories.value.filter((c) => c.tipo === tipo)
}

function openMovForm(tipo) {
  const day = String(Math.min(now.getDate(), lastDay.value)).padStart(2, '0')
  movForm.value = {
    tipo,
    categoria_id: '',
    descripcion: '',
    monto: '',
    fecha: `${anio.value}-${String(mes.value).padStart(2, '0')}-${day}`,
  }
}

function addMovement() {
  if (!movForm.value || movForm.value.monto === '' || Number(movForm.value.monto) < 0) return
  movimientos.value.push({ ...movForm.value, monto: Number(movForm.value.monto) })
  movForm.value = null
}

function categoryName(id) {
  return categories.value.find((c) => c.id === Number(id))?.nombre ?? 'Sin categoría'
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const payload = {
      anio: anio.value,
      mes: mes.value,
      snapshots: included.value.map((p) => ({
        platform_id: p.id,
        saldo_inicial: p.saldo_inicial === '' ? undefined : Number(p.saldo_inicial),
        aporte: Number(p.aporte || 0),
        retiros: Number(p.retiros || 0),
        saldo_final: Number(p.saldo_final),
      })),
      movimientos: movimientos.value.map((m) => ({
        fecha: m.fecha,
        tipo: m.tipo,
        categoria_id: m.categoria_id === '' ? null : Number(m.categoria_id),
        descripcion: m.descripcion,
        monto: m.monto,
      })),
      aplicar_suscripciones: applySubs.value && subscriptions.value.length > 0,
    }
    saved.value = await fetchJson('/api/close-month', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    step.value = 4 // pantalla de éxito
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // Proponer el primer mes pendiente del año: el siguiente al último cerrado
  try {
    const data = await fetchJson(`/api/snapshots?anio=${anio.value}`)
    const closedMonths = data.platforms.flatMap((g) => g.snapshots.filter((s) => !s.pendiente).map((s) => s.mes))
    if (closedMonths.length) {
      const next = Math.max(...closedMonths) + 1
      if (next <= 12 && next < mes.value) mes.value = next
    }
  } catch { /* si falla, se queda el mes actual */ }
  loadPeriodData()
})
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Cierre de mes</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tu ritual de fin de mes, en 3 pasos.</p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" :disabled="saving" @click="shiftMonth(-1)">‹</button>
        <div class="flex h-10 min-w-40 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">{{ monthLabel }}</div>
        <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" :disabled="saving" @click="shiftMonth(1)">›</button>
      </div>
    </div>

    <!-- Stepper -->
    <div v-if="step <= 3" class="mt-6 flex items-center gap-2">
      <template v-for="(s, i) in steps" :key="s.n">
        <button
          type="button"
          class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition"
          :class="step === s.n ? 'bg-emerald-600 text-white' : step > s.n ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
          :disabled="s.n > step"
          @click="s.n < step && (step = s.n)"
        >
          <span class="flex h-5 w-5 items-center justify-center rounded-full text-xs" :class="step === s.n ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'">{{ step > s.n ? '✓' : s.n }}</span>
          {{ s.label }}
        </button>
        <div v-if="i < steps.length - 1" class="h-px w-6 bg-zinc-200 dark:bg-zinc-700" />
      </template>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="loading" class="mt-8 p-12 text-center text-sm text-zinc-400">Cargando…</div>

    <!-- Paso 1: saldos por plataforma -->
    <div v-if="!loading && step === 1" class="mt-6 space-y-3">
      <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        En el cierre solo registras el saldo final de cada app. Los aportes y retiros vienen de los movimientos que ya registraste en Inversiones con <strong>+ Aporte / retiro</strong>.
      </div>

      <div v-for="p in platforms" :key="p.id" class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: p.color }" />
            <p class="text-sm font-semibold">{{ p.nombre }}</p>
            <span v-if="p.yaCerrado" class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">ya cerrado — editando</span>
          </div>
          <p v-if="preview(p)" class="text-sm font-semibold tabular-nums" :class="preview(p).ganancia >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'">
            {{ formatCOP(preview(p).ganancia) }} · {{ formatPct(preview(p).rentabilidad) }} <span class="font-normal text-zinc-400">estimado</span>
          </p>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="grid gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Saldo inicial
            <p class="flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold tabular-nums text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">{{ moneyPreview(p.saldo_inicial) }}</p>
          </div>
          <div class="grid gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Aportes registrados
            <p class="flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold tabular-nums text-emerald-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-emerald-400">{{ moneyPreview(p.aporte) }}</p>
          </div>
          <div class="grid gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Retiros registrados
            <p class="flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold tabular-nums text-rose-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-rose-400">{{ moneyPreview(p.retiros) }}</p>
          </div>
          <label class="grid gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Saldo final *
            <input v-model="p.saldo_final" type="number" min="0" step="0.01" class="h-10 rounded-lg border border-emerald-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-emerald-800 dark:bg-zinc-950 dark:text-zinc-100" placeholder="lo que ves en la app">
          </label>
        </div>
      </div>

      <div v-if="omitted.length" class="rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        Sin saldo final: <strong>{{ omitted.map((p) => p.nombre).join(', ') }}</strong> — quedarán como pendientes (puedes cerrarlas luego).
      </div>

      <div class="flex justify-end">
        <button type="button" class="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!canContinue" @click="step = 2">
          Continuar →
        </button>
      </div>
    </div>

    <!-- Paso 2: suscripciones + movimientos -->
    <div v-if="!loading && step === 2" class="mt-6 space-y-6">
      <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">Fijos y suscripciones del mes</h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ subscriptions.length }} activos · ingresos {{ formatCOP(subsIngresos) }} · gastos {{ formatCOP(subsGastos) }} — se registran en {{ monthLabel }} (sin duplicar)</p>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input v-model="applySubs" type="checkbox" class="h-4 w-4 accent-emerald-600">
            Aplicar todas
          </label>
        </div>
        <ul v-if="subscriptions.length" class="mt-3 grid gap-1 sm:grid-cols-2">
          <li v-for="s in subscriptions" :key="s.id" class="flex items-center justify-between rounded-lg px-3 py-2 text-sm" :class="applySubs ? 'bg-emerald-50/60 dark:bg-emerald-950/40' : 'bg-zinc-50 opacity-50 dark:bg-zinc-800/40'">
            <span>{{ s.nombre }} <span class="text-xs text-zinc-400">· día {{ s.dia_cobro }}</span></span>
            <span class="font-medium tabular-nums" :class="s.tipo === 'ingreso' ? 'text-emerald-700 dark:text-emerald-400' : ''">{{ s.tipo === 'ingreso' ? '+' : '−' }}{{ formatCOP(s.monto) }}</span>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-zinc-400">No tienes suscripciones activas. Créalas en la sección Suscripciones.</p>
      </section>

      <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">Gastos e ingresos del mes</h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Lo que no es suscripción: mercado, recibos variables, salario…</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="h-9 rounded-lg border border-emerald-200 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950" @click="openMovForm('ingreso')">+ Ingreso</button>
            <button type="button" class="h-9 rounded-lg border border-rose-200 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="openMovForm('gasto')">+ Gasto</button>
          </div>
        </div>

        <div v-if="movForm" class="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] dark:border-zinc-700 dark:bg-zinc-800/40">
          <select v-model="movForm.categoria_id" class="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            <option value="">Sin categoría</option>
            <option v-for="c in movCategories(movForm.tipo)" :key="c.id" :value="c.id">{{ c.icono }} {{ c.nombre }}</option>
          </select>
          <input v-model="movForm.descripcion" type="text" placeholder="Descripción" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <input v-model="movForm.monto" type="number" min="0" step="0.01" placeholder="Monto" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950" @click="addMovement">Agregar</button>
          <button type="button" class="h-10 rounded-lg px-3 text-sm text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700" @click="movForm = null">✕</button>
        </div>

        <ul v-if="movimientos.length" class="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          <li v-for="(m, i) in movimientos" :key="i" class="flex items-center justify-between py-2 text-sm">
            <span>
              <span class="mr-2 rounded-full px-2 py-0.5 text-xs font-medium" :class="m.tipo === 'ingreso' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400'">{{ m.tipo }}</span>
              {{ m.descripcion || categoryName(m.categoria_id) }}
            </span>
            <span class="flex items-center gap-3">
              <span class="font-medium tabular-nums">{{ formatCOP(m.monto) }}</span>
              <button type="button" class="text-zinc-400 hover:text-rose-600" title="Quitar" @click="movimientos.splice(i, 1)">✕</button>
            </span>
          </li>
        </ul>
        <p v-else-if="!movForm" class="mt-3 text-sm text-zinc-400">Sin movimientos manuales por ahora — también puedes agregarlos luego en Gastos e Ingresos.</p>
      </section>

      <div class="flex justify-between">
        <button type="button" class="h-11 rounded-lg border border-zinc-200 px-5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="step = 1">← Atrás</button>
        <button type="button" class="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="step = 3">Continuar →</button>
      </div>
    </div>

    <!-- Paso 3: confirmar -->
    <div v-if="!loading && step === 3" class="mt-6 space-y-4">
      <section class="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-4 py-3 text-sm font-semibold dark:border-zinc-800">Resumen del cierre — {{ monthLabel }}</div>
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <div v-for="p in included" :key="p.id" class="flex items-center justify-between px-4 py-3 text-sm">
            <span class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: p.color }" />{{ p.nombre }}</span>
            <span class="flex items-center gap-4 tabular-nums">
              <span class="text-zinc-500 dark:text-zinc-400">{{ formatCOP(Number(p.saldo_final)) }}</span>
              <span class="font-medium" :class="preview(p).ganancia >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'">{{ formatCOP(preview(p).ganancia) }}</span>
            </span>
          </div>
          <div v-if="omitted.length" class="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Quedan pendientes: {{ omitted.map((p) => p.nombre).join(', ') }}</div>
          <div class="flex items-center justify-between px-4 py-3 text-sm">
            <span>Fijos y suscripciones</span>
            <span class="tabular-nums">{{ applySubs && subscriptions.length ? `${subscriptions.length} · +${formatCOP(subsIngresos)} / −${formatCOP(subsGastos)}` : 'no se aplican' }}</span>
          </div>
          <div class="flex items-center justify-between px-4 py-3 text-sm">
            <span>Movimientos manuales</span>
            <span class="tabular-nums">{{ movimientos.length }} · ingresos {{ formatCOP(totalMovs.ingresos) }} · gastos {{ formatCOP(totalMovs.gastos) }}</span>
          </div>
        </div>
      </section>

      <p class="text-xs text-zinc-500 dark:text-zinc-400">Se guarda todo en una sola transacción: si algo falla, no se guarda nada. Las cifras definitivas las calcula el servidor.</p>

      <div class="flex justify-between">
        <button type="button" class="h-11 rounded-lg border border-zinc-200 px-5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" :disabled="saving" @click="step = 2">← Atrás</button>
        <button type="button" class="h-11 rounded-lg bg-emerald-600 px-8 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving" @click="save">
          {{ saving ? 'Guardando…' : `Cerrar ${monthLabel} ✓` }}
        </button>
      </div>
    </div>

    <!-- Éxito -->
    <div v-if="step === 4 && saved" class="mt-10 mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 text-center dark:border-emerald-900 dark:bg-zinc-900">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-950">🎉</div>
      <h2 class="mt-4 text-xl font-bold">{{ monthLabel }} cerrado</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
          <p class="text-xs uppercase text-zinc-500 dark:text-zinc-400">Patrimonio total</p>
          <p class="mt-1 text-lg font-bold tabular-nums">{{ formatCOP(saved.patrimonio_total) }}</p>
        </div>
        <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
          <p class="text-xs uppercase text-zinc-500 dark:text-zinc-400">Ganancia del mes</p>
          <p class="mt-1 text-lg font-bold tabular-nums" :class="saved.ganancia_mes >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'">
            {{ formatCOP(saved.ganancia_mes) }} · {{ formatPct(saved.rentabilidad_mes) }}
          </p>
        </div>
      </div>
      <div class="mt-6 flex justify-center gap-3">
        <RouterLink to="/" class="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold leading-[2.75rem] text-white transition hover:bg-emerald-500">Ver Dashboard</RouterLink>
        <button type="button" class="h-11 rounded-lg border border-zinc-200 px-5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="step = 1; saved = null; loadPeriodData()">Cerrar otro mes</button>
      </div>
    </div>
  </div>
</template>
