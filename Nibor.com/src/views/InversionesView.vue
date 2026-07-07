<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatPct, monthName } from '../utils/format.js'
import CapitalMovementModal from '../components/CapitalMovementModal.vue'

const now = new Date()
const movementOpen = ref(false)
const selectedYear = ref(now.getFullYear())
const activeTab = ref('all')
const allMode = ref('total')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const snapshotsData = ref(null)
const editorOpen = ref(false)
const editorError = ref('')
const form = ref({
  id: null,
  platform_id: null,
  platform_name: '',
  mes: now.getMonth() + 1,
  saldo_inicial: '',
  aporte: 0,
  retiros: 0,
  saldo_final: '',
})

const tabs = computed(() => {
  if (!snapshotsData.value) return []
  return [
    snapshotsData.value.consolidated,
    ...snapshotsData.value.platforms,
  ]
})

const activeGroup = computed(() => {
  if (!snapshotsData.value) return null
  if (activeTab.value === 'all') return activeAllGroup.value
  return snapshotsData.value.platforms.find((platform) => String(platform.id) === String(activeTab.value)) ?? snapshotsData.value.consolidated
})

const allGroups = computed(() => {
  if (!snapshotsData.value) return []
  const byType = snapshotsData.value.consolidated_by_tipo ?? {}
  return [
    { id: 'total', label: 'Total', group: snapshotsData.value.consolidated },
    { id: 'inversion', label: 'Inversiones', group: byType.inversion },
    { id: 'fondo', label: 'Fondos', group: byType.fondo },
  ].filter((item) => item.group)
})

const activeAllGroup = computed(() => {
  const selected = allGroups.value.find((group) => group.id === allMode.value)
  return selected?.group ?? snapshotsData.value?.consolidated ?? null
})

const rows = computed(() => activeGroup.value?.snapshots ?? [])
const total = computed(() => activeGroup.value?.total ?? null)
const canEditRows = computed(() => activeTab.value !== 'all')

async function loadSnapshots() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`/api/snapshots?anio=${selectedYear.value}`)
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'No se pudieron cargar las inversiones')

    snapshotsData.value = json.data
    const validTabs = ['all', ...json.data.platforms.map((platform) => String(platform.id))]
    if (!validTabs.includes(String(activeTab.value))) activeTab.value = 'all'
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function setYear(delta) {
  selectedYear.value += delta
  loadSnapshots()
}

function setCurrentYear() {
  selectedYear.value = now.getFullYear()
  loadSnapshots()
}

function valueTone(value) {
  if (value === null || value === undefined || value === 0) return 'text-zinc-500 dark:text-zinc-400'
  return value > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
}

function isFuture(row) {
  return row.anio > now.getFullYear() || (row.anio === now.getFullYear() && row.mes > now.getMonth() + 1)
}

function rowState(row) {
  if (!row.pendiente) return 'Registrado'
  return isFuture(row) ? 'Futuro' : 'Pendiente'
}

function rowStateClass(row) {
  if (!row.pendiente) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
}

function inputValue(value) {
  return value === null || value === undefined ? '' : value
}

