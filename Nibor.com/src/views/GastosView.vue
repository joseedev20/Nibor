<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatDate, monthName } from '../utils/format.js'

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const movements = ref([])
const categories = ref([])
const subscriptions = ref([])
const summary = ref(null)
const loading = ref(false)
const saving = ref(false)
const applyingFixed = ref(false)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm('gasto'))

const monthLabel = computed(() => monthName(selectedMonth.value, selectedYear.value))
const expenseCategories = computed(() => categories.value.filter((category) => category.tipo === 'gasto'))
const incomeCategories = computed(() => categories.value.filter((category) => category.tipo === 'ingreso'))
const formCategories = computed(() => form.value.tipo === 'ingreso' ? incomeCategories.value : expenseCategories.value)
const appliedSubscriptionIds = computed(() => new Set(movements.value
  .filter((movement) => movement.subscription_id !== null && movement.subscription_id !== undefined)
  .map((movement) => Number(movement.subscription_id))))
const pendingSubscriptions = computed(() => subscriptions.value.filter((subscription) => !appliedSubscriptionIds.value.has(Number(subscription.id))))
const fixedIncomeTotal = computed(() => subscriptions.value
  .filter((subscription) => subscription.tipo === 'ingreso')
  .reduce((sum, subscription) => sum + Number(subscription.monto ?? 0), 0))
const fixedExpenseTotal = computed(() => subscriptions.value
  .filter((subscription) => subscription.tipo !== 'ingreso')
  .reduce((sum, subscription) => sum + Number(subscription.monto ?? 0), 0))
const pendingFixedIncome = computed(() => pendingSubscriptions.value
  .filter((subscription) => subscription.tipo === 'ingreso')
  .reduce((sum, subscription) => sum + Number(subscription.monto ?? 0), 0))
const pendingFixedExpense = computed(() => pendingSubscriptions.value
  .filter((subscription) => subscription.tipo !== 'ingreso')
  .reduce((sum, subscription) => sum + Number(subscription.monto ?? 0), 0))
const fixedBalance = computed(() => fixedIncomeTotal.value - fixedExpenseTotal.value)
const hasFixedTemplates = computed(() => subscriptions.value.length > 0)
const hasPendingFixed = computed(() => pendingSubscriptions.value.length > 0)
const totals = computed(() => summary.value?.movimientos ?? {
  total_ingresos: 0,
  total_gastos: 0,
  balance: 0,
  tasa_ahorro: null,
  gastos_por_categoria: [],
})

