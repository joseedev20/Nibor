<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const TIPOS = [
  { id: 'idea', label: 'Idea', emoji: '💡', classes: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  { id: 'cita', label: 'Cita', emoji: '💬', classes: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  { id: 'reflexion', label: 'Reflexión', emoji: '🤔', classes: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  { id: 'enlace', label: 'Enlace', emoji: '🔗', classes: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  { id: 'otro', label: 'Otro', emoji: '📌', classes: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
]
const TIPO_BY_ID = Object.fromEntries(TIPOS.map((tipo) => [tipo.id, tipo]))

const ideas = ref([])
const counts = ref({ total: 0, por_tipo: {}, tags: [] })
const loading = ref(true)
const pageError = ref('')
const saving = ref(false)
const editorError = ref('')
const editorOpen = ref(false)
const showArchived = ref(false)

const activeTipo = ref('todos')
const activeTag = ref('')
const search = ref('')

const quickText = ref('')
const quickTipo = ref('idea')
const quickSaving = ref(false)
const quickDetailsOpen = ref(false)
const quickFuente = ref('')
const quickEtiquetas = ref('')

const form = reactive({
  id: null,
  contenido: '',
  tipo: 'idea',
  fuente: '',
  etiquetas: '',
  favorita: false,
  archivada: false,
})

const totalIdeas = computed(() => counts.value.total ?? 0)
const visibleTipos = computed(() => TIPOS.map((tipo) => ({ ...tipo, count: Number(counts.value.por_tipo?.[tipo.id] ?? 0) })))
const activeIdeas = computed(() => ideas.value.filter((idea) => !idea.archivada))
const archivedIdeas = computed(() => ideas.value.filter((idea) => idea.archivada))
const favoriteCount = computed(() => ideas.value.filter((idea) => idea.favorita).length)
const capturedToday = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return ideas.value.filter((idea) => idea.created_at?.slice(0, 10) === today).length
})

function tipoMeta(tipoId) {
  return TIPO_BY_ID[tipoId] ?? TIPO_BY_ID.otro
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'No se pudo completar la solicitud')
  return json.data
}

async function loadIdeas() {
  loading.value = true
  pageError.value = ''
  try {
    const params = new URLSearchParams()
    if (activeTipo.value !== 'todos') params.set('tipo', activeTipo.value)
    if (activeTag.value) params.set('etiqueta', activeTag.value)
    if (search.value.trim()) params.set('q', search.value.trim())
    const data = await fetchJson(`/api/ideas?${params.toString()}`)
    ideas.value = data.ideas
    counts.value = data.counts
  } catch (error) {
    pageError.value = error.message
  } finally {
    loading.value = false
  }
}

function selectTipo(tipoId) {
  activeTipo.value = tipoId
  loadIdeas()
}

function selectTag(tag) {
  activeTag.value = activeTag.value === tag ? '' : tag
  loadIdeas()
}

async function quickCapture() {
  const contenido = quickText.value.trim()
  if (!contenido) return
  quickSaving.value = true
  pageError.value = ''
  try {
    await fetchJson('/api/ideas', {
      method: 'POST',
      body: JSON.stringify({
        contenido,
        tipo: quickTipo.value,
        fuente: quickFuente.value || null,
        etiquetas: quickEtiquetas.value,
      }),
    })
    quickText.value = ''
    quickFuente.value = ''
    quickEtiquetas.value = ''
    quickDetailsOpen.value = false
    await loadIdeas()
  } catch (error) {
    pageError.value = error.message
  } finally {
    quickSaving.value = false
  }
}

function openEditor(idea) {
  form.id = idea.id
  form.contenido = idea.contenido
  form.tipo = idea.tipo
  form.fuente = idea.fuente ?? ''
  form.etiquetas = (idea.etiquetas ?? []).join(', ')
  form.favorita = Boolean(idea.favorita)
  form.archivada = Boolean(idea.archivada)
  editorError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
}

async function saveIdea() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/ideas/${form.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        contenido: form.contenido,
        tipo: form.tipo,
        fuente: form.fuente || null,
        etiquetas: form.etiquetas,
        favorita: form.favorita,
        archivada: form.archivada,
      }),
    })
    editorOpen.value = false
    await loadIdeas()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function deleteIdea() {
  if (!form.id || !window.confirm('¿Eliminar esta idea?')) return
  saving.value = true
  try {
    await fetchJson(`/api/ideas/${form.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadIdeas()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function toggleFavorite(idea) {
  pageError.value = ''
  try {
    await fetchJson(`/api/ideas/${idea.id}`, {
      method: 'PUT',
      body: JSON.stringify({ favorita: !idea.favorita }),
    })
    await loadIdeas()
  } catch (error) {
    pageError.value = error.message
  }
}

async function toggleArchived(idea) {
  pageError.value = ''
  try {
    await fetchJson(`/api/ideas/${idea.id}`, {
      method: 'PUT',
      body: JSON.stringify({ archivada: !idea.archivada }),
    })
    await loadIdeas()
  } catch (error) {
    pageError.value = error.message
  }
}

function timeAgo(createdAt) {
  if (!createdAt) return ''
  const [date, time] = createdAt.split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const when = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today - when) / 86400000)
  const hhmm = time ? time.slice(0, 5) : ''
  if (diffDays === 0) return hhmm ? `Hoy · ${hhmm}` : 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  return when.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

onMounted(loadIdeas)
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header>
      <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Ideas</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">Archivo de ideas</h1>
      <p class="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
        Las ideas son escurridizas: captúralas apenas lleguen. Anota una idea, una cita o una reflexión cada día y organízalas con etiquetas en vez de carpetas.
      </p>
    </header>

    <div v-if="pageError" class="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      <span>{{ pageError }}</span>
      <button type="button" class="font-bold" aria-label="Cerrar error" @click="pageError = ''">×</button>
    </div>

    <!-- Captura rápida -->
    <section class="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <form class="flex flex-col gap-3" @submit.prevent="quickCapture">
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            v-model="quickText"
            type="text"
            maxlength="2000"
            placeholder="Se te acaba de ocurrir algo... escríbelo antes de que se pierda"
            class="h-11 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
          <button type="submit" class="h-11 shrink-0 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="quickSaving || !quickText.trim()">
            {{ quickSaving ? 'Guardando…' : '+ Guardar' }}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="tipo in TIPOS"
            :key="tipo.id"
            type="button"
            class="h-8 rounded-full border px-3 text-xs font-semibold transition"
            :class="quickTipo === tipo.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="quickTipo = tipo.id"
          >
            {{ tipo.emoji }} {{ tipo.label }}
          </button>
          <button type="button" class="ml-auto text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200" @click="quickDetailsOpen = !quickDetailsOpen">
            {{ quickDetailsOpen ? 'Ocultar detalles' : '+ Fuente y etiquetas' }}
          </button>
        </div>
        <div v-if="quickDetailsOpen" class="grid gap-2 sm:grid-cols-2">
          <input v-model="quickFuente" type="text" placeholder="Fuente (libro, artículo, conversación…)" class="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          <input v-model="quickEtiquetas" type="text" placeholder="Etiquetas separadas por coma" class="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        </div>
      </form>
    </section>

    <!-- Stats -->
    <div class="mt-6 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Total en el archivo</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ totalIdeas }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Favoritas</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{{ favoriteCount }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Capturadas hoy</p>
        <p class="mt-2 text-2xl font-bold tabular-nums" :class="capturedToday > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'">{{ capturedToday }}</p>
        <p v-if="capturedToday === 0" class="mt-1 text-xs text-zinc-400">Aún no registras nada hoy</p>
      </div>
    </div>

    <!-- Filtros -->
    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeTipo === 'todos' ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectTipo('todos')"
          >
            Todas <span class="ml-1 text-xs opacity-70">{{ totalIdeas }}</span>
          </button>
          <button
            v-for="tipo in visibleTipos"
            :key="tipo.id"
            type="button"
            class="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition"
            :class="activeTipo === tipo.id ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="selectTipo(tipo.id)"
          >
            {{ tipo.emoji }} {{ tipo.label }} <span class="ml-1 text-xs opacity-70">{{ tipo.count }}</span>
          </button>
        </div>

        <form class="flex gap-2" @submit.prevent="loadIdeas">
          <input v-model="search" type="search" class="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 lg:w-56" placeholder="Buscar en el archivo">
          <button type="submit" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">Buscar</button>
        </form>
      </div>

      <div v-if="counts.tags?.length" class="flex flex-wrap gap-1.5 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <button
          v-for="tag in counts.tags"
          :key="tag.etiqueta"
          type="button"
          class="h-7 rounded-full border px-2.5 text-xs font-medium transition"
          :class="activeTag === tag.etiqueta ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'"
          @click="selectTag(tag.etiqueta)"
        >
          #{{ tag.etiqueta }} <span class="opacity-70">{{ tag.total }}</span>
        </button>
      </div>

      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando ideas…</div>

      <div v-else-if="!totalIdeas" class="p-12 text-center">
        <div class="text-4xl">💡</div>
        <p class="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">Tu archivo de ideas está vacío</p>
        <p class="mt-1 text-sm text-zinc-500">Nuestro cerebro está hecho para tener ideas, no para guardarlas. Escribe la primera arriba.</p>
      </div>

      <div v-else-if="!activeIdeas.length && !archivedIdeas.length" class="p-8 text-center text-sm text-zinc-400">Nada coincide con este filtro.</div>

      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <article v-for="idea in activeIdeas" :key="idea.id" class="flex items-start gap-3 px-4 py-4">
          <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(idea)">
            <div class="flex flex-wrap items-center gap-2">
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="tipoMeta(idea.tipo).classes">{{ tipoMeta(idea.tipo).emoji }} {{ tipoMeta(idea.tipo).label }}</span>
              <span class="text-xs text-zinc-400">{{ timeAgo(idea.created_at) }}</span>
            </div>
            <p class="mt-1.5 whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-100">{{ idea.contenido }}</p>
            <p v-if="idea.fuente" class="mt-1 text-xs italic text-zinc-500 dark:text-zinc-400">— {{ idea.fuente }}</p>
            <div v-if="idea.etiquetas.length" class="mt-1.5 flex flex-wrap gap-1">
              <span v-for="tag in idea.etiquetas" :key="tag" class="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">#{{ tag }}</span>
            </div>
          </button>
          <div class="flex shrink-0 flex-col gap-1.5">
            <button type="button" class="h-8 w-8 rounded-lg border text-sm transition" :class="idea.favorita ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'" :title="idea.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'" @click="toggleFavorite(idea)">
              {{ idea.favorita ? '★' : '☆' }}
            </button>
            <button type="button" class="h-8 w-8 rounded-lg border border-zinc-200 text-sm text-zinc-400 transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800" title="Archivar" @click="toggleArchived(idea)">📥</button>
          </div>
        </article>
      </div>

      <div v-if="archivedIdeas.length" class="border-t border-zinc-200 dark:border-zinc-800">
        <button type="button" class="w-full px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" @click="showArchived = !showArchived">
          Archivadas ({{ archivedIdeas.length }}) {{ showArchived ? '▾' : '▸' }}
        </button>
        <div v-if="showArchived" class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <article v-for="idea in archivedIdeas" :key="idea.id" class="flex items-start gap-3 px-4 py-4 opacity-60">
            <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(idea)">
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="tipoMeta(idea.tipo).classes">{{ tipoMeta(idea.tipo).emoji }} {{ tipoMeta(idea.tipo).label }}</span>
              <p class="mt-1.5 truncate text-sm text-zinc-700 dark:text-zinc-300">{{ idea.contenido }}</p>
            </button>
            <button type="button" class="h-8 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="toggleArchived(idea)">Desarchivar</button>
          </article>
        </div>
      </div>
    </section>

    <!-- Modal editor -->
    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">Editar idea</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveIdea">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Contenido</span>
            <textarea v-model="form.contenido" required maxlength="2000" rows="4" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <div class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tipo in TIPOS"
                :key="tipo.id"
                type="button"
                class="h-8 rounded-full border px-3 text-xs font-semibold transition"
                :class="form.tipo === tipo.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                @click="form.tipo = tipo.id"
              >
                {{ tipo.emoji }} {{ tipo.label }}
              </button>
            </div>
          </div>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Fuente <span class="font-normal text-zinc-400">(opcional)</span></span>
            <input v-model="form.fuente" type="text" maxlength="200" placeholder="Libro, artículo, conversación…" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Etiquetas <span class="font-normal text-zinc-400">(separadas por coma, máx. 8)</span></span>
            <input v-model="form.etiquetas" type="text" placeholder="productividad, negocio, libro" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="form.favorita" type="checkbox" class="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500">
              <span class="text-zinc-700 dark:text-zinc-300">★ Favorita</span>
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.archivada" type="checkbox" class="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500">
              <span class="text-zinc-700 dark:text-zinc-300">📥 Archivada</span>
            </label>
          </div>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-3 pt-1">
            <button type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="deleteIdea">Eliminar</button>
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
