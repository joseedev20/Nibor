<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatDate, monthName } from '../utils/format.js'

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const cards = ref([])
const movements = ref([])
const cardFilter = ref('')
const loading = ref(false)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const saving = ref(false)
const form = ref(emptyForm())

const monthLabel = computed(() => monthName(selectedMonth.value, selectedYear.value))
// Solo gastos (no ingresos) por tarjeta/cuenta, para el mes seleccionado —
// es lo que la tarjeta realmente "gastó", aparte de los fijos recurrentes.
const expensesByCard = computed(() => {
  const map = new Map()
  for (const movement of movements.value) {
    if (movement.tipo !== 'gasto' || movement.card_id === null || movement.card_id === undefined) continue
    const cardId = Number(movement.card_id)
    if (!map.has(cardId)) map.set(cardId, { total: 0, items: [] })
    const entry = map.get(cardId)
    entry.total += Number(movement.monto ?? 0)
    entry.items.push(movement)
  }
  return map
})

function cardExpensesTotal(cardId) {
  return expensesByCard.value.get(Number(cardId))?.total ?? 0
}

// Historial filtrable de abajo: todos los gastos del mes, o solo los de la
// tarjeta/cuenta elegida en el <select>.
const filteredMovements = computed(() => {
  return movements.value.filter((movement) => {
    if (movement.tipo !== 'gasto') return false
    if (cardFilter.value === '') return true
    return Number(movement.card_id) === Number(cardFilter.value)
  })
})

const filteredTotal = computed(() => filteredMovements.value.reduce((sum, m) => sum + Number(m.monto ?? 0), 0))