function emptyForm(tipo = 'gasto') {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return {
    id: null,
    fecha: date,
    tipo,
    categoria_id: '',
    descripcion: '',
    monto: '',
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const query = `anio=${selectedYear.value}&mes=${selectedMonth.value}`
    const [movementsData, categoriesData, summaryData, subscriptionsData] = await Promise.all([
      fetchJson(`/api/movements?${query}`),
      fetchJson('/api/categories'),
      fetchJson(`/api/summary?${query}`),
      fetchJson('/api/subscriptions?activa=1'),
    ])
    movements.value = movementsData
    categories.value = categoriesData
    summary.value = summaryData
    subscriptions.value = subscriptionsData
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
  notice.value = ''
  loadData()
}

function setCurrentMonth() {
  selectedYear.value = now.getFullYear()
  selectedMonth.value = now.getMonth() + 1
  notice.value = ''
  loadData()
}

function openNew(tipo) {
  editorError.value = ''
  const day = String(Math.min(now.getDate(), new Date(selectedYear.value, selectedMonth.value, 0).getDate())).padStart(2, '0')
  form.value = {
    ...emptyForm(tipo),
    fecha: `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${day}`,
  }
  editorOpen.value = true
}

function openEdit(movement) {
  editorError.value = ''
  form.value = {
    id: movement.id,
    fecha: movement.fecha,
    tipo: movement.tipo,
    categoria_id: movement.categoria_id ?? '',
    descripcion: movement.descripcion ?? '',
    monto: movement.monto,
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

async function saveMovement() {
  saving.value = true
  editorError.value = ''

  const payload = {
    fecha: form.value.fecha,
    tipo: form.value.tipo,
    categoria_id: form.value.categoria_id === '' ? null : Number(form.value.categoria_id),
    descripcion: form.value.descripcion,
    monto: Number(form.value.monto),
  }

  try {
    await fetchJson(form.value.id ? `/api/movements/${form.value.id}` : '/api/movements', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    await loadData()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteMovement() {
  if (!form.value.id || !window.confirm('¿Eliminar este movimiento?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/movements/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadData()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function applyFixedMovements() {
  applyingFixed.value = true
  error.value = ''
  notice.value = ''

  try {
    const data = await fetchJson(`/api/subscriptions/apply?anio=${selectedYear.value}&mes=${selectedMonth.value}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    notice.value = `Fijos aplicados: ${data.created.length}. Ya existían: ${data.skipped.length}.`
    await loadData()
  } catch (err) {
    error.value = err.message
  } finally {
    applyingFixed.value = false
  }
}

function toneClass(value) {
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-rose-700 dark:text-rose-400'
  return 'text-zinc-600 dark:text-zinc-300'
}

onMounted(loadData)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Gastos e Ingresos</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tus movimientos del mes por categoría.</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Mes anterior" @click="shiftMonth(-1)">‹</button>
        <div class="flex h-10 min-w-40 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">
          {{ monthLabel }}
        </div>
        <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Mes siguiente" @click="shiftMonth(1)">›</button>
        <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" @click="setCurrentMonth">Actual</button>
      </div>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {{ error }}
    </div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      {{ notice }}
    </div>

    <section v-if="hasFixedTemplates" class="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ingresos y gastos fijos</p>
          <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span v-if="hasPendingFixed">Hay {{ pendingSubscriptions.length }} fijo{{ pendingSubscriptions.length === 1 ? '' : 's' }} pendiente{{ pendingSubscriptions.length === 1 ? '' : 's' }} por aplicar en {{ monthLabel }}.</span>
            <span v-else>Los fijos activos ya están aplicados en {{ monthLabel }}.</span>
          </p>
        </div>

        <div class="grid gap-2 sm:grid-cols-3 xl:min-w-[34rem]">
          <div class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <p class="text-xs uppercase text-zinc-500 dark:text-zinc-400">Ingresos fijos</p>
            <p class="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{{ formatCOP(fixedIncomeTotal) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <p class="text-xs uppercase text-zinc-500 dark:text-zinc-400">Gastos fijos</p>
            <p class="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">{{ formatCOP(fixedExpenseTotal) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <p class="text-xs uppercase text-zinc-500 dark:text-zinc-400">Diferencia fija</p>
            <p class="text-sm font-semibold tabular-nums" :class="toneClass(fixedBalance)">{{ formatCOP(fixedBalance) }}</p>
          </div>
        </div>

        <button
          v-if="hasPendingFixed"
          type="button"
          class="h-10 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="applyingFixed"
          @click="applyFixedMovements"
        >
          {{ applyingFixed ? 'Aplicando...' : 'Aplicar fijos' }}
        </button>
        <span v-else class="inline-flex h-9 shrink-0 items-center rounded-full bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Aplicados</span>
      </div>

      <div v-if="hasPendingFixed" class="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Pendiente por aplicar: {{ formatCOP(pendingFixedIncome) }} en ingresos y {{ formatCOP(pendingFixedExpense) }} en gastos.
      </div>
    </section>

    <div class="mt-6 grid gap-3 md:grid-cols-3">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Ingresos</p>
        <p class="mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-400">{{ formatCOP(totals.total_ingresos) }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Gastos</p>
        <p class="mt-2 text-xl font-bold text-rose-700 dark:text-rose-400">{{ formatCOP(totals.total_gastos) }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Balance</p>
        <p class="mt-2 text-xl font-bold" :class="toneClass(totals.balance)">{{ formatCOP(totals.balance) }}</p>
      </div>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-[1fr_22rem]">
      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p class="text-sm font-semibold">Movimientos</p>
          <div class="flex gap-2">
            <button type="button" class="h-9 rounded-lg border border-emerald-200 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950" @click="openNew('ingreso')">Ingreso</button>
            <button type="button" class="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" @click="openNew('gasto')">Gasto</button>
          </div>
        </div>

        <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando…</div>
        <div v-else-if="!movements.length" class="p-8 text-center text-sm text-zinc-400">
          <span v-if="hasPendingFixed">Aún no hay movimientos en {{ monthLabel }}. Aplica tus fijos para traer salario, arriendo y suscripciones.</span>
          <span v-else>Aún no has registrado este mes.</span>
        </div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button
            v-for="movement in movements"
            :key="movement.id"
            type="button"
            class="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            @click="openEdit(movement)"
          >
            <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-base dark:bg-zinc-800">{{ movement.categoria_icono ?? '·' }}</span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ movement.descripcion || movement.categoria_nombre || 'Sin descripción' }}</span>
              <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ formatDate(movement.fecha) }} · {{ movement.categoria_nombre ?? 'Sin categoría' }}</span>
            </span>
            <span class="text-right text-sm font-semibold tabular-nums" :class="movement.tipo === 'ingreso' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'">
              {{ movement.tipo === 'ingreso' ? '+' : '-' }} {{ formatCOP(movement.monto) }}
            </span>
          </button>
        </div>
      </section>

      <aside class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-sm font-semibold">Gastos por categoría</p>
        <div v-if="!totals.gastos_por_categoria.length" class="mt-6 text-sm text-zinc-400">Aún no hay gastos para desglosar.</div>
        <div v-else class="mt-4 space-y-4">
          <div v-for="category in totals.gastos_por_categoria" :key="category.categoria_id ?? category.nombre">
            <div class="mb-1 flex items-center justify-between gap-3 text-xs">
              <span class="truncate text-zinc-600 dark:text-zinc-300">{{ category.icono }} {{ category.nombre }}</span>
              <span class="shrink-0 font-medium tabular-nums">{{ formatCOP(category.total) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div class="h-full rounded-full bg-rose-500" :style="{ width: `${Math.max(2, (category.porcentaje ?? 0) * 100)}%` }" />
            </div>
          </div>
        </div>
      </aside>
    </div>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar movimiento' : 'Nuevo movimiento' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveMovement">
          <div class="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
            <button type="button" class="h-9 rounded-md text-sm font-medium" :class="form.tipo === 'gasto' ? 'bg-white text-rose-700 shadow-sm dark:bg-zinc-800 dark:text-rose-400' : 'text-zinc-500'" @click="form.tipo = 'gasto'; form.categoria_id = ''">Gasto</button>
            <button type="button" class="h-9 rounded-md text-sm font-medium" :class="form.tipo === 'ingreso' ? 'bg-white text-emerald-700 shadow-sm dark:bg-zinc-800 dark:text-emerald-400' : 'text-zinc-500'" @click="form.tipo = 'ingreso'; form.categoria_id = ''">Ingreso</button>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha</span>
              <input v-model="form.fecha" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto</span>
              <input v-model="form.monto" type="number" min="0" step="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Categoría</span>
            <select v-model="form.categoria_id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <option value="">Sin categoría</option>
              <option v-for="category in formCategories" :key="category.id" :value="category.id">{{ category.icono }} {{ category.nombre }}</option>
            </select>
          </label>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Descripción</span>
            <input v-model="form.descripcion" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteMovement">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
