<script setup>
import { computed, onMounted, ref } from 'vue'
import VChart from '../charts/setup.js'
import { useIsDark } from '../composables/useIsDark.js'
import { chartInk } from '../utils/chartColors.js'
import { formatDate } from '../utils/format.js'

const STATUS_OPTIONS = [
  { id: 'todas', label: 'Todas', tone: 'zinc' },
  { id: 'idea', label: 'Ideas', singular: 'Idea', tone: 'sky' },
  { id: 'proceso', label: 'En proceso', singular: 'En proceso', tone: 'amber' },
  { id: 'lista', label: 'Terminadas sin publicar', singular: 'Terminada sin publicar', tone: 'emerald' },
  { id: 'publicada', label: 'Publicadas', singular: 'Publicada', tone: 'violet' },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((status) => [status.id, status.singular ?? status.label]))
const STATUS_CLASSES = {
  idea: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  proceso: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  lista: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  publicada: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

const songs = ref([])
const counts = ref({ idea: 0, proceso: 0, lista: 0, publicada: 0 })
const activeStatus = ref('todas')
const search = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm())
const isDark = useIsDark()
const mode = computed(() => (isDark.value ? 'dark' : 'light'))
const ink = computed(() => chartInk(mode.value))

const totalSongs = computed(() => Object.values(counts.value).reduce((sum, value) => sum + Number(value ?? 0), 0))
const visibleStatusOptions = computed(() => STATUS_OPTIONS.map((status) => ({
  ...status,
  count: status.id === 'todas' ? totalSongs.value : Number(counts.value[status.id] ?? 0),
})))
const publishedSongs = computed(() => counts.value.publicada ?? 0)
const activeWork = computed(() => (counts.value.idea ?? 0) + (counts.value.proceso ?? 0) + (counts.value.lista ?? 0))
const finishedUnpublished = computed(() => counts.value.lista ?? 0)
const releaseFlow = computed(() => [
  { name: 'En proceso', value: Number(counts.value.proceso ?? 0), color: '#D97706' },
  { name: 'Terminadas sin publicar', value: Number(counts.value.lista ?? 0), color: '#059669' },
  { name: 'Publicadas', value: Number(counts.value.publicada ?? 0), color: '#7C3AED' },
])
const releaseFlowTotal = computed(() => releaseFlow.value.reduce((sum, row) => sum + row.value, 0))
const releaseDonutOption = computed(() => ({
  color: releaseFlow.value.map((row) => row.color),
  textStyle: { color: ink.value.text },
  tooltip: {
    trigger: 'item',
    backgroundColor: ink.value.surface,
    borderColor: ink.value.axisLine,
    textStyle: { color: ink.value.text },
    formatter: ({ name, value, percent }) => `${name}<br><strong>${value}</strong> canciones · ${percent}%`,
  },
  legend: {
    bottom: 0,
    left: 'center',
    textStyle: { color: ink.value.text },
  },
  series: [
    {
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '43%'],
      avoidLabelOverlap: true,
      label: {
        color: ink.value.text,
        formatter: ({ value }) => `${value}`,
      },
      labelLine: { lineStyle: { color: ink.value.muted } },
      data: releaseFlow.value.map((row) => ({
        name: row.name,
        value: row.value,
        itemStyle: { color: row.color },
      })),
    },
  ],
}))
const releaseBarOption = computed(() => ({
  color: releaseFlow.value.map((row) => row.color),
  textStyle: { color: ink.value.text },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    backgroundColor: ink.value.surface,
    borderColor: ink.value.axisLine,
    textStyle: { color: ink.value.text },
    formatter: (params) => {
      const item = params[0]
      return `${item.name}<br><strong>${item.value}</strong> canciones`
    },
  },
  grid: { left: 8, right: 34, top: 12, bottom: 24, containLabel: true },
  xAxis: {
    type: 'value',
    minInterval: 1,
    axisLabel: { color: ink.value.muted, precision: 0 },
    axisLine: { lineStyle: { color: ink.value.axisLine } },
    splitLine: { lineStyle: { color: ink.value.grid } },
  },
  yAxis: {
    type: 'category',
    data: releaseFlow.value.map((row) => row.name),
    axisLabel: { color: ink.value.text },
    axisLine: { lineStyle: { color: ink.value.axisLine } },
    axisTick: { show: false },
  },
  series: [
    {
      type: 'bar',
      barWidth: 18,
      label: {
        show: true,
        position: 'right',
        color: ink.value.text,
        fontWeight: 700,
      },
      data: releaseFlow.value.map((row) => ({
        value: row.value,
        itemStyle: { color: row.color, borderRadius: [0, 6, 6, 0] },
      })),
    },
  ],
}))