function selectCardFilter(cardId) {
  cardFilter.value = cardFilter.value === cardId ? '' : cardId
  document.getElementById('historial-gastos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const TIPOS = [
  { value: 'credito', label: 'Tarjeta de crédito' },
  { value: 'debito', label: 'Tarjeta de débito' },
  { value: 'cuenta', label: 'Cuenta bancaria' },
]

function tipoLabel(tipo) {
  return TIPOS.find((t) => t.value === tipo)?.label ?? tipo
}

function tipoIcon(tipo) {
  return tipo === 'cuenta' ? '🏦' : '💳'
}

function emptyForm() {
  return {
    id: null,
    nombre: '',
    tipo: 'credito',
    entidad: '',
    ultimos_digitos: '',
    cupo: '',
    color: '#2563eb',
    activa: true,
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadCards() {
  loading.value = true
  error.value = ''
  try {
    cards.value = await fetchJson('/api/cards')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadMovements() {
  try {
    movements.value = await fetchJson(`/api/movements?anio=${selectedYear.value}&mes=${selectedMonth.value}`)
  } catch (err) {
    error.value = err.message
  }
}

function shiftMonth(delta) {
  const date = new Date(selectedYear.value, selectedMonth.value - 1 + delta, 1)
  selectedYear.value = date.getFullYear()
  selectedMonth.value = date.getMonth() + 1
  loadMovements()
}

function setCurrentMonth() {
  selectedYear.value = now.getFullYear()
  selectedMonth.value = now.getMonth() + 1
  loadMovements()
}

function openNew() {
  editorError.value = ''
  form.value = emptyForm()
  editorOpen.value = true
}

function openEdit(card) {
  editorError.value = ''
  form.value = {
    id: card.id,
    nombre: card.nombre,
    tipo: card.tipo ?? 'credito',
    entidad: card.entidad ?? '',
    ultimos_digitos: card.ultimos_digitos ?? '',
    cupo: card.cupo ?? '',
    color: card.color ?? '#2563eb',
    activa: Number(card.activa) === 1,
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

async function saveCard() {
  saving.value = true
  editorError.value = ''
  notice.value = ''

  const payload = {
    nombre: form.value.nombre,
    tipo: form.value.tipo,
    entidad: form.value.entidad || null,
    ultimos_digitos: form.value.ultimos_digitos || null,
    cupo: form.value.cupo === '' ? null : Number(form.value.cupo),
    color: form.value.color,
    activa: form.value.activa,
  }

  try {
    await fetchJson(form.value.id ? `/api/cards/${form.value.id}` : '/api/cards', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    notice.value = form.value.id ? 'Tarjeta actualizada.' : 'Tarjeta creada. Ya se puede detectar sola en los gastos capturados por mensaje.'
    await loadCards()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteCard() {
  if (!form.value.id || !window.confirm('¿Eliminar esta tarjeta? Solo se puede si no tiene fijos ni gastos asociados.')) return
  saving.value = true
  editorError.value = ''
  notice.value = ''

  try {
    await fetchJson(`/api/cards/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    notice.value = 'Tarjeta eliminada.'
    await loadCards()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function toggleCard(card) {
  error.value = ''
  notice.value = ''
  try {
    await fetchJson(`/api/cards/${card.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activa: Number(card.activa) !== 1 }),
    })
    await loadCards()
  } catch (err) {
    error.value = err.message
  }
}

onMounted(() => {
  loadCards()
  loadMovements()
})
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Tarjetas</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tus tarjetas y cuentas bancarias. Con los últimos 4 dígitos, Nibor detecta sola con cuál fue cada gasto capturado desde un mensaje de Bancolombia.
        </p>
      </div>
      <button type="button" class="h-10 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        + Nueva tarjeta o cuenta
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Mes anterior" @click="shiftMonth(-1)">‹</button>
      <div class="flex h-10 min-w-40 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">
        {{ monthLabel }}
      </div>
      <button type="button" class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Mes siguiente" @click="shiftMonth(1)">›</button>
      <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" @click="setCurrentMonth">Actual</button>
      <span class="text-xs text-zinc-400 dark:text-zinc-500">Los montos y gastos de abajo son de {{ monthLabel }}.</span>
    </div>

    <section class="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando…</div>
      <div v-else-if="!cards.length" class="p-8 text-center text-sm text-zinc-400">Aún no has agregado ninguna tarjeta o cuenta.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div v-for="card in cards" :key="card.id">
          <div class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <button type="button" class="flex flex-1 items-center gap-3 text-left" @click="openEdit(card)">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base" :style="{ backgroundColor: `${card.color}22` }">{{ tipoIcon(card.tipo) }}</span>
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="truncate text-sm font-medium" :class="Number(card.activa) === 1 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through dark:text-zinc-500'">{{ card.nombre }}</span>
                  <span class="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{{ tipoLabel(card.tipo) }}</span>
                </span>
                <span class="block text-xs text-zinc-500 dark:text-zinc-400">
                  <template v-if="card.entidad">{{ card.entidad }} · </template>
                  <template v-if="card.ultimos_digitos">•••• {{ card.ultimos_digitos }}</template>
                  <template v-else>sin últimos dígitos — no se detectará sola</template>
                  <template v-if="card.tipo === 'credito' && card.cupo"> · cupo {{ formatCOP(card.cupo) }}</template>
                </span>
                <span class="block text-xs text-zinc-400 dark:text-zinc-500">{{ card.suscripciones ?? 0 }} fijos asociados · {{ formatCOP(card.total_mensual ?? 0) }}/mes en fijos</span>
              </span>
            </button>
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-zinc-50 sm:justify-end dark:hover:bg-zinc-800/60"
              :class="cardFilter === card.id ? 'ring-1 ring-emerald-500' : ''"
              title="Ver en el historial de abajo"
              @click="selectCardFilter(card.id)"
            >
              <span class="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">{{ formatCOP(cardExpensesTotal(card.id)) }}</span>
              <span class="text-xs text-zinc-400">gastado en {{ monthLabel }}</span>
            </button>
            <button
              type="button"
              class="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition"
              :class="Number(card.activa) === 1 ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'"
              :title="Number(card.activa) === 1 ? 'Desactivar' : 'Reactivar'"
              @click="toggleCard(card)"
            >
              {{ Number(card.activa) === 1 ? 'Activa' : 'Inactiva' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section id="historial-gastos" class="mt-3 scroll-mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Historial de gastos</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ monthLabel }}</p>
        </div>
        <div class="flex items-center gap-3">
          <select v-model="cardFilter" class="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            <option value="">Todas las tarjetas</option>
            <option v-for="card in cards" :key="card.id" :value="card.id">
              {{ card.tipo === 'cuenta' ? '🏦' : '💳' }} {{ card.nombre }}
            </option>
          </select>
          <span class="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">{{ formatCOP(filteredTotal) }}</span>
        </div>
      </div>
      <div v-if="!filteredMovements.length" class="p-8 text-center text-sm text-zinc-400">Sin gastos en {{ monthLabel }}.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div v-for="movement in filteredMovements" :key="movement.id" class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50 text-sm dark:bg-zinc-800">{{ movement.categoria_icono ?? '·' }}</span>
          <span class="min-w-0">
            <span class="block truncate text-sm text-zinc-800 dark:text-zinc-200">{{ movement.descripcion || movement.categoria_nombre || 'Sin descripción' }}</span>
            <span class="block text-xs text-zinc-500 dark:text-zinc-400">
              {{ formatDate(movement.fecha) }} · {{ movement.categoria_nombre ?? 'Sin categoría' }}
              <template v-if="movement.card_nombre"> · {{ movement.card_ultimos_digitos ? '💳' : '' }} {{ movement.card_nombre }}{{ movement.card_ultimos_digitos ? ` *${movement.card_ultimos_digitos}` : '' }}</template>
            </span>
          </span>
          <span class="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">{{ formatCOP(movement.monto) }}</span>
        </div>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar tarjeta' : 'Nueva tarjeta o cuenta' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveCard">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre identificador</span>
            <input v-model="form.nombre" type="text" placeholder="p. ej. Nu crédito, Bancolombia ahorros" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="form.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="tipo in TIPOS" :key="tipo.value" :value="tipo.value">{{ tipo.label }}</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Entidad</span>
              <input v-model="form.entidad" type="text" placeholder="p. ej. Bancolombia, Nu" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Últimos 4 dígitos</span>
              <input v-model="form.ultimos_digitos" type="text" inputmode="numeric" maxlength="4" pattern="\d{4}" placeholder="9317" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <span class="text-xs font-normal text-zinc-400">Los que muestra el banco en cada notificación — así Nibor detecta sola con cuál fue el gasto.</span>
            </label>
            <label v-if="form.tipo === 'credito'" class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Cupo</span>
              <input v-model="form.cupo" type="number" min="0" step="0.01" placeholder="Opcional" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Color</span>
              <input v-model="form.color" type="color" class="h-10 rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <label class="flex items-end gap-2 pb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="form.activa" type="checkbox" class="h-4 w-4 accent-emerald-600">
              Activa
            </label>
          </div>

          <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Solo los últimos 4 dígitos. Nunca escribas el número completo, la fecha de vencimiento ni el CVV.
          </div>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteCard">Eliminar</button>
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
