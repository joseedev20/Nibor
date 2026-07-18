<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { formatDate } from '../utils/format.js'

const reminders = ref([])
const loading = ref(true)
const pageError = ref('')
const saving = ref(false)
const editorError = ref('')
const editorOpen = ref(false)
const showCompleted = ref(false)

const REPETICIONES = [
  { value: '1', label: 'cada hora' },
  { value: '2', label: 'cada 2 horas' },
  { value: '3', label: 'cada 3 horas' },
  { value: '4', label: 'cada 4 horas' },
  { value: '6', label: 'cada 6 horas' },
  { value: '8', label: 'cada 8 horas' },
  { value: '12', label: 'cada 12 horas' },
  { value: '24', label: 'una vez al día' },
]
const repeatHours = ref('4')
const repeatSaved = ref(false)
let repeatSavedTimer = null

const FRECUENCIAS = [
  { value: null, label: 'Una sola vez' },
  { value: 1, label: 'Diario' },
  { value: 2, label: 'Cada 2 días' },
  { value: 7, label: 'Semanal' },
  { value: 15, label: 'Quincenal' },
  { value: 30, label: 'Mensual' },
]

const form = reactive({
  id: null,
  titulo: '',
  notas: '',
  frecuencia_dias: null,
  frecuencia_custom: '',
  proxima_fecha: '',
  hora: '',
})

const pendientes = computed(() => reminders.value.filter((item) => item.estado === 'hoy' || item.estado === 'vencido'))
const proximos = computed(() => reminders.value.filter((item) => item.estado === 'programado'))
const pausados = computed(() => reminders.value.filter((item) => item.estado === 'pausado'))
const completados = computed(() => reminders.value.filter((item) => item.estado === 'completado'))

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'No se pudo completar la solicitud')
  return json.data
}

async function loadRepeatSetting() {
  try {
    const data = await fetchJson('/api/notifications/settings')
    const value = String(data.recordatorios_repetir_horas ?? '4')
    repeatHours.value = REPETICIONES.some((option) => option.value === value) ? value : '4'
  } catch {
    // el selector se queda en el valor por defecto
  }
}

async function saveRepeatSetting(event) {
  const value = event.target.value
  const previous = repeatHours.value
  repeatHours.value = value
  pageError.value = ''
  try {
    await fetchJson('/api/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify({ recordatorios_repetir_horas: value }),
    })
    repeatSaved.value = true
    window.clearTimeout(repeatSavedTimer)
    repeatSavedTimer = window.setTimeout(() => {
      repeatSaved.value = false
    }, 2000)
  } catch (error) {
    repeatHours.value = previous
    pageError.value = error.message
  }
}

async function loadReminders() {
  try {
    reminders.value = await fetchJson('/api/reminders')
    pageError.value = ''
  } catch (error) {
    pageError.value = error.message
  } finally {
    loading.value = false
  }
}

function frecuenciaLabel(reminder) {
  if (!reminder.frecuencia_dias) return 'Una sola vez'
  const preset = FRECUENCIAS.find((item) => item.value === reminder.frecuencia_dias)
  return preset?.label ?? `Cada ${reminder.frecuencia_dias} días`
}

function subtitle(reminder) {
  const parts = []
  if (reminder.estado === 'vencido') {
    const dias = Math.abs(reminder.dias_restantes)
    parts.push(`Desde hace ${dias} ${dias === 1 ? 'día' : 'días'}`)
  } else if (reminder.estado === 'hoy') {
    parts.push('Hoy')
  } else if (reminder.estado === 'programado') {
    parts.push(reminder.dias_restantes === 1 ? 'Mañana' : formatDate(reminder.proxima_fecha))
  } else {
    parts.push(formatDate(reminder.proxima_fecha))
  }
  if (reminder.hora) parts.push(reminder.hora)
  parts.push(frecuenciaLabel(reminder))
  return parts.join(' · ')
}

