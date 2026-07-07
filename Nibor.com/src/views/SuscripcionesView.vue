<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, monthName } from '../utils/format.js'

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const subscriptions = ref([])
const categories = ref([])
const cards = ref([])
const historyOpen = ref(false)
const historyLoading = ref(false)
const historyYear = ref(now.getFullYear())
const history = ref(null)
const loading = ref(false)
const saving = ref(false)
const applying = ref(false)
const loadingRate = ref(false)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm())

const formCategories = computed(() => categories.value.filter((category) => category.tipo === form.value.tipo))
const monthLabel = computed(() => monthName(selectedMonth.value, selectedYear.value))
const activeSubs = computed(() => subscriptions.value.filter((subscription) => Number(subscription.activa) === 1))
const activeGastos = computed(() => activeSubs.value
  .filter((s) => s.tipo !== 'ingreso')
  .reduce((sum, s) => sum + Number(s.monto ?? 0), 0))
const activeIngresos = computed(() => activeSubs.value
  .filter((s) => s.tipo === 'ingreso')
  .reduce((sum, s) => sum + Number(s.monto ?? 0), 0))
const activeGastosCount = computed(() => activeSubs.value.filter((s) => s.tipo !== 'ingreso').length)
const fixedBalance = computed(() => activeIngresos.value - activeGastos.value)
const fixedBalanceStatus = computed(() => fixedBalance.value >= 0 ? 'Disponible después de fijos' : 'Faltante para cubrir fijos')
const incomeSubscriptions = computed(() => subscriptions.value.filter((subscription) => subscription.tipo === 'ingreso'))

const incomePresets = [
  {
    id: 'salary',
    title: 'Salario',
    name: 'Salario',
    categoryName: 'Salario',
    description: 'Ingreso mensual del trabajo.',
  },
  {
    id: 'rent',
    title: 'Arriendo apartamento',
    name: 'Arriendo apartamento',
    categoryName: 'Arriendo recibido',
    description: 'Pago mensual del apartamento en arriendo.',
  },
]

function emptyForm(tipo = 'gasto') {
  return {
    id: null,
    nombre: '',
    monto: '',
    moneda: 'COP',
    monto_original: '',
    tasa_cambio: '',
    margen_tasa_pct: 0,
    tasa_cambio_fecha: '',
    dia_cobro: 1,
    categoria_id: '',
    activa: true,
    tipo,
    automatica: true,
    card_id: '',
  }
}

function estimateCopFromForm() {
  const amount = Number(form.value.monto_original || 0)
  const rate = Number(form.value.tasa_cambio || 0)
  const margin = Number(form.value.margen_tasa_pct || 0)
  if (form.value.moneda !== 'USD' || amount <= 0 || rate <= 0) return 0
  return amount * rate * (1 + margin / 100)
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
    const [subscriptionsData, categoriesData, cardsData] = await Promise.all([
      fetchJson('/api/subscriptions'),
      fetchJson('/api/categories'),
      fetchJson('/api/cards'),
    ])
    subscriptions.value = subscriptionsData
    categories.value = categoriesData
    cards.value = cardsData
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
}

function setCurrentMonth() {
  selectedYear.value = now.getFullYear()
  selectedMonth.value = now.getMonth() + 1
}

function openNew(tipo = 'gasto') {
  editorError.value = ''
  form.value = emptyForm(tipo)
  editorOpen.value = true
}

function incomePresetCategory(preset) {
  return categories.value.find((category) => category.tipo === 'ingreso' && category.nombre === preset.categoryName)
}

function openIncomePreset(preset) {
  const category = incomePresetCategory(preset)
  editorError.value = ''
  form.value = {
    ...emptyForm('ingreso'),
    nombre: preset.name,
    categoria_id: category?.id ?? '',
  }
  editorOpen.value = true
}