function emptyForm() {
  return {
    id: null,
    titulo: '',
    estado: 'proceso',
    genero: 'Rap',
    fecha_publicacion: '',
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

async function loadSongs() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (activeStatus.value !== 'todas') params.set('estado', activeStatus.value)
    if (search.value.trim()) params.set('q', search.value.trim())
    const data = await fetchJson(`/api/music/songs?${params.toString()}`)
    songs.value = data.songs
    counts.value = data.counts
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
  loadSongs()
}

function openNew() {
  editorError.value = ''
  form.value = emptyForm()
  editorOpen.value = true
}

function openEdit(song) {
  editorError.value = ''
  form.value = {
    id: song.id,
    titulo: song.titulo,
    estado: song.estado,
    genero: song.genero ?? 'Rap',
    fecha_publicacion: song.fecha_publicacion ?? '',
    enlace: song.enlace ?? '',
    notas: song.notas ?? '',
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

async function saveSong() {
  saving.value = true
  editorError.value = ''

  const payload = {
    titulo: form.value.titulo,
    artista: 'Nibor',
    estado: form.value.estado,
    genero: form.value.genero,
    bpm: null,
    tonalidad: null,
    fecha_publicacion: form.value.fecha_publicacion || null,
    enlace: form.value.enlace,
    notas: form.value.notas,
  }

  try {
    await fetchJson(form.value.id ? `/api/music/songs/${form.value.id}` : '/api/music/songs', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    await loadSongs()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteSong() {
  if (!form.value.id || !window.confirm('¿Eliminar esta canción?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/music/songs/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadSongs()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(loadSongs)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Música</p>
        <h1 class="mt-1 text-2xl font-bold">Rap</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Canciones, procesos y lanzamientos de rap.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        Nueva canción rap
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {{ error }}
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Total canciones rap</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ totalSongs }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ activeWork }} en trabajo creativo</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">En proceso</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{{ counts.proceso ?? 0 }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">producción, letra o mezcla</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Terminadas sin publicar</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{{ finishedUnpublished }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">listas para lanzamiento</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Publicadas</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-violet-700 dark:text-violet-400">{{ publishedSongs }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">catálogo afuera</p>
      </div>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-[2fr_3fr]">
      <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Estado del catálogo</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Publicadas, en proceso y terminadas sin publicar.</p>
        </div>
        <VChart v-if="releaseFlowTotal > 0" class="mt-3 w-full" style="height: 280px" :option="releaseDonutOption" autoresize />
        <div v-else class="mt-3 flex items-center justify-center rounded-lg border border-dashed border-zinc-300 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500" style="height: 280px">
          Aún no hay canciones para graficar.
        </div>
      </section>

      <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Flujo de lanzamiento</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">De producción a publicación.</p>
        </div>
        <VChart v-if="releaseFlowTotal > 0" class="mt-3 w-full" style="height: 280px" :option="releaseBarOption" autoresize />
        <div v-else class="mt-3 flex items-center justify-center rounded-lg border border-dashed border-zinc-300 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500" style="height: 280px">
          Agrega canciones para ver el avance del pipeline.
        </div>
      </section>
    </div>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex gap-2 overflow-x-auto">
          <button
            v-for="status in visibleStatusOptions"
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

        <form class="flex gap-2" @submit.prevent="loadSongs">
          <input
            v-model="search"
            type="search"
            class="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:w-64"
            placeholder="Buscar canción rap"
          >
          <button type="submit" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
            Buscar
          </button>
        </form>
      </div>

      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando canciones...</div>
      <div v-else-if="!songs.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay canciones en esta vista.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <button
          v-for="song in songs"
          :key="song.id"
          type="button"
          class="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 md:grid-cols-[1fr_auto]"
          @click="openEdit(song)"
        >
          <span class="min-w-0">
            <span class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ song.titulo }}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusClass(song.estado)">
                {{ statusLabel(song.estado) }}
              </span>
            </span>
            <span class="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
              Nibor
              <span> · {{ song.genero || 'Rap' }}</span>
            </span>
            <span v-if="song.notas" class="mt-1 block truncate text-xs text-zinc-400">{{ song.notas }}</span>
          </span>
          <span class="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 md:justify-end">
            <span v-if="song.fecha_publicacion">Publicación: {{ formatDate(song.fecha_publicacion) }}</span>
            <span v-else>Actualizada: {{ formatDate(song.updated_at?.slice(0, 10)) }}</span>
          </span>
        </button>
      </div>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar canción' : 'Nueva canción' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveSong">
          <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Título</span>
              <input v-model="form.titulo" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estado</span>
              <select v-model="form.estado" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="idea">Idea</option>
                <option value="proceso">En proceso</option>
                <option value="lista">Terminada sin publicar</option>
                <option value="publicada">Publicada</option>
              </select>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estilo rap</span>
              <input v-model="form.genero" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Rap, boom bap, trap, drill...">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha publicación</span>
              <input v-model="form.fecha_publicacion" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Enlace</span>
            <input v-model="form.enlace" type="url" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" placeholder="Spotify, YouTube, Drive...">
          </label>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="form.notas" rows="4" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteSong">Eliminar</button>
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