function openEditor(row) {
  if (!canEditRows.value) return

  editorError.value = ''
  form.value = {
    id: row.id,
    platform_id: activeGroup.value.id,
    platform_name: activeGroup.value.nombre,
    mes: row.mes,
    saldo_inicial: inputValue(row.saldo_inicial),
    aporte: inputValue(row.aporte) || 0,
    retiros: inputValue(row.retiros) || 0,
    saldo_final: inputValue(row.saldo_final),
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

function toPayloadNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback
  return Number(value)
}

async function saveSnapshot() {
  saving.value = true
  editorError.value = ''

  const payload = {
    platform_id: form.value.platform_id,
    anio: selectedYear.value,
    mes: form.value.mes,
    aporte: toPayloadNumber(form.value.aporte),
    retiros: toPayloadNumber(form.value.retiros),
    saldo_final: form.value.saldo_final === '' || form.value.saldo_final === null ? null : Number(form.value.saldo_final),
  }

  if (form.value.saldo_inicial !== '' && form.value.saldo_inicial !== null) {
    payload.saldo_inicial = Number(form.value.saldo_inicial)
  }

  try {
    const response = await fetch(form.value.id ? `/api/snapshots/${form.value.id}` : '/api/snapshots', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'No se pudo guardar el mes')

    editorOpen.value = false
    await loadSnapshots()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(loadSnapshots)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Inversiones</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Inversiones y fondos de ahorro, mes a mes.</p>
      </div>

      <div class="flex items-center gap-2">
        <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="movementOpen = true">＋ Aporte / retiro</button>
        <button
          type="button"
          class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Año anterior"
          @click="setYear(-1)"
        >
          ‹
        </button>
        <input
          v-model.number="selectedYear"
          type="number"
          min="1900"
          max="2200"
          class="h-10 w-28 rounded-lg border border-zinc-200 bg-white px-3 text-center text-sm font-semibold text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          @change="loadSnapshots"
        >
        <button
          type="button"
          class="h-10 w-10 rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Año siguiente"
          @click="setYear(1)"
        >
          ›
        </button>
        <button
          type="button"
          class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          @click="setCurrentYear"
        >
          Actual
        </button>
      </div>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {{ error }}
    </div>

    <div class="mt-6 flex gap-2 overflow-x-auto border-b border-zinc-200 pb-2 dark:border-zinc-800">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition"
        :class="String(activeTab) === String(tab.id)
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
          : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'"
        @click="activeTab = tab.id"
      >
        <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: tab.color }" />
        {{ tab.nombre }}
      </button>
    </div>

    <div v-if="activeTab === 'all' && allGroups.length > 1" class="mt-4 inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        v-for="group in allGroups"
        :key="group.id"
        type="button"
        class="h-8 rounded-md px-3 text-xs font-semibold transition"
        :class="allMode === group.id
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
          : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'"
        @click="allMode = group.id"
      >
        {{ group.label }}
      </button>
    </div>

    <div class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ activeGroup?.nombre ?? 'Inversiones' }}</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ selectedYear }}</p>
        </div>
        <div v-if="loading" class="text-sm text-zinc-400">Cargando…</div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full table-fixed text-sm">
          <thead class="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th class="w-36 px-4 py-3">Mes</th>
              <th class="w-28 px-4 py-3">Estado</th>
              <th class="w-36 px-4 py-3 text-right">Saldo inicial</th>
              <th class="w-32 px-4 py-3 text-right">Aporte</th>
              <th class="w-32 px-4 py-3 text-right">Retiros</th>
              <th class="w-36 px-4 py-3 text-right">Saldo final</th>
              <th class="w-36 px-4 py-3 text-right" title="Base inicial + aportes acumulados − retiros. Lo que realmente has metido, sin contar ganancias.">Invertido</th>
              <th class="w-36 px-4 py-3 text-right">Ganancia</th>
              <th class="w-32 px-4 py-3 text-right">Rentabilidad</th>
              <th class="w-28 px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
            <tr
              v-for="row in rows"
              :key="`${activeGroup?.id}-${row.mes}`"
              class="transition"
              :class="row.pendiente ? 'bg-zinc-50/70 text-zinc-500 dark:bg-zinc-950/40 dark:text-zinc-400' : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800/50'"
            >
              <td class="px-4 py-3 font-medium">{{ monthName(row.mes) }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium" :class="rowStateClass(row)">
                  {{ rowState(row) }}
                </span>
              </td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(row.saldo_inicial) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(row.aporte) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(row.retiros) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(row.saldo_final) }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400" :title="row.ganancia_acumulada !== null && row.ganancia_acumulada !== undefined ? `Ganancia acumulada: ${formatCOP(row.ganancia_acumulada)}` : ''">
                {{ row.exists !== false ? formatCOP(row.capital_invertido) : '—' }}
              </td>
              <td class="px-4 py-3 text-right tabular-nums font-medium" :class="valueTone(row.ganancia)">{{ formatCOP(row.ganancia) }}</td>
              <td class="px-4 py-3 text-right tabular-nums font-medium" :class="valueTone(row.rentabilidad)">{{ formatPct(row.rentabilidad) }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  v-if="canEditRows"
                  type="button"
                  class="h-8 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  @click="openEditor(row)"
                >
                  Editar
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot class="border-t border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            <tr>
              <td class="px-4 py-3">TOTAL</td>
              <td class="px-4 py-3"></td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(total?.saldo_inicial) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(total?.aporte) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(total?.retiros) }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatCOP(total?.saldo_final) }}</td>
              <td class="px-4 py-3 text-right tabular-nums" :title="total?.rentabilidad_capital !== null && total?.rentabilidad_capital !== undefined ? `Retorno sobre lo invertido: ${formatPct(total.rentabilidad_capital)}` : ''">{{ formatCOP(total?.capital_invertido) }}</td>
              <td class="px-4 py-3 text-right tabular-nums" :class="valueTone(total?.ganancia)">{{ formatCOP(total?.ganancia) }}</td>
              <td class="px-4 py-3 text-right tabular-nums" :class="valueTone(total?.rentabilidad)">{{ formatPct(total?.rentabilidad) }}</td>
              <td class="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div
      v-if="editorOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm"
      @click.self="closeEditor"
    >
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.platform_name }} · {{ monthName(form.mes, selectedYear) }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveSnapshot">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Saldo inicial</span>
            <input
              v-model="form.saldo_inicial"
              type="number"
              min="0"
              step="0.01"
              class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Auto"
            >
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Aporte</span>
              <input
                v-model="form.aporte"
                type="number"
                min="0"
                step="0.01"
                class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
            </label>

            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Retiros</span>
              <input
                v-model="form.retiros"
                type="number"
                min="0"
                step="0.01"
                class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Saldo final</span>
            <input
              v-model="form.saldo_final"
              type="number"
              min="0"
              step="0.01"
              class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Pendiente"
            >
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {{ editorError }}
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              @click="closeEditor"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="saving"
            >
              {{ saving ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <CapitalMovementModal :open="movementOpen" @close="movementOpen = false" @saved="loadSnapshots()" />
  </div>
</template>