function openEdit(subscription) {
  editorError.value = ''
  form.value = {
    id: subscription.id,
    nombre: subscription.nombre,
    monto: subscription.monto,
    moneda: subscription.moneda ?? 'COP',
    monto_original: subscription.monto_original ?? subscription.monto,
    tasa_cambio: subscription.tasa_cambio ?? '',
    margen_tasa_pct: subscription.margen_tasa_pct ?? 0,
    tasa_cambio_fecha: subscription.tasa_cambio_fecha ?? '',
    dia_cobro: subscription.dia_cobro,
    categoria_id: subscription.categoria_id ?? '',
    activa: Number(subscription.activa) === 1,
    tipo: subscription.tipo ?? 'gasto',
    automatica: Number(subscription.automatica ?? 1) === 1,
    card_id: subscription.card_id ?? '',
  }
  editorOpen.value = true
}

async function loadHistory() {
  historyLoading.value = true
  try {
    history.value = await fetchJson(`/api/subscriptions/history?anio=${historyYear.value}`)
  } catch (err) {
    error.value = err.message
  } finally {
    historyLoading.value = false
  }
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value && !history.value) loadHistory()
}

function shiftHistoryYear(delta) {
  historyYear.value += delta
  loadHistory()
}

function desdeLabel(desde) {
  if (!desde) return 'sin aplicar aún'
  const [y, m] = desde.split('-').map(Number)
  return `${monthName(m)} ${y}`
}

function celdaTitle(sub, celda, i) {
  const mes = monthName(i + 1)
  if (celda.estado === 'hueco') return `${mes}: sin pago registrado — posible mora o mes sin cargar`
  if (celda.monto === null) return ''
  const base = `${mes}: ${formatCOP(celda.monto)}${celda.pagos > 1 ? ` en ${celda.pagos} pagos` : ''}`
  if (celda.estado === 'alerta') return `${base} — difiere del fijo esperado (${formatCOP(sub.monto_actual)})`
  return base
}

function onTipoChange() {
  // la categoría debe coincidir con el tipo; al cambiarlo se limpia
  form.value.categoria_id = ''
}

function onCurrencyChange() {
  if (form.value.moneda === 'USD') {
    form.value.monto_original = form.value.monto_original || form.value.monto
  } else {
    form.value.monto = form.value.monto || form.value.monto_original
    form.value.tasa_cambio = ''
    form.value.tasa_cambio_fecha = ''
    form.value.margen_tasa_pct = 0
  }
}

