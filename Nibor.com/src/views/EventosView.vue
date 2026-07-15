<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatDate, monthName } from '../utils/format.js'
import NotificationModuleSettings from '../components/NotificationModuleSettings.vue'

const now = new Date()
const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const events = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const showPast = ref(false)
const form = ref(emptyForm())
const calendarSettingsOpen = ref(false)
const calendarFeed = ref(null)
const feedError = ref('')
const feedLoading = ref(false)

const icsUrl = computed(() => calendarFeed.value?.https_url ?? '')
const webcalUrl = computed(() => calendarFeed.value?.webcal_url ?? '')

const upcoming = computed(() => events.value.filter((e) => e.fecha >= todayIso))
const past = computed(() => events.value.filter((e) => e.fecha < todayIso).reverse())

// Agrupar próximos por mes para la lista
const upcomingByMonth = computed(() => {
  const groups = []
  for (const event of upcoming.value) {
    const key = event.fecha.slice(0, 7)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      const [y, m] = key.split('-').map(Number)
      group = { key, label: monthName(m, y), events: [] }
      groups.push(group)
    }
    group.events.push(event)
  }
  return groups
})

function emptyForm() {
  return {
    id: null,
    titulo: '',
    descripcion: '',
    fecha: todayIso,
    hora: '',
    duracion_min: 60,
    lugar: '',
    recordatorio_min: '',
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadEvents() {
  loading.value = true
  error.value = ''
  try {
    events.value = await fetchJson('/api/events')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadCalendarFeed() {
  feedLoading.value = true
  feedError.value = ''
  try {
    calendarFeed.value = await fetchJson('/api/events/calendar-url')
  } catch (err) {
    calendarFeed.value = null
    feedError.value = err.message
  } finally {
    feedLoading.value = false
  }
}

function openCalendarSettings() {
  calendarSettingsOpen.value = true
  if (!calendarFeed.value && !feedLoading.value) loadCalendarFeed()
}

function openNew() {
  editorError.value = ''
  form.value = emptyForm()
  editorOpen.value = true
}

function openEdit(event) {
  editorError.value = ''
  form.value = {
    id: event.id,
    titulo: event.titulo,
    descripcion: event.descripcion ?? '',
    fecha: event.fecha,
    hora: event.hora ?? '',
    duracion_min: event.duracion_min ?? 60,
    lugar: event.lugar ?? '',
    recordatorio_min: event.recordatorio_min ?? '',
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

async function saveEvent() {
  saving.value = true
  editorError.value = ''

  const payload = {
    titulo: form.value.titulo,
    descripcion: form.value.descripcion,
    fecha: form.value.fecha,
    hora: form.value.hora || null,
    duracion_min: Number(form.value.duracion_min || 60),
    lugar: form.value.lugar,
    recordatorio_min: form.value.recordatorio_min === '' ? null : Number(form.value.recordatorio_min),
  }

  try {
    await fetchJson(form.value.id ? `/api/events/${form.value.id}` : '/api/events', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    notice.value = form.value.id
      ? 'Evento actualizado — tu iPhone lo refresca en la próxima sincronización.'
      : 'Evento creado.'
    await loadEvents()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteEvent() {
  if (!form.value.id || !window.confirm('¿Eliminar este evento?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/events/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    notice.value = 'Evento eliminado.'
    await loadEvents()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function copyIcsUrl() {
  if (!webcalUrl.value) return
  try {
    await navigator.clipboard.writeText(webcalUrl.value)
    notice.value = 'URL webcal copiada — pégala en iPhone: Ajustes → Calendario → Cuentas → Añadir suscripción.'
  } catch {
    notice.value = `Copia manual: ${webcalUrl.value}`
  }
}

function horaLabel(event) {
  if (!event.hora) return 'Todo el día'
  const end = (() => {
    const [h, m] = event.hora.split(':').map(Number)
    const total = h * 60 + m + Number(event.duracion_min ?? 60)
    return `${String(Math.floor((total / 60) % 24)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })()
  return `${event.hora} – ${end}`
}

onMounted(loadEvents)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Eventos</p>
        <div class="mt-1 flex items-center gap-2">
          <h1 class="text-2xl font-bold">Eventos</h1>
          <NotificationModuleSettings module="eventos" />
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-emerald-800 dark:hover:text-emerald-400"
            title="Configurar calendario en el celular"
            aria-label="Configurar calendario en el celular"
            @click="openCalendarSettings"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.6 3.3l.5 1.8a7.5 7.5 0 013.8 0l.5-1.8 2.2 1.3-1.3 1.4a7.6 7.6 0 011.9 3.3l1.9-.4v2.6l-1.9-.4a7.6 7.6 0 01-1.9 3.3l1.3 1.4-2.2 1.3-.5-1.8a7.5 7.5 0 01-3.8 0l-.5 1.8-2.2-1.3 1.3-1.4a7.6 7.6 0 01-1.9-3.3l-1.9.4V8.9l1.9.4A7.6 7.6 0 018.7 6L7.4 4.6l2.2-1.3z" />
              <circle cx="12" cy="10.2" r="2.6" />
            </svg>
          </button>
        </div>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tu calendario personal — suscríbete desde el iPhone y edítalo desde aquí.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        Nuevo evento
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <!-- Próximos por mes -->
    <div v-if="loading" class="mt-6 rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">Cargando…</div>

    <div v-else-if="!upcoming.length" class="mt-6 rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
      No tienes eventos próximos. Crea el primero con "Nuevo evento".
    </div>

    <section v-for="group in upcomingByMonth" :key="group.key" class="mt-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ group.label }}</h2>
      <div class="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button
            v-for="event in group.events"
            :key="event.id"
            type="button"
            class="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            @click="openEdit(event)"
          >
            <div class="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950">
              <span class="text-lg font-bold leading-none text-emerald-700 dark:text-emerald-400">{{ Number(event.fecha.slice(8, 10)) }}</span>
              <span class="text-[10px] uppercase text-emerald-600/80 dark:text-emerald-500">{{ monthName(Number(event.fecha.slice(5, 7))).slice(0, 3) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ event.titulo }}</p>
              <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ horaLabel(event) }}
                <template v-if="event.lugar"> · 📍 {{ event.lugar }}</template>
                <template v-if="event.recordatorio_min !== null && event.recordatorio_min !== undefined"> · 🔔 {{ event.recordatorio_min }} min antes</template>
              </p>
            </div>
            <span class="text-xs text-zinc-400">{{ formatDate(event.fecha) }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Pasados -->
    <section v-if="past.length" class="mt-8">
      <button type="button" class="text-sm font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400" @click="showPast = !showPast">
        {{ showPast ? 'Ocultar' : 'Ver' }} eventos pasados ({{ past.length }})
      </button>
      <div v-if="showPast" class="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white opacity-70 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button v-for="event in past" :key="event.id" type="button" class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openEdit(event)">
            <span class="truncate">{{ event.titulo }}</span>
            <span class="shrink-0 text-xs text-zinc-400">{{ formatDate(event.fecha) }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Configuración de calendario móvil -->
    <div v-if="calendarSettingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="calendarSettingsOpen = false">
      <div class="w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Configuración</p>
            <h2 class="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">Calendario en el celular</h2>
          </div>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Cerrar configuración del calendario" @click="calendarSettingsOpen = false">✕</button>
        </div>

        <div class="p-5">
          <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">📱 Suscríbete desde tu iPhone</h3>
          <p class="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Ajustes → Apps → Calendario → Cuentas → Añadir cuenta → Otra → Añadir suscripción de calendario, y pega la URL.
            Los cambios que hagas aquí se actualizarán en el teléfono.
          </p>

          <p v-if="webcalUrl" class="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            🔒 URL privada lista para conectar tu calendario
          </p>
          <p v-else class="mt-4 rounded-lg px-3 py-2 text-sm" :class="feedError ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'">
            {{ feedError || 'Preparando URL privada…' }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" :disabled="!webcalUrl" @click="copyIcsUrl">
              Copiar URL
            </button>
            <a v-if="webcalUrl" :href="webcalUrl" class="flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500">
              Abrir en Calendario
            </a>
            <a v-if="icsUrl" :href="icsUrl" download="nibor.ics" class="flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white">
              Descargar .ics
            </a>
          </div>

          <p class="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">La URL contiene una llave privada. No la compartas: quien la tenga podrá ver los eventos del calendario.</p>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar evento' : 'Nuevo evento' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveEvent">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Título</span>
            <input v-model="form.titulo" type="text" placeholder="p. ej. Cita médica, Concierto, Pago SOAT" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha</span>
              <input v-model="form.fecha" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Hora <span class="font-normal text-zinc-400">(vacío = todo el día)</span></span>
              <input v-model="form.hora" type="time" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Duración (min)</span>
              <input v-model="form.duracion_min" type="number" min="5" max="1440" step="5" :disabled="!form.hora" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Lugar <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="form.lugar" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Recordatorio (min antes)</span>
              <select v-model="form.recordatorio_min" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="">Sin recordatorio</option>
                <option :value="0">Al momento</option>
                <option :value="15">15 minutos</option>
                <option :value="30">30 minutos</option>
                <option :value="60">1 hora</option>
                <option :value="1440">1 día</option>
              </select>
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="form.descripcion" rows="2" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteEvent">Eliminar</button>
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
