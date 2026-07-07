<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatDate } from '../utils/format.js'

const STATUS_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes', singular: 'Pendiente' },
  { id: 'devuelto', label: 'Devueltos', singular: 'Devuelto' },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((status) => [status.id, status.singular ?? status.label]))
const STATUS_CLASSES = {
  pendiente: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  devuelto: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

const loans = ref([])
const summary = ref({
  total_pendiente: 0,
  total_devuelto: 0,
  count_pendiente: 0,
  count_devuelto: 0,
  total_prestado: 0,
})
const activeStatus = ref('todos')
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm())

const totalLoans = computed(() => Number(summary.value.count_pendiente ?? 0) + Number(summary.value.count_devuelto ?? 0))
const statusOptions = computed(() => STATUS_OPTIONS.map((status) => ({
  ...status,
  count: status.id === 'todos' ? totalLoans.value : Number(summary.value[`count_${status.id}`] ?? 0),
})))
const pendingLoans = computed(() => Number(summary.value.count_pendiente ?? 0))

function todayLocal() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function emptyForm() {
  return {
    id: null,
    persona: '',
    monto: null,
    fecha_prestamo: todayLocal(),
    estado: 'pendiente',
    fecha_devolucion: '',
    notas: '',
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadLoans() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (activeStatus.value !== 'todos') params.set('estado', activeStatus.value)
    if (search.value.trim()) params.set('q', search.value.trim())
    const data = await fetchJson(`/api/loans?${params.toString()}`)
    loans.value = data.loans
    summary.value = data.summary
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}

function statusClass(status) {
  return STATUS_CLASSES[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
}

function selectStatus(status) {
  activeStatus.value = status
  loadLoans()
}

function openNew() {
  editorError.value = ''
  form.value = emptyForm()
  editorOpen.value = true
}

function openEdit(loan) {
  editorError.value = ''
  form.value = {
    id: loan.id,
    persona: loan.persona,
    monto: loan.monto,
    fecha_prestamo: loan.fecha_prestamo,
    estado: loan.estado,
    fecha_devolucion: loan.fecha_devolucion ?? '',
    notas: loan.notas ?? '',
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

function syncReturnedDate() {
  if (form.value.estado === 'devuelto' && !form.value.fecha_devolucion) {
    form.value.fecha_devolucion = todayLocal()
  }
  if (form.value.estado === 'pendiente') {
    form.value.fecha_devolucion = ''
  }
}

async function saveLoan() {
  saving.value = true
  editorError.value = ''

  const payload = {
    persona: form.value.persona,
    monto: Number(form.value.monto),
    fecha_prestamo: form.value.fecha_prestamo,
    estado: form.value.estado,
    fecha_devolucion: form.value.estado === 'devuelto' ? form.value.fecha_devolucion || todayLocal() : null,
    notas: form.value.notas,
  }

  try {
    await fetchJson(form.value.id ? `/api/loans/${form.value.id}` : '/api/loans', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    await loadLoans()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function markReturned(loan) {
  saving.value = true
  error.value = ''
  try {
    await fetchJson(`/api/loans/${loan.id}/return`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fecha_devolucion: todayLocal() }),
    })
    await loadLoans()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteLoan() {
  if (!form.value.id || !window.confirm('¿Eliminar este préstamo?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/loans/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadLoans()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(loadLoans)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Finanzas</p>
        <h1 class="mt-1 text-2xl font-bold">Préstamos</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Plata prestada a personas y estado de devolución.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        Nuevo préstamo
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {{ error }}
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Plata en la calle</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{{ formatCOP(summary.total_pendiente) }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ pendingLoans }} pendientes</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Devuelto</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{{ formatCOP(summary.total_devuelto) }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ summary.count_devuelto ?? 0 }} cerrados</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Prestado histórico</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ formatCOP(summary.total_prestado) }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">pendiente + devuelto</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Registros</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ totalLoans }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">personas y préstamos</p>
      </div>
    </div>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex gap-2 overflow-x-auto">
          <button
            v-for="status in statusOptions"
            :key="status.id"
            type="button"
            class="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeStatus === status.id
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectStatus(status.id)"
          >
            {{ status.label }} <span class="ml-1 text-xs opacity-70">{{ status.count }}</span>
          </button>
        </div>

        <form class="flex gap-2" @submit.prevent="loadLoans">
          <input
            v-model="search"
            type="search"
            class="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:w-64"
            placeholder="Buscar persona"
          >
          <button type="submit" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
            Buscar
          </button>
        </form>
      </div>

      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando préstamos...</div>
      <div v-else-if="!loans.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay préstamos en esta vista.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div
          v-for="loan in loans"
          :key="loan.id"
          role="button"
          tabindex="0"
          class="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 lg:grid-cols-[1fr_180px_180px]"
          @click="openEdit(loan)"
          @keydown.enter="openEdit(loan)"
        >
          <span class="min-w-0">
            <span class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ loan.persona }}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusClass(loan.estado)">
                {{ statusLabel(loan.estado) }}
              </span>
            </span>
            <span class="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
              Prestado: {{ formatDate(loan.fecha_prestamo) }}
              <span v-if="loan.fecha_devolucion"> · Devuelto: {{ formatDate(loan.fecha_devolucion) }}</span>
            </span>
            <span v-if="loan.notas" class="mt-1 block truncate text-xs text-zinc-400">{{ loan.notas }}</span>
          </span>

          <span class="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 lg:text-right">
            {{ formatCOP(loan.monto) }}
          </span>

          <span class="flex items-center gap-2 lg:justify-end">
            <span v-if="loan.estado === 'devuelto'" class="text-xs font-medium text-emerald-700 dark:text-emerald-400">Cerrado</span>
            <button
              v-else
              type="button"
              class="h-9 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
              :disabled="saving"
              @click.stop="markReturned(loan)"
            >
              Marcar devuelto
            </button>
          </span>
        </div>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar préstamo' : 'Nuevo préstamo' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveLoan">
          <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Persona</span>
              <input v-model="form.persona" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto</span>
              <input v-model.number="form.monto" type="number" min="0" step="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-right text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha préstamo</span>
              <input v-model="form.fecha_prestamo" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estado</span>
              <select v-model="form.estado" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @change="syncReturnedDate">
                <option value="pendiente">Pendiente</option>
                <option value="devuelto">Devuelto</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha devolución</span>
              <input v-model="form.fecha_devolucion" type="date" :disabled="form.estado === 'pendiente'" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-800">
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="form.notas" rows="4" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteLoan">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