function subscriptionCurrencyText(subscription) {
  if ((subscription.moneda ?? 'COP') !== 'USD') return null
  const margin = Number(subscription.margen_tasa_pct ?? 0)
  const marginText = margin > 0 ? ` + ${margin.toLocaleString('es-CO', { maximumFractionDigits: 2 })}% banco` : ''
  return `US$ ${Number(subscription.monto_original ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · TRM ${Number(subscription.tasa_cambio ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}${marginText}`
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

async function useCurrentUsdRate() {
  loadingRate.value = true
  editorError.value = ''
  try {
    const data = await fetchJson('/api/exchange-rates/usd-cop')
    form.value.tasa_cambio = data.tasa
    form.value.tasa_cambio_fecha = data.vigencia_desde
  } catch (err) {
    editorError.value = err.message
  } finally {
    loadingRate.value = false
  }
}

async function saveSubscription() {
  saving.value = true
  editorError.value = ''

  const payload = {
    nombre: form.value.nombre,
    monto: form.value.moneda === 'USD' ? undefined : Number(form.value.monto),
    moneda: form.value.moneda,
    monto_original: form.value.moneda === 'USD' ? Number(form.value.monto_original) : Number(form.value.monto),
    tasa_cambio: form.value.moneda === 'USD' ? Number(form.value.tasa_cambio) : null,
    margen_tasa_pct: form.value.moneda === 'USD' ? Number(form.value.margen_tasa_pct || 0) : 0,
    tasa_cambio_fecha: form.value.moneda === 'USD' ? form.value.tasa_cambio_fecha : null,
    dia_cobro: Number(form.value.dia_cobro),
    categoria_id: form.value.categoria_id === '' ? null : Number(form.value.categoria_id),
    activa: form.value.activa,
    tipo: form.value.tipo,
    automatica: form.value.automatica,
    card_id: form.value.card_id === '' ? null : Number(form.value.card_id),
  }

  try {
    await fetchJson(form.value.id ? `/api/subscriptions/${form.value.id}` : '/api/subscriptions', {
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

async function toggleSubscription(subscription) {
  try {
    await fetchJson(`/api/subscriptions/${subscription.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activa: Number(subscription.activa) !== 1 }),
    })
    await loadData()
  } catch (err) {
    error.value = err.message
  }
}

async function deleteSubscription() {
  if (!form.value.id || !window.confirm('¿Eliminar esta suscripción?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/subscriptions/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadData()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function applySubscriptions() {
  applying.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await fetchJson(`/api/subscriptions/apply?anio=${selectedYear.value}&mes=${selectedMonth.value}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    notice.value = `Aplicadas: ${data.created.length}. Ya existían: ${data.skipped.length}.`
  } catch (err) {
    error.value = err.message
  } finally {
    applying.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Suscripciones y fijos</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Todo lo que entra y sale cada mes: suscripciones, recibos fijos, salario, arriendos…</p>
      </div>

      <div class="flex gap-2">
        <button type="button" class="h-10 rounded-lg border border-emerald-200 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950" @click="openNew('ingreso')">
          Nuevo ingreso fijo
        </button>
        <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" @click="openNew('gasto')">
          Nuevo gasto fijo
        </button>
      </div>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <section v-if="!loading && !incomeSubscriptions.length" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/50">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Configura tus ingresos fijos</h2>
          <p class="mt-1 text-sm text-emerald-800/80 dark:text-emerald-200/80">Elige un preset, escribe el monto y el dia de pago. Despues podras aplicarlo cada mes.</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:min-w-[28rem]">
          <button
            v-for="preset in incomePresets"
            :key="preset.id"
            type="button"
            class="rounded-lg border border-emerald-200 bg-white p-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-900 dark:hover:border-emerald-600 dark:hover:bg-emerald-950"
            @click="openIncomePreset(preset)"
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs dark:bg-emerald-900">{{ incomePresetCategory(preset)?.icono ?? '+' }}</span>
              {{ preset.title }}
            </span>
            <span class="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{{ preset.description }}</span>
          </button>
        </div>
      </div>
    </section>

    <div class="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_2fr]">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Ingresos fijos / mes</p>
        <p class="mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-400">{{ formatCOP(activeIngresos) }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Gastos fijos / mes ({{ activeGastosCount }} activos)</p>
        <p class="mt-2 text-xl font-bold text-rose-700 dark:text-rose-400">{{ formatCOP(activeGastos) }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Diferencia fija / mes</p>
        <p
          class="mt-2 text-xl font-bold tabular-nums"
          :class="fixedBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'"
        >
          {{ formatCOP(fixedBalance) }}
        </p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ fixedBalanceStatus }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Aplicar a</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" class="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="shiftMonth(-1)">‹</button>
          <div class="flex h-9 min-w-36 items-center justify-center rounded-lg border border-zinc-200 px-3 text-sm font-semibold dark:border-zinc-800">{{ monthLabel }}</div>
          <button type="button" class="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="shiftMonth(1)">›</button>
          <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="setCurrentMonth">Actual</button>
          <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="applying" @click="applySubscriptions">
            {{ applying ? 'Aplicando…' : 'Aplicar' }}
          </button>
        </div>
      </div>
    </div>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-200 px-4 py-3 text-sm font-semibold dark:border-zinc-800">Lista</div>
      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando…</div>
      <div v-else-if="!subscriptions.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay suscripciones.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div v-for="subscription in subscriptions" :key="subscription.id" class="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <button type="button" class="min-w-0 text-left" @click="openEdit(subscription)">
            <span class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <span class="truncate">{{ subscription.nombre }}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="subscription.tipo === 'ingreso' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400'">{{ subscription.tipo === 'ingreso' ? 'ingreso' : 'gasto' }}</span>
              <span v-if="Number(subscription.automatica ?? 1) === 0" class="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400" title="No se debita sola: te la recordamos cada mes hasta que la registres">pago manual</span>
            </span>
            <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">
              Día {{ subscription.dia_cobro }} · {{ subscription.categoria_icono ?? '' }} {{ subscription.categoria_nombre ?? 'Sin categoría' }}
              <template v-if="subscription.card_nombre"> · 💳 {{ subscription.card_nombre }}</template>
            </span>
            <span v-if="subscriptionCurrencyText(subscription)" class="mt-0.5 block truncate text-xs text-zinc-400">{{ subscriptionCurrencyText(subscription) }}</span>
          </button>
          <div class="text-sm font-semibold tabular-nums" :class="subscription.tipo === 'ingreso' ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'">{{ formatCOP(subscription.monto) }}</div>
          <button
            type="button"
            class="flex h-8 w-16 items-center rounded-full p-1 transition"
            :class="Number(subscription.activa) === 1 ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'"
            :title="Number(subscription.activa) === 1 ? 'Activa' : 'Inactiva'"
            @click="toggleSubscription(subscription)"
          >
            <span class="h-6 w-6 rounded-full bg-white shadow transition" :class="Number(subscription.activa) === 1 ? 'translate-x-8' : 'translate-x-0'" />
          </button>
        </div>
      </div>
    </section>

    <!-- Total por tarjeta -->
    <section v-if="cards.length" class="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p class="text-sm font-semibold">Por tarjeta</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <div v-for="card in cards" :key="card.id" class="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700" :class="Number(card.activa) === 1 ? '' : 'opacity-50'">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: card.color }" />
          <span class="font-medium">💳 {{ card.nombre }}</span>
          <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ formatCOP(card.total_mensual) }}/mes · {{ card.suscripciones }} fijos</span>
        </div>
      </div>
      <p class="mt-2 text-xs text-zinc-400 dark:text-zinc-500">Las tarjetas se administran en Configuración (solo nombre — nunca guardes el número).</p>
    </section>

    <!-- Histórico -->
    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button type="button" class="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="toggleHistory">
        <span>
          <span class="text-sm font-semibold">Histórico de fijos</span>
          <span class="ml-2 text-xs text-zinc-500 dark:text-zinc-400">desde cuándo existe cada uno y cuánto has pagado</span>
        </span>
        <span class="text-zinc-400">{{ historyOpen ? '▴' : '▾' }}</span>
      </button>

      <div v-if="historyOpen" class="border-t border-zinc-200 dark:border-zinc-800">
        <div class="flex items-center gap-2 px-4 py-3">
          <button type="button" class="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="shiftHistoryYear(-1)">‹</button>
          <span class="min-w-16 text-center text-sm font-semibold">{{ historyYear }}</span>
          <button type="button" class="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="shiftHistoryYear(1)">›</button>
        </div>

        <div v-if="historyLoading" class="p-8 text-center text-sm text-zinc-400">Cargando…</div>
        <div v-else-if="history" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th class="px-4 py-2 text-left">Fijo</th>
                <th class="px-2 py-2 text-left">Desde</th>
                <th v-for="m in 12" :key="m" class="px-1 py-2 text-center">{{ monthName(m).slice(0, 1) }}</th>
                <th class="px-4 py-2 text-right">Total {{ historyYear }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr v-for="sub in history.subs" :key="sub.id" :class="Number(sub.activa) === 1 ? '' : 'opacity-50'">
                <td class="max-w-40 truncate px-4 py-2 font-medium">{{ sub.categoria_icono ?? '' }} {{ sub.nombre }}</td>
                <td class="whitespace-nowrap px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">{{ desdeLabel(sub.desde) }}</td>
                <td v-for="(celda, i) in sub.meses" :key="i" class="px-1 py-2 text-center">
                  <span v-if="celda.estado === 'ok'" class="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" :title="celdaTitle(sub, celda, i)" />
                  <span v-else-if="celda.estado === 'alerta'" class="cursor-help text-sm leading-none" :title="celdaTitle(sub, celda, i)">⚠️</span>
                  <span v-else-if="celda.estado === 'hueco'" class="inline-block h-2.5 w-2.5 cursor-help rounded-full border-2 border-amber-500" :title="celdaTitle(sub, celda, i)" />
                  <span v-else class="text-zinc-300 dark:text-zinc-700">·</span>
                </td>
                <td class="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums" :class="sub.tipo === 'ingreso' ? 'text-emerald-700 dark:text-emerald-400' : ''">{{ sub.total_anio ? formatCOP(sub.total_anio) : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> pago normal</span>
            <span class="flex items-center gap-1.5">⚠️ monto inusual o varios pagos (mora, ajustes)</span>
            <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500" /> mes sin pago entre pagos (posible mora)</span>
            <span class="flex items-center gap-1.5"><span class="text-zinc-300 dark:text-zinc-700">·</span> sin datos</span>
          </div>
          <p class="px-4 pb-3 text-xs text-zinc-400 dark:text-zinc-500">El histórico se construye con los meses donde el fijo fue aplicado (botón Aplicar o cierre de mes). Para registrar meses viejos, navega al mes en "Aplicar a" y aplícalo, o pásame el historial y lo cargo.</p>
        </div>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar recurrente' : form.tipo === 'ingreso' ? 'Nuevo ingreso fijo' : 'Nuevo gasto fijo' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveSubscription">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="form.nombre" type="text" :placeholder="form.tipo === 'ingreso' ? 'p. ej. Salario, Arriendo apto' : 'p. ej. Netflix, Recibo luz'" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="form.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @change="onTipoChange">
                <option value="gasto">Gasto fijo</option>
                <option value="ingreso">Ingreso fijo</option>
              </select>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto</span>
              <input v-if="form.moneda === 'COP'" v-model="form.monto" type="number" min="0" step="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <input v-else v-model="form.monto_original" type="number" min="0" step="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="20">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Moneda</span>
              <select v-model="form.moneda" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @change="onCurrencyChange">
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>

          <div v-if="form.moneda === 'USD'" class="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">TRM USD/COP</span>
              <div class="flex gap-2">
                <input v-model="form.tasa_cambio" type="number" min="1" step="0.01" class="h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Ej. 3334.93">
                <button type="button" class="h-10 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" :disabled="loadingRate" @click="useCurrentUsdRate">
                  {{ loadingRate ? '...' : 'Actual' }}
                </button>
              </div>
              <span v-if="form.tasa_cambio_fecha" class="text-xs font-normal text-zinc-400">TRM vigente desde {{ form.tasa_cambio_fecha }}</span>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Margen banco %</span>
              <input v-model="form.margen_tasa_pct" type="number" min="0" step="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="0">
              <span class="text-xs font-normal text-zinc-400">Opcional si tu banco cobra por encima de la TRM.</span>
            </label>
            <div class="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 sm:col-span-2">
              Estimado mensual: <strong class="tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCOP(estimateCopFromForm()) }}</strong>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Día de cobro</span>
              <input v-model="form.dia_cobro" type="number" min="1" max="31" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label v-if="form.tipo === 'gasto'" class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tarjeta / medio de pago</span>
              <select v-model="form.card_id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="">Sin tarjeta</option>
                <option v-for="card in cards.filter((x) => Number(x.activa) === 1)" :key="card.id" :value="card.id">💳 {{ card.nombre }}</option>
              </select>
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Categoría</span>
            <select v-model="form.categoria_id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <option value="">Sin categoría</option>
              <option v-for="category in formCategories" :key="category.id" :value="category.id">{{ category.icono }} {{ category.nombre }}</option>
            </select>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="form.activa" type="checkbox" class="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500">
              Activa
            </label>
            <label class="flex items-start gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="form.automatica" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500">
              <span>
                {{ form.tipo === 'ingreso' ? 'Llega solo (automático)' : 'Débito automático' }}
                <span class="block text-xs font-normal text-zinc-400">Si lo desmarcas, te lo recordamos cada mes hasta que lo registres</span>
              </span>
            </label>
          </div>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteSubscription">Eliminar</button>
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
