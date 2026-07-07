<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatDate } from '../utils/format.js'

const TYPE_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'libro', label: 'Libros', singular: 'Libro', color: 'bg-emerald-500' },
  { id: 'curso', label: 'Cursos', singular: 'Curso', color: 'bg-sky-500' },
  { id: 'idioma', label: 'Idiomas', singular: 'Idioma', color: 'bg-violet-500' },
  { id: 'articulo', label: 'Artículos', singular: 'Artículo', color: 'bg-amber-500' },
  { id: 'video', label: 'Videos', singular: 'Video', color: 'bg-rose-500' },
  { id: 'tema', label: 'Temas', singular: 'Tema', color: 'bg-cyan-500' },
  { id: 'otro', label: 'Otros', singular: 'Otro', color: 'bg-zinc-500' },
]

const STATUS_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes', singular: 'Pendiente' },
  { id: 'progreso', label: 'En progreso', singular: 'En progreso' },
  { id: 'pausado', label: 'Pausados', singular: 'Pausado' },
  { id: 'completado', label: 'Completados', singular: 'Completado' },
  { id: 'repasar', label: 'Repasar', singular: 'Repasar' },
]

const LANGUAGE_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'espanol', label: 'Español' },
  { id: 'ingles', label: 'Inglés' },
]
const CURRENT_YEAR = new Date().getFullYear()
const BASE_YEAR_OPTIONS = Array.from({ length: 8 }, (_, index) => CURRENT_YEAR + 1 - index)

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((type) => [type.id, type.singular ?? type.label]))
const TYPE_COLORS = Object.fromEntries(TYPE_OPTIONS.map((type) => [type.id, type.color ?? 'bg-zinc-500']))
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((status) => [status.id, status.singular ?? status.label]))
const LANGUAGE_LABELS = Object.fromEntries(LANGUAGE_OPTIONS.map((language) => [language.id, language.label]))
const STATUS_CLASSES = {
  pendiente: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  progreso: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  pausado: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  completado: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  repasar: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

const items = ref([])
const habitActivity = ref({ events: [], summary: [] })
const counts = ref({
  by_estado: { pendiente: 0, progreso: 0, pausado: 0, completado: 0, repasar: 0 },
  by_tipo: { libro: 0, curso: 0, idioma: 0, articulo: 0, video: 0, tema: 0, otro: 0 },
  by_idioma: { espanol: 0, ingles: 0 },
  by_anio: {},
})
const activeType = ref('todos')
const activeStatus = ref('todos')
const activeLanguage = ref('todos')
const activeYear = ref('todos')
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm())

const totalItems = computed(() => Object.values(counts.value.by_estado).reduce((sum, value) => sum + Number(value ?? 0), 0))
const typeOptions = computed(() => TYPE_OPTIONS.map((type) => ({
  ...type,
  count: type.id === 'todos' ? totalItems.value : Number(counts.value.by_tipo[type.id] ?? 0),
})))
const statusOptions = computed(() => STATUS_OPTIONS.map((status) => ({
  ...status,
  count: status.id === 'todos' ? totalItems.value : Number(counts.value.by_estado[status.id] ?? 0),
})))
const languageOptions = computed(() => LANGUAGE_OPTIONS.map((language) => ({
  ...language,
  count: language.id === 'todos' ? totalItems.value : Number(counts.value.by_idioma?.[language.id] ?? 0),
})))
const yearOptions = computed(() => {
  const yearsWithData = Object.keys(counts.value.by_anio ?? {})
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year))
  const years = [...new Set([...yearsWithData, ...BASE_YEAR_OPTIONS])].sort((a, b) => b - a)
  return [
    { id: 'todos', label: 'Todos', count: totalItems.value },
    ...years.map((year) => ({
      id: String(year),
      label: String(year),
      count: Number(counts.value.by_anio?.[year] ?? 0),
    })),
  ]
})
const formYearOptions = computed(() => yearOptions.value.filter((year) => year.id !== 'todos'))
const activeLearning = computed(() => Number(counts.value.by_estado.progreso ?? 0) + Number(counts.value.by_estado.repasar ?? 0))
const completedItems = computed(() => Number(counts.value.by_estado.completado ?? 0))
const spanishItems = computed(() => Number(counts.value.by_idioma?.espanol ?? 0))
const englishItems = computed(() => Number(counts.value.by_idioma?.ingles ?? 0))
const currentYearItems = computed(() => Number(counts.value.by_anio?.[CURRENT_YEAR] ?? 0))
const habitActivityTotal = computed(() => habitActivity.value.summary.reduce((sum, item) => sum + Number(item.total ?? 0), 0))

