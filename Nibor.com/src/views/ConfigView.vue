<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP } from '../utils/format.js'

const categories = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm('gasto'))

const platforms = ref([])
const platformEditorOpen = ref(false)
const platformError = ref('')
const platformSaving = ref(false)
const platformForm = ref(emptyPlatformForm())

const cards = ref([])
const cardEditorOpen = ref(false)
const cardError = ref('')
const cardSaving = ref(false)
const cardForm = ref(emptyCardForm())

const expenseCategories = computed(() => categories.value.filter((category) => category.tipo === 'gasto'))
const incomeCategories = computed(() => categories.value.filter((category) => category.tipo === 'ingreso'))

function emptyForm(tipo = 'gasto') {
  return {
    id: null,
    nombre: '',
    tipo,
    icono: '',
    color: '#64748b',
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadCategories() {
  loading.value = true
  error.value = ''
  try {
    categories.value = await fetchJson('/api/categories')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// ── Plataformas de inversión ───────────────────────────────────────────────

function emptyPlatformForm() {
  return { id: null, nombre: '', color: '#2563eb', orden: 0, activa: true, tipo: 'inversion' }
}

async function loadPlatforms() {
  try {
    platforms.value = await fetchJson('/api/platforms')
  } catch (err) {
    error.value = err.message
  }
}

function openNewPlatform() {
  platformError.value = ''
  platformForm.value = { ...emptyPlatformForm(), orden: platforms.value.length + 1 }
  platformEditorOpen.value = true
}

function openEditPlatform(platform) {
  platformError.value = ''
  platformForm.value = {
    id: platform.id,
    nombre: platform.nombre,
    color: platform.color,
    orden: platform.orden,
    activa: Number(platform.activa) === 1,
    tipo: platform.tipo ?? 'inversion',
  }
  platformEditorOpen.value = true
}

function closePlatformEditor() {
  if (platformSaving.value) return
  platformEditorOpen.value = false
  platformError.value = ''
}

async function savePlatform() {
  platformSaving.value = true
  platformError.value = ''
  notice.value = ''

  const payload = {
    nombre: platformForm.value.nombre,
    color: platformForm.value.color,
    orden: Number(platformForm.value.orden),
    activa: platformForm.value.activa,
    tipo: platformForm.value.tipo,
  }

  try {
    await fetchJson(platformForm.value.id ? `/api/platforms/${platformForm.value.id}` : '/api/platforms', {
      method: platformForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    platformEditorOpen.value = false
    notice.value = platformForm.value.id ? 'Plataforma actualizada.' : 'Plataforma creada. Ya aparece en Inversiones y en el Cierre de mes.'
    await loadPlatforms()
  } catch (err) {
    platformError.value = err.message
  } finally {
    platformSaving.value = false
  }
}

async function togglePlatform(platform) {
  error.value = ''
  notice.value = ''
  try {
    await fetchJson(`/api/platforms/${platform.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activa: Number(platform.activa) !== 1 }),
    })
    await loadPlatforms()
  } catch (err) {
    error.value = err.message
  }
}

// Tarjetas: nombres identificadores, nunca numeros ni datos sensibles.

function emptyCardForm() {
  return { id: null, nombre: '', color: '#2563eb', activa: true }
}

async function loadCards() {
  try {
    cards.value = await fetchJson('/api/cards')
  } catch (err) {
    error.value = err.message
  }
}

function openNewCard() {
  cardError.value = ''
  cardForm.value = emptyCardForm()
  cardEditorOpen.value = true
}

function openEditCard(card) {
  cardError.value = ''
  cardForm.value = {
    id: card.id,
    nombre: card.nombre,
    color: card.color ?? '#2563eb',
    activa: Number(card.activa) === 1,
  }
  cardEditorOpen.value = true
}

function closeCardEditor() {
  if (cardSaving.value) return
  cardEditorOpen.value = false
  cardError.value = ''
}

async function saveCard() {
  cardSaving.value = true
  cardError.value = ''
  notice.value = ''

  const payload = {
    nombre: cardForm.value.nombre,
    color: cardForm.value.color,
    activa: cardForm.value.activa,
  }

  try {
    await fetchJson(cardForm.value.id ? `/api/cards/${cardForm.value.id}` : '/api/cards', {
      method: cardForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    cardEditorOpen.value = false
    notice.value = cardForm.value.id ? 'Tarjeta actualizada.' : 'Tarjeta creada. Ya puedes asociarla a gastos fijos.'
    await loadCards()
  } catch (err) {
    cardError.value = err.message
  } finally {
    cardSaving.value = false
  }
}

async function deleteCard() {
  if (!cardForm.value.id || !window.confirm('Eliminar esta tarjeta? Solo se puede si no tiene fijos asociados.')) return
  cardSaving.value = true
  cardError.value = ''
  notice.value = ''

  try {
    await fetchJson(`/api/cards/${cardForm.value.id}`, { method: 'DELETE' })
    cardEditorOpen.value = false
    notice.value = 'Tarjeta eliminada.'
    await loadCards()
  } catch (err) {
    cardError.value = err.message
  } finally {
    cardSaving.value = false
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

function openNew(tipo) {
  editorError.value = ''
  form.value = emptyForm(tipo)
  editorOpen.value = true
}

function openEdit(category) {
  editorError.value = ''
  form.value = {
    id: category.id,
    nombre: category.nombre,
    tipo: category.tipo,
    icono: category.icono ?? '',
    color: category.color ?? '#64748b',
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

async function saveCategory() {
  saving.value = true
  editorError.value = ''
  notice.value = ''

  const payload = {
    nombre: form.value.nombre,
    tipo: form.value.tipo,
    icono: form.value.icono || null,
    color: form.value.color || null,
  }

  try {
    await fetchJson(form.value.id ? `/api/categories/${form.value.id}` : '/api/categories', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    notice.value = 'Categoría guardada.'
    await loadCategories()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteCategory() {
  if (!form.value.id || !window.confirm('¿Eliminar esta categoría?')) return
  saving.value = true
  editorError.value = ''
  notice.value = ''

  try {
    await fetchJson(`/api/categories/${form.value.id}`, { method: 'DELETE' })
    editorOpen.value = false
    notice.value = 'Categoría eliminada.'
    await loadCategories()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadCategories()
  loadPlatforms()
  loadCards()
})
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Configuración</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Categorías, plataformas e importación de datos históricos.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="h-10 rounded-lg border border-emerald-200 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950" @click="openNew('ingreso')">Ingreso</button>
        <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" @click="openNew('gasto')">Gasto</button>
      </div>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <p class="text-sm font-semibold">Plataformas de inversión</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Las nuevas aparecen automáticamente en Inversiones, el Dashboard y el Cierre de mes.</p>
        </div>
        <button type="button" class="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openNewPlatform">Nueva plataforma</button>
      </div>
      <div v-if="!platforms.length" class="p-8 text-center text-sm text-zinc-400">Cargando plataformas…</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div v-for="platform in platforms" :key="platform.id" class="flex items-center gap-3 px-4 py-3">
          <button type="button" class="flex flex-1 items-center gap-3 text-left" @click="openEditPlatform(platform)">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: platform.color }" />
            <span class="text-sm font-medium" :class="Number(platform.activa) === 1 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through dark:text-zinc-500'">{{ platform.nombre }}</span>
            <span v-if="platform.tipo === 'fondo'" class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">fondo</span>
            <span class="text-xs text-zinc-400">orden {{ platform.orden }}</span>
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition"
            :class="Number(platform.activa) === 1 ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'"
            :title="Number(platform.activa) === 1 ? 'Desactivar (conserva su historial)' : 'Reactivar'"
            @click="togglePlatform(platform)"
          >
            {{ Number(platform.activa) === 1 ? 'Activa' : 'Inactiva' }}
          </button>
        </div>
      </div>
    </section>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-semibold">Tarjetas</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Solo nombres identificadores y color. No guardes números de tarjeta.</p>
        </div>
        <button type="button" class="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openNewCard">Nueva tarjeta</button>
      </div>
      <div v-if="!cards.length" class="p-8 text-center text-sm text-zinc-400">No hay tarjetas configuradas.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div v-for="card in cards" :key="card.id" class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <button type="button" class="flex flex-1 items-center gap-3 text-left" @click="openEditCard(card)">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: card.color }" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium" :class="Number(card.activa) === 1 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through dark:text-zinc-500'">{{ card.nombre }}</span>
              <span class="block text-xs text-zinc-500 dark:text-zinc-400">{{ card.suscripciones ?? 0 }} fijos asociados</span>
            </span>
          </button>
          <div class="flex items-center justify-between gap-3 sm:justify-end">
            <span class="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCOP(card.total_mensual ?? 0) }}</span>
            <button
              type="button"
              class="rounded-full px-3 py-1 text-xs font-medium transition"
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

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-4 py-3 text-sm font-semibold dark:border-zinc-800">Gastos</div>
        <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando…</div>
        <div v-else-if="!expenseCategories.length" class="p-8 text-center text-sm text-zinc-400">No hay categorías de gasto.</div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button v-for="category in expenseCategories" :key="category.id" type="button" class="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openEdit(category)">
            <span class="flex h-9 w-9 items-center justify-center rounded-lg text-base" :style="{ backgroundColor: `${category.color ?? '#64748b'}22` }">{{ category.icono ?? '·' }}</span>
            <span class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ category.nombre }}</span>
            <span class="h-4 w-4 rounded-full" :style="{ backgroundColor: category.color ?? '#64748b' }" />
          </button>
        </div>
      </section>

      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-4 py-3 text-sm font-semibold dark:border-zinc-800">Ingresos</div>
        <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando…</div>
        <div v-else-if="!incomeCategories.length" class="p-8 text-center text-sm text-zinc-400">No hay categorías de ingreso.</div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button v-for="category in incomeCategories" :key="category.id" type="button" class="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openEdit(category)">
            <span class="flex h-9 w-9 items-center justify-center rounded-lg text-base" :style="{ backgroundColor: `${category.color ?? '#64748b'}22` }">{{ category.icono ?? '·' }}</span>
            <span class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ category.nombre }}</span>
            <span class="h-4 w-4 rounded-full" :style="{ backgroundColor: category.color ?? '#64748b' }" />
          </button>
        </div>
      </section>
    </div>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ form.id ? 'Editar categoría' : 'Nueva categoría' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveCategory">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
            <input v-model="form.nombre" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm sm:col-span-1">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="form.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm sm:col-span-1">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Icono</span>
              <input v-model="form.icono" type="text" maxlength="4" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm sm:col-span-1">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Color</span>
              <input v-model="form.color" type="color" class="h-10 rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
          </div>

          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteCategory">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="cardEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeCardEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ cardForm.id ? 'Editar tarjeta' : 'Nueva tarjeta' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="saveCard">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre identificador</span>
            <input v-model="cardForm.nombre" type="text" placeholder="p. ej. Nu crédito, Bancolombia débito" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Color</span>
              <input v-model="cardForm.color" type="color" class="h-10 rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <label class="flex items-end gap-2 pb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="cardForm.activa" type="checkbox" class="h-4 w-4 accent-emerald-600">
              Activa
            </label>
          </div>

          <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            No escribas números de tarjeta, fechas de vencimiento ni datos sensibles. Usa solo un nombre para reconocerla.
          </div>

          <div v-if="cardError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ cardError }}</div>

          <div class="flex justify-between gap-2 pt-2">
            <button v-if="cardForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteCard">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeCardEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="cardSaving">{{ cardSaving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="platformEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closePlatformEditor">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">{{ platformForm.id ? 'Editar plataforma' : 'Nueva plataforma' }}</h2>
        </div>

        <form class="grid gap-4 p-5" @submit.prevent="savePlatform">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="platformForm.nombre" type="text" placeholder="p. ej. Trii, Bancolombia, Bitso…" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="platformForm.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="inversion">Inversión (yo decido invertir)</option>
                <option value="fondo">Fondo de ahorro (cesantías, pensión)</option>
              </select>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Color</span>
              <input v-model="platformForm.color" type="color" class="h-10 rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Orden</span>
              <input v-model="platformForm.orden" type="number" min="0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="flex items-end gap-2 pb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="platformForm.activa" type="checkbox" class="h-4 w-4 accent-emerald-600">
              Activa
            </label>
          </div>

          <p class="text-xs text-zinc-500 dark:text-zinc-400">Las plataformas no se eliminan para conservar el historial de meses; si dejas de usar una, desactívala.</p>

          <div v-if="platformError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ platformError }}</div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closePlatformEditor">Cancelar</button>
            <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" :disabled="platformSaving">{{ platformSaving ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