function openEditor(reminder = null) {
  form.id = reminder?.id ?? null
  form.titulo = reminder?.titulo ?? ''
  form.notas = reminder?.notas ?? ''
  const frecuencia = reminder?.frecuencia_dias ?? null
  const isPreset = FRECUENCIAS.some((item) => item.value === frecuencia)
  form.frecuencia_dias = isPreset ? frecuencia : 'custom'
  form.frecuencia_custom = isPreset ? '' : String(frecuencia ?? '')
  form.proxima_fecha = reminder?.proxima_fecha ?? new Date().toISOString().slice(0, 10)
  form.hora = reminder?.hora ?? ''
  editorError.value = ''
  editorOpen.value = true
}

async function saveReminder() {
  saving.value = true
  editorError.value = ''
  try {
    const frecuencia = form.frecuencia_dias === 'custom'
      ? (form.frecuencia_custom === '' ? null : Number(form.frecuencia_custom))
      : form.frecuencia_dias
    await fetchJson(form.id ? `/api/reminders/${form.id}` : '/api/reminders', {
      method: form.id ? 'PUT' : 'POST',
      body: JSON.stringify({
        titulo: form.titulo,
        notas: form.notas || null,
        frecuencia_dias: frecuencia,
        proxima_fecha: form.proxima_fecha,
        hora: form.hora || null,
      }),
    })
    editorOpen.value = false
    await loadReminders()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function deleteReminder() {
  if (!form.id || !window.confirm('¿Eliminar este recordatorio?')) return
  saving.value = true
  try {
    await fetchJson(`/api/reminders/${form.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadReminders()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function completeReminder(reminder) {
  pageError.value = ''
  try {
    await fetchJson(`/api/reminders/${reminder.id}/complete`, { method: 'POST' })
    await loadReminders()
  } catch (error) {
    pageError.value = error.message
  }
}

async function toggleActive(reminder) {
  pageError.value = ''
  try {
    await fetchJson(`/api/reminders/${reminder.id}`, {
      method: 'PUT',
      body: JSON.stringify({ activo: reminder.estado === 'pausado' || reminder.estado === 'completado' }),
    })
    await loadReminders()
  } catch (error) {
    pageError.value = error.message
  }
}

onMounted(() => {
  loadReminders()
  loadRepeatSetting()
})
onBeforeUnmount(() => window.clearTimeout(repeatSavedTimer))
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Recordatorios</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">Que no se te pase nada</h1>
        <p class="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Cada recordatorio te avisa por notificación (y push si lo tienes activo) y te insiste varias veces al día hasta que lo marques hecho.
        </p>
        <label class="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span>🔔 Los pendientes avisan</span>
          <select :value="repeatHours" class="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @change="saveRepeatSetting">
            <option v-for="option in REPETICIONES" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <span v-if="repeatSaved" class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Guardado ✓</span>
        </label>
      </div>
      <button type="button" class="h-10 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openEditor()">
        + Nuevo recordatorio
      </button>
    </header>

    <div v-if="pageError" class="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      <span>{{ pageError }}</span>
      <button type="button" class="font-bold" aria-label="Cerrar error" @click="pageError = ''">×</button>
    </div>

    <div v-if="loading" class="mt-6 rounded-lg border border-zinc-200 p-10 text-center text-sm text-zinc-400 dark:border-zinc-800">Cargando recordatorios…</div>

    <div v-else-if="!reminders.length" class="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
      <div class="text-4xl">⏰</div>
      <p class="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">Aún no tienes recordatorios</p>
      <p class="mt-1 text-sm text-zinc-500">Crea el primero: "prender el carro", "comprar algo en el centro comercial"…</p>
      <button type="button" class="mt-5 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500" @click="openEditor()">Crear recordatorio</button>
    </div>

    <template v-else>
      <section v-if="pendientes.length" class="mt-6">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">Para hoy</h2>
        <div class="mt-2 grid gap-2">
          <article v-for="reminder in pendientes" :key="reminder.id" class="flex items-center gap-3 rounded-lg border px-4 py-3" :class="reminder.estado === 'vencido' ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/40' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40'">
            <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(reminder)">
              <p class="font-semibold text-zinc-950 dark:text-white">{{ reminder.titulo }}</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ subtitle(reminder) }}</p>
              <p v-if="reminder.notas" class="mt-0.5 truncate text-xs text-zinc-400">{{ reminder.notas }}</p>
            </button>
            <button type="button" class="h-9 shrink-0 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500" @click="completeReminder(reminder)">✓ Hecho</button>
            <button type="button" class="h-9 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Pausar recordatorio" @click="toggleActive(reminder)">⏸</button>
          </article>
        </div>
      </section>

      <section v-if="proximos.length" class="mt-6">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">Próximos</h2>
        <div class="mt-2 grid gap-2">
          <article v-for="reminder in proximos" :key="reminder.id" class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(reminder)">
              <p class="font-medium text-zinc-900 dark:text-zinc-100">{{ reminder.titulo }}</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ subtitle(reminder) }}</p>
            </button>
            <button type="button" class="h-9 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" title="Pausar recordatorio" @click="toggleActive(reminder)">⏸</button>
          </article>
        </div>
      </section>

      <section v-if="pausados.length" class="mt-6">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400">Pausados</h2>
        <div class="mt-2 grid gap-2">
          <article v-for="reminder in pausados" :key="reminder.id" class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 opacity-70 dark:border-zinc-800 dark:bg-zinc-900">
            <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(reminder)">
              <p class="font-medium text-zinc-700 dark:text-zinc-300">{{ reminder.titulo }}</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ subtitle(reminder) }}</p>
            </button>
            <button type="button" class="h-9 shrink-0 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500" @click="toggleActive(reminder)">Reanudar</button>
          </article>
        </div>
      </section>

      <section v-if="completados.length" class="mt-6">
        <button type="button" class="text-sm font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" @click="showCompleted = !showCompleted">
          Completados ({{ completados.length }}) {{ showCompleted ? '▾' : '▸' }}
        </button>
        <div v-if="showCompleted" class="mt-2 grid gap-2">
          <article v-for="reminder in completados" :key="reminder.id" class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 opacity-60 dark:border-zinc-800 dark:bg-zinc-900">
            <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(reminder)">
              <p class="font-medium text-zinc-500 line-through dark:text-zinc-400">{{ reminder.titulo }}</p>
              <p class="text-xs text-zinc-400">{{ subtitle(reminder) }}</p>
            </button>
            <button type="button" class="h-9 shrink-0 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="toggleActive(reminder)">Reactivar</button>
          </article>
        </div>
      </section>
    </template>

    <!-- Modal recordatorio -->
    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="editorOpen = false">
      <div class="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">{{ form.id ? 'Editar recordatorio' : 'Nuevo recordatorio' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveReminder">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">¿Qué debes recordar?</span>
            <input v-model="form.titulo" required maxlength="120" type="text" placeholder="Prender el carro, comprar en el centro comercial…" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">¿Cada cuánto?</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opcion in FRECUENCIAS"
                :key="String(opcion.value)"
                type="button"
                class="h-8 rounded-full border px-3 text-xs font-semibold transition"
                :class="form.frecuencia_dias === opcion.value
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                @click="form.frecuencia_dias = opcion.value"
              >
                {{ opcion.label }}
              </button>
              <button
                type="button"
                class="h-8 rounded-full border px-3 text-xs font-semibold transition"
                :class="form.frecuencia_dias === 'custom'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                @click="form.frecuencia_dias = 'custom'"
              >
                Personalizado
              </button>
            </div>
            <label v-if="form.frecuencia_dias === 'custom'" class="mt-1 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              Cada
              <input v-model="form.frecuencia_custom" required type="number" min="1" max="365" class="h-9 w-20 rounded-lg border border-zinc-200 bg-white px-2 text-center text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              días
            </label>
            <p class="text-xs text-zinc-400">
              {{ form.frecuencia_dias === null ? 'Te avisará varias veces al día hasta que lo marques hecho.' : 'Al marcarlo hecho se programa solo para la próxima vez y deja de avisar por hoy.' }}
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">{{ form.frecuencia_dias === null ? 'Recordar desde' : 'Primera vez' }}</span>
              <input v-model="form.proxima_fecha" required type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Hora <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="form.hora" type="time" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="form.notas" maxlength="500" rows="2" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-3 pt-1">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="deleteReminder">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="editorOpen = false">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