function emptyForm() {
  return {
    id: null,
    titulo: '',
    tipo: 'libro',
    estado: 'pendiente',
    idioma: 'espanol',
    anio: CURRENT_YEAR,
    autor: '',
    progreso: 0,
    fecha_inicio: '',
    fecha_fin: '',
    enlace: '',
    notas: '',
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadItems() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (activeType.value !== 'todos') params.set('tipo', activeType.value)
    if (activeStatus.value !== 'todos') params.set('estado', activeStatus.value)
    if (activeLanguage.value !== 'todos') params.set('idioma', activeLanguage.value)
    if (activeYear.value !== 'todos') params.set('anio', activeYear.value)
    if (search.value.trim()) params.set('q', search.value.trim())
    const [data, activity] = await Promise.all([
      fetchJson(`/api/knowledge/items?${params.toString()}`),
      fetchJson('/api/habits/activity?module=knowledge&limit=8'),
    ])
    items.value = data.items
    counts.value = data.counts
    habitActivity.value = activity
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function typeLabel(type) {
  return TYPE_LABELS[type] ?? type
}

function typeColor(type) {
  return TYPE_COLORS[type] ?? 'bg-zinc-500'
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}

function languageLabel(language) {
  return LANGUAGE_LABELS[language] ?? 'Español'
}

function habitBehaviorLabel(behavior) {
  return {
    reading_done: 'Lectura',
    language_practice: 'Práctica de idioma',
  }[behavior] ?? behavior
}

function formatDateTime(value) {
  if (!value) return '—'
  return `${formatDate(value.slice(0, 10))} · ${value.slice(11, 16)}`
}

function yearLabel(year) {
  return year ? String(year) : 'Sin año'
}

function statusClass(status) {
  return STATUS_CLASSES[status] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

function progressTone(item) {
  if (item.estado === 'completado') return 'bg-emerald-500'
  if (item.estado === 'pausado') return 'bg-amber-500'
  if (item.estado === 'repasar') return 'bg-violet-500'
  if (item.estado === 'progreso') return 'bg-sky-500'
  return 'bg-zinc-400'
}

function selectType(type) {
  activeType.value = type
  loadItems()
}

function selectStatus(status) {
  activeStatus.value = status
  loadItems()
}

function selectLanguage(language) {
  activeLanguage.value = language
  loadItems()
}

function selectYear(year) {
  activeYear.value = year
  loadItems()
}

function extractRegisteredYear(notes) {
  const match = String(notes ?? '').match(/Año registrado:\s*(\d{4})/)
  return match ? Number(match[1]) : null
}

function stripRegisteredYearNote(notes) {
  return String(notes ?? '')
    .replace(/^Año registrado:\s*\d{4};\s*/u, '')
    .replace(/^Año registrado:\s*\d{4}$/u, '')
}

function openNew() {
  editorError.value = ''
  form.value = emptyForm()
  editorOpen.value = true
}

function openEdit(item) {
  editorError.value = ''
  form.value = {
    id: item.id,
    titulo: item.titulo,
    tipo: item.tipo,
    estado: item.estado,
    idioma: item.idioma ?? (item.area === 'Inglés' ? 'ingles' : 'espanol'),
    anio: item.anio ?? extractRegisteredYear(item.notas) ?? CURRENT_YEAR,
    autor: item.autor ?? '',
    progreso: item.progreso ?? 0,
    fecha_inicio: item.fecha_inicio ?? '',
    fecha_fin: item.fecha_fin ?? '',
    enlace: item.enlace ?? '',
    notas: stripRegisteredYearNote(item.notas),
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

function syncProgressWithStatus() {
  if (form.value.estado === 'completado') form.value.progreso = 100
}

async function saveItem() {
  saving.value = true
  editorError.value = ''

  const payload = {
    titulo: form.value.titulo,
    tipo: form.value.tipo,
    estado: form.value.estado,
    idioma: form.value.idioma,
    anio: Number(form.value.anio),
    area: languageLabel(form.value.idioma),
    autor: form.value.autor,
    progreso: Number(form.value.progreso),
    fecha_inicio: form.value.fecha_inicio || null,
    fecha_fin: form.value.fecha_fin || null,
    enlace: form.value.enlace,
    notas: form.value.notas,
  }

  try {
    await fetchJson(form.value.id ? `/api/knowledge/items/${form.value.id}` : '/api/knowledge/items', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    await loadItems()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteItem() {
  if (!form.value.id || !window.confirm('¿Eliminar este recurso?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/knowledge/items/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadItems()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(loadItems)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Conocimiento</p>
        <h1 class="mt-1 text-2xl font-bold">Aprendizaje</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Lecturas, cursos, idiomas y rutas de estudio.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        Nuevo recurso
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {{ error }}
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Total recursos</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ totalItems }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">libros, cursos, idiomas y temas</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">En aprendizaje</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">{{ activeLearning }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">en progreso o para repasar</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Español</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{{ spanishItems }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">recursos en español</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Inglés</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">{{ englishItems }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">recursos en inglés</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Este año</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-violet-700 dark:text-violet-400">{{ currentYearItems }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">registrados en {{ CURRENT_YEAR }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Completados</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{{ completedItems }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">conocimiento acumulado</p>
      </div>
    </div>

    <section class="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Actividad desde hábitos</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Lectura e inglés registrados en Nibor Hábitos.</p>
        </div>
        <RouterLink to="/habitos" class="text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-400">
          Abrir hábitos
        </RouterLink>
      </div>
      <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
        <div class="space-y-2">
          <div v-for="item in habitActivity.summary" :key="`${item.behavior}-${item.target_label}`" class="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
            <div>
              <p class="text-sm font-medium">{{ item.target_label || habitBehaviorLabel(item.behavior) }}</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ habitBehaviorLabel(item.behavior) }}</p>
            </div>
            <span class="text-sm font-semibold tabular-nums">{{ item.total }}</span>
          </div>
          <p v-if="!habitActivity.summary.length" class="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
            Sin hábitos de aprendizaje registrados.
          </p>
        </div>
        <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <div v-for="event in habitActivity.events" :key="event.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <div class="min-w-0">
              <p class="truncate font-medium">{{ event.target_label || event.habit_name }}</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ habitBehaviorLabel(event.behavior) }}</p>
            </div>
            <span class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ formatDateTime(event.event_time) }}</span>
          </div>
          <div v-if="!habitActivity.events.length" class="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            {{ habitActivityTotal ? 'Sin eventos recientes.' : 'Aún no hay actividad vinculada.' }}
          </div>
        </div>
      </div>
    </section>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div class="flex gap-2 overflow-x-auto">
          <button
            v-for="type in typeOptions"
            :key="type.id"
            type="button"
            class="flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeType === type.id
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectType(type.id)"
          >
            <span v-if="type.id !== 'todos'" class="h-2 w-2 rounded-full" :class="type.color" />
            {{ type.label }} <span class="text-xs opacity-70">{{ type.count }}</span>
          </button>
        </div>
      </div>

      <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div class="flex gap-2 overflow-x-auto">
          <button
            v-for="language in languageOptions"
            :key="language.id"
            type="button"
            class="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeLanguage === language.id
              ? 'border-sky-600 bg-sky-600 text-white'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectLanguage(language.id)"
          >
            {{ language.label }} <span class="ml-1 text-xs opacity-70">{{ language.count }}</span>
          </button>
        </div>
      </div>

      <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div class="flex gap-2 overflow-x-auto">
          <button
            v-for="year in yearOptions"
            :key="year.id"
            type="button"
            class="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeYear === year.id
              ? 'border-violet-600 bg-violet-600 text-white'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectYear(year.id)"
          >
            {{ year.label }} <span class="ml-1 text-xs opacity-70">{{ year.count }}</span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex gap-2 overflow-x-auto">
          <button
            v-for="status in statusOptions"
            :key="status.id"
            type="button"
            class="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeStatus === status.id
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectStatus(status.id)"
          >
            {{ status.label }} <span class="ml-1 text-xs opacity-70">{{ status.count }}</span>
          </button>
        </div>

        <form class="flex gap-2" @submit.prevent="loadItems">
          <input
            v-model="search"
            type="search"
            class="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:w-64"
            placeholder="Buscar"
          >
          <button type="submit" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
            Buscar
          </button>
        </form>
      </div>

      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando recursos...</div>
      <div v-else-if="!items.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay recursos en esta vista.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 lg:grid-cols-[1fr_220px]"
          @click="openEdit(item)"
        >
          <span class="min-w-0">
            <span class="flex flex-wrap items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="typeColor(item.tipo)" />
              <span class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ item.titulo }}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusClass(item.estado)">
                {{ statusLabel(item.estado) }}
              </span>
            </span>
            <span class="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
              {{ typeLabel(item.tipo) }} · {{ languageLabel(item.idioma) }} · {{ yearLabel(item.anio) }}
              <span v-if="item.autor"> · {{ item.autor }}</span>
            </span>
            <span v-if="item.notas" class="mt-1 block truncate text-xs text-zinc-400">{{ item.notas }}</span>
          </span>

          <span class="min-w-0 lg:text-right">
            <span class="flex items-center gap-2 lg:justify-end">
              <span class="h-2 w-full max-w-36 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <span class="block h-full rounded-full" :class="progressTone(item)" :style="{ width: `${item.progreso ?? 0}%` }" />
              </span>
              <span class="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">{{ item.progreso ?? 0 }}%</span>
            </span>
            <span class="mt-2 block truncate text-xs text-zinc-500 dark:text-zinc-400">
              <span v-if="item.fecha_fin">Terminado: {{ formatDate(item.fecha_fin) }}</span>
              <span v-else-if="item.fecha_inicio">Inicio: {{ formatDate(item.fecha_inicio) }}</span>
              <span v-else>Actualizado: {{ formatDate(item.updated_at?.slice(0, 10)) }}</span>
            </span>
          </span>
        </button>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar recurso' : 'Nuevo recurso' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveItem">
          <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Título</span>
              <input v-model="form.titulo" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="form.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="libro">Libro</option>
                <option value="curso">Curso</option>
                <option value="idioma">Idioma</option>
                <option value="articulo">Artículo</option>
                <option value="video">Video</option>
                <option value="tema">Tema</option>
                <option value="otro">Otro</option>
              </select>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estado</span>
              <select v-model="form.estado" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @change="syncProgressWithStatus">
                <option value="pendiente">Pendiente</option>
                <option value="progreso">En progreso</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
                <option value="repasar">Repasar</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Idioma</span>
              <select v-model="form.idioma" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="espanol">Español</option>
                <option value="ingles">Inglés</option>
              </select>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Autor o fuente</span>
              <input v-model="form.autor" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Autor, plataforma, profesor...">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Año</span>
              <select v-model.number="form.anio" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="year in formYearOptions" :key="year.id" :value="Number(year.id)">{{ year.label }}</option>
              </select>
            </label>
          </div>

          <div class="grid gap-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Progreso</span>
              <input v-model.number="form.progreso" type="number" min="0" max="100" class="h-10 w-24 rounded-lg border border-zinc-200 bg-white px-3 text-right text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </div>
            <input v-model.number="form.progreso" type="range" min="0" max="100" class="w-full accent-emerald-600">
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha inicio</span>
              <input v-model="form.fecha_inicio" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha fin</span>
              <input v-model="form.fecha_fin" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Enlace</span>
            <input v-model="form.enlace" type="url" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Drive, Kindle, YouTube, plataforma del curso...">
          </label>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="form.notas" rows="4" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteItem">Eliminar</button>
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
