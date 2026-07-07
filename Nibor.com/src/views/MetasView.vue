<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatPct } from '../utils/format.js'

const goals = ref([])
const platforms = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editorError = ref('')
const editorOpen = ref(false)
const form = ref(emptyForm())

const activeGoals = computed(() => goals.value.filter((goal) => Number(goal.activa) === 1))
const totalTarget = computed(() => activeGoals.value.reduce((sum, goal) => sum + Number(goal.monto_objetivo ?? 0), 0))
const totalCurrent = computed(() => activeGoals.value.reduce((sum, goal) => sum + Number(goal.monto_actual ?? 0), 0))
const targetAmount = computed(() => Number(form.value.monto_objetivo || 0))
const assignedAmount = computed(() => form.value.allocations.reduce((sum, allocation) => sum + allocationAmount(allocation), 0))
const assignedPct = computed(() => targetAmount.value > 0 ? assignedAmount.value / targetAmount.value : 0)
const unassignedAmount = computed(() => Math.max(targetAmount.value - assignedAmount.value, 0))

function emptyForm() {
  return {
    id: null,
    nombre: '',
    monto_objetivo: '',
    activa: true,
    allocation_mode: 'amount',
    allocations: [],
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadGoals() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchJson('/api/goals')
    goals.value = data.goals
    platforms.value = data.platforms
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function buildAllocationForm(goal = null) {
  return platforms.value.map((platform) => {
    const current = goal?.allocations.find((allocation) => allocation.platform_id === platform.platform_id)
    return {
      platform_id: platform.platform_id,
      monto_asignado: current?.monto_asignado ?? current?.objetivo_fuente ?? '',
      porcentaje: current?.porcentaje ?? '',
    }
  })
}

function openNew() {
  editorError.value = ''
  form.value = {
    ...emptyForm(),
    allocations: buildAllocationForm(),
  }
  editorOpen.value = true
}

function openEdit(goal) {
  editorError.value = ''
  form.value = {
    id: goal.id,
    nombre: goal.nombre,
    monto_objetivo: goal.monto_objetivo,
    activa: Number(goal.activa) === 1,
    allocation_mode: 'amount',
    allocations: buildAllocationForm(goal),
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

function platformFor(platformId) {
  return platforms.value.find((platform) => platform.platform_id === platformId)
}

function progressWidth(goal) {
  return `${Math.min(Number(goal.progreso ?? 0), 1) * 100}%`
}

function goalTone(goal) {
  if (Number(goal.progreso ?? 0) >= 1) return 'text-emerald-700 dark:text-emerald-400'
  return 'text-zinc-900 dark:text-zinc-100'
}

function allocationAmount(allocation) {
  if (form.value.allocation_mode === 'percent') {
    return targetAmount.value * (Number(allocation.porcentaje || 0) / 100)
  }
  return Number(allocation.monto_asignado || 0)
}

function allocationPayload(allocation) {
  if (form.value.allocation_mode === 'percent') {
    return {
      platform_id: allocation.platform_id,
      porcentaje: Number(allocation.porcentaje),
    }
  }

  return {
    platform_id: allocation.platform_id,
    monto_asignado: Number(allocation.monto_asignado),
  }
}

async function saveGoal() {
  saving.value = true
  editorError.value = ''

  if (assignedAmount.value > targetAmount.value) {
    editorError.value = 'La suma asignada no puede superar el monto objetivo'
    saving.value = false
    return
  }

  const payload = {
    nombre: form.value.nombre,
    monto_objetivo: Number(form.value.monto_objetivo),
    activa: form.value.activa,
    allocations: form.value.allocations
      .filter((allocation) => {
        const value = form.value.allocation_mode === 'percent'
          ? Number(allocation.porcentaje || 0)
          : Number(allocation.monto_asignado || 0)
        return value > 0
      })
      .map(allocationPayload),
  }

  try {
    await fetchJson(form.value.id ? `/api/goals/${form.value.id}` : '/api/goals', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    await loadGoals()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteGoal() {
  if (!form.value.id || !window.confirm('Eliminar esta meta?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/goals/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadGoals()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(loadGoals)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Metas</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Objetivos grandes y de dónde saldrá la plata.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        Nueva meta
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>

    <div class="mt-6 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Metas activas</p>
        <p class="mt-2 text-xl font-bold">{{ activeGoals.length }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Objetivo total</p>
        <p class="mt-2 text-xl font-bold tabular-nums">{{ formatCOP(totalTarget) }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Disponible para metas</p>
        <p class="mt-2 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{{ formatCOP(totalCurrent) }}</p>
      </div>
    </div>

    <div v-if="loading" class="mt-8 p-12 text-center text-sm text-zinc-400">Cargando...</div>

    <div v-else-if="!goals.length" class="mt-8 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h2 class="text-base font-semibold">Aún no tienes metas</h2>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Crea una meta como moto nueva, viaje, inicial de vivienda o fondo de emergencia.</p>
      <button type="button" class="mt-4 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">Crear primera meta</button>
    </div>

    <div v-else class="mt-6 grid gap-4 xl:grid-cols-2">
      <article v-for="goal in goals" :key="goal.id" class="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-bold">{{ goal.nombre }}</h2>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="Number(goal.activa) === 1 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'">
                {{ Number(goal.activa) === 1 ? 'activa' : 'pausada' }}
              </span>
            </div>
            <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Meta: {{ formatCOP(goal.monto_objetivo) }}</p>
          </div>
          <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openEdit(goal)">
            Editar
          </button>
        </div>

        <div class="mt-5">
          <div class="flex items-end justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Progreso</p>
              <p class="mt-1 text-2xl font-bold tabular-nums" :class="goalTone(goal)">{{ formatPct(goal.progreso) }}</p>
            </div>
            <div class="text-right text-sm tabular-nums">
              <p class="font-semibold text-emerald-700 dark:text-emerald-400">{{ formatCOP(goal.monto_actual) }}</p>
              <p class="text-zinc-500 dark:text-zinc-400">faltan {{ formatCOP(goal.monto_faltante) }}</p>
            </div>
          </div>
          <div class="mt-3 h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div class="h-full rounded-full bg-emerald-500 transition-all" :style="{ width: progressWidth(goal) }" />
          </div>
        </div>

        <div class="mt-5 space-y-2">
          <div v-for="allocation in goal.allocations" :key="`${goal.id}-${allocation.platform_id}`" class="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="flex min-w-0 items-center gap-2 font-medium">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: allocation.plataforma_color }" />
                <span class="truncate">{{ allocation.plataforma_nombre }}</span>
              </span>
              <span class="shrink-0 font-semibold tabular-nums">{{ formatCOP(allocation.monto_asignado) }}</span>
            </div>
            <div class="mt-1 flex justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>cubre {{ formatCOP(allocation.disponible) }} de {{ formatCOP(allocation.objetivo_fuente) }} · {{ formatPct(allocation.porcentaje / 100) }}</span>
              <span v-if="allocation.faltante_fuente > 0">faltan {{ formatCOP(allocation.faltante_fuente) }}</span>
            </div>
          </div>
          <div v-if="goal.monto_sin_asignar > 0" class="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Sin fuente asignada: {{ formatCOP(goal.monto_sin_asignar) }}
          </div>
        </div>
      </article>
    </div>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/40 px-4 py-6 backdrop-blur-sm" @click.self="closeEditor">
      <div class="w-full max-w-3xl rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar meta' : 'Nueva meta' }}</h2>
        </div>

        <form class="grid gap-5 p-5" @submit.prevent="saveGoal">
          <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="form.nombre" type="text" placeholder="Moto nueva" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto objetivo</span>
              <input v-model="form.monto_objetivo" type="number" min="1" step="0.01" placeholder="13000000" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <label class="flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <input v-model="form.activa" type="checkbox" class="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500">
            Meta activa
          </label>

          <section class="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <h3 class="text-sm font-semibold">Origen del dinero</h3>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">Elige si asignas por valor exacto o por porcentaje de la meta.</p>
                <div class="mt-3 inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-950">
                  <button
                    type="button"
                    class="h-8 rounded-md px-3 text-xs font-semibold transition"
                    :class="form.allocation_mode === 'amount' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'"
                    @click="form.allocation_mode = 'amount'"
                  >
                    Valor
                  </button>
                  <button
                    type="button"
                    class="h-8 rounded-md px-3 text-xs font-semibold transition"
                    :class="form.allocation_mode === 'percent' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'"
                    @click="form.allocation_mode = 'percent'"
                  >
                    Porcentaje
                  </button>
                </div>
              </div>
              <div class="text-right text-xs text-zinc-500 dark:text-zinc-400">
                <p>Asignado: <strong class="text-zinc-900 dark:text-zinc-100">{{ formatCOP(assignedAmount) }}</strong></p>
                <p>{{ formatPct(assignedPct) }} de la meta</p>
                <p v-if="unassignedAmount > 0">Sin asignar: {{ formatCOP(unassignedAmount) }}</p>
              </div>
            </div>

            <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <div v-for="allocation in form.allocations" :key="allocation.platform_id" class="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div class="min-w-0">
                  <p class="flex items-center gap-2 text-sm font-semibold">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: platformFor(allocation.platform_id)?.color }" />
                    <span class="truncate">{{ platformFor(allocation.platform_id)?.nombre }}</span>
                  </p>
                  <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Posición actual: {{ formatCOP(platformFor(allocation.platform_id)?.posicion) }}
                  </p>
                </div>
                <label class="grid gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {{ form.allocation_mode === 'percent' ? '% de la meta' : 'Valor de la meta' }}
                  <input v-if="form.allocation_mode === 'percent'" v-model="allocation.porcentaje" type="number" min="0" max="100" step="0.01" class="h-10 w-40 rounded-lg border border-zinc-200 bg-white px-3 text-right text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="0">
                  <input v-else v-model="allocation.monto_asignado" type="number" min="0" step="0.01" class="h-10 w-40 rounded-lg border border-zinc-200 bg-white px-3 text-right text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="0">
                  <span v-if="form.allocation_mode === 'percent' && allocationAmount(allocation) > 0" class="text-[11px] font-normal text-zinc-400">
                    {{ formatCOP(allocationAmount(allocation)) }}
                  </span>
                  <span v-else-if="form.allocation_mode === 'amount' && allocationAmount(allocation) > 0 && targetAmount > 0" class="text-[11px] font-normal text-zinc-400">
                    {{ formatPct(allocationAmount(allocation) / targetAmount) }}
                  </span>
                </label>
              </div>
            </div>
          </section>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteGoal">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar meta' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
