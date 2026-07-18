<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { formatCOP, formatDate } from '../utils/format.js'

const pet = ref(null)
const vaccines = ref([])
const documents = ref([])
const uploadingDocument = ref(false)
const previewDocument = ref(null)
const gastos = ref([])
const resumen = ref(null)
const loading = ref(true)
const pageError = ref('')
const saving = ref(false)
const editorError = ref('')
const petEditorOpen = ref(false)
const vaccineEditorOpen = ref(false)
const gastoEditorOpen = ref(false)

const ESPECIES = [
  { value: 'perro', label: 'Perro', emoji: '🐶' },
  { value: 'gato', label: 'Gato', emoji: '🐱' },
  { value: 'otro', label: 'Otro', emoji: '🐾' },
]

const VACCINE_ESTADOS = {
  al_dia: { label: 'Al día', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  proxima: { label: 'Próxima dosis', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  vencida: { label: 'Vencida', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  aplicada: { label: 'Aplicada', badge: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
}

const GASTO_SUGERENCIAS = ['Comida', 'Veterinaria', 'Vacuna', 'Desparasitación', 'Peluquería', 'Juguetes']

const petForm = reactive({
  id: null,
  nombre: '',
  especie: 'perro',
  raza: '',
  sexo: '',
  fecha_nacimiento: '',
  color: '',
  microchip: '',
  notas: '',
})

const vaccineForm = reactive({ id: null, nombre: '', fecha: '', proxima_dosis: '', veterinaria: '', notas: '' })
const gastoForm = reactive({ concepto: '', fecha: '', monto: '' })

const especieEmoji = computed(() => ESPECIES.find((item) => item.value === pet.value?.especie)?.emoji ?? '🐾')

const edadLabel = computed(() => {
  const edad = pet.value?.edad
  if (!edad) return null
  const parts = []
  if (edad.anios) parts.push(edad.anios === 1 ? '1 año' : `${edad.anios} años`)
  if (edad.meses || !edad.anios) parts.push(edad.meses === 1 ? '1 mes' : `${edad.meses} meses`)
  let label = parts.join(' y ')
  if (edad.edad_humana !== null && edad.edad_humana !== undefined) {
    label += ` (≈ ${edad.edad_humana} años humanos)`
  }
  return label
})

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'No se pudo completar la solicitud')
  return json.data
}

async function loadPet() {
  try {
    const list = await fetchJson('/api/pets')
    if (!list.length) {
      pet.value = null
      loading.value = false
      return
    }
    const detail = await fetchJson(`/api/pets/${list[0].id}`)
    pet.value = detail.pet
    vaccines.value = detail.vaccines
    documents.value = detail.documents ?? []
    gastos.value = detail.gastos
    resumen.value = detail.gastos_resumen
    pageError.value = ''
  } catch (error) {
    pageError.value = error.message
  } finally {
    loading.value = false
  }
}

// ── Perfil ───────────────────────────────────────────────────────────────────

function openPetEditor() {
  petForm.id = pet.value?.id ?? null
  petForm.nombre = pet.value?.nombre ?? 'Bansky'
  petForm.especie = pet.value?.especie ?? 'perro'
  petForm.raza = pet.value?.raza ?? ''
  petForm.sexo = pet.value?.sexo ?? ''
  petForm.fecha_nacimiento = pet.value?.fecha_nacimiento ?? ''
  petForm.color = pet.value?.color ?? ''
  petForm.microchip = pet.value?.microchip ?? ''
  petForm.notas = pet.value?.notas ?? ''
  editorError.value = ''
  petEditorOpen.value = true
}

async function savePet() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(petForm.id ? `/api/pets/${petForm.id}` : '/api/pets', {
      method: petForm.id ? 'PUT' : 'POST',
      body: JSON.stringify({
        nombre: petForm.nombre,
        especie: petForm.especie,
        raza: petForm.raza || null,
        sexo: petForm.sexo || null,
        fecha_nacimiento: petForm.fecha_nacimiento || null,
        color: petForm.color || null,
        microchip: petForm.microchip || null,
        notas: petForm.notas || null,
      }),
    })
    petEditorOpen.value = false
    await loadPet()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

// ── Vacunas ──────────────────────────────────────────────────────────────────

function openVaccineEditor(vaccine = null) {
  vaccineForm.id = vaccine?.id ?? null
  vaccineForm.nombre = vaccine?.nombre ?? ''
  vaccineForm.fecha = vaccine?.fecha ?? new Date().toISOString().slice(0, 10)
  vaccineForm.proxima_dosis = vaccine?.proxima_dosis ?? ''
  vaccineForm.veterinaria = vaccine?.veterinaria ?? ''
  vaccineForm.notas = vaccine?.notas ?? ''
  editorError.value = ''
  vaccineEditorOpen.value = true
}

async function saveVaccine() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(vaccineForm.id ? `/api/pets/vaccines/${vaccineForm.id}` : `/api/pets/${pet.value.id}/vaccines`, {
      method: vaccineForm.id ? 'PUT' : 'POST',
      body: JSON.stringify({
        nombre: vaccineForm.nombre,
        fecha: vaccineForm.fecha,
        proxima_dosis: vaccineForm.proxima_dosis || null,
        veterinaria: vaccineForm.veterinaria || null,
        notas: vaccineForm.notas || null,
      }),
    })
    vaccineEditorOpen.value = false
    await loadPet()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function deleteVaccine() {
  if (!vaccineForm.id || !window.confirm('¿Eliminar este registro de vacuna?')) return
  saving.value = true
  try {
    await fetchJson(`/api/pets/vaccines/${vaccineForm.id}`, { method: 'DELETE' })
    vaccineEditorOpen.value = false
    await loadPet()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

// ── Gastos (sincronizados con Gastos e Ingresos) ─────────────────────────────

function openGastoEditor() {
  gastoForm.concepto = ''
  gastoForm.fecha = new Date().toISOString().slice(0, 10)
  gastoForm.monto = ''
  editorError.value = ''
  gastoEditorOpen.value = true
}

async function saveGasto() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/pets/${pet.value.id}/gastos`, {
      method: 'POST',
      body: JSON.stringify({ concepto: gastoForm.concepto, fecha: gastoForm.fecha, monto: gastoForm.monto }),
    })
    gastoEditorOpen.value = false
    await loadPet()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function deleteGasto(gasto) {
  if (!window.confirm(`¿Eliminar el gasto "${gasto.descripcion}"? También desaparecerá de Gastos e Ingresos.`)) return
  pageError.value = ''
  try {
    await fetchJson(`/api/movements/${gasto.id}`, { method: 'DELETE' })
    await loadPet()
  } catch (error) {
    pageError.value = error.message
  }
}

// ── Documentos PDF ───────────────────────────────────────────────────────────

async function uploadDocument(event) {
  const input = event.target
  const file = input.files?.[0]
  if (!file) return
  if (file.type !== 'application/pdf') {
    pageError.value = 'Solo puedes subir archivos PDF.'
    input.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    pageError.value = 'El PDF no puede superar 10 MB.'
    input.value = ''
    return
  }

  uploadingDocument.value = true
  pageError.value = ''
  try {
    const response = await fetch(`/api/pets/${pet.value.id}/documents`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent(file.name),
      },
      body: file,
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.error ?? 'No se pudo subir el PDF')
    await loadPet()
  } catch (error) {
    pageError.value = error.message
  } finally {
    uploadingDocument.value = false
    input.value = ''
  }
}

async function renameDocument(document) {
  const nombre = window.prompt('Nombre del documento:', document.nombre)
  if (nombre === null || !nombre.trim() || nombre.trim() === document.nombre) return
  pageError.value = ''
  try {
    await fetchJson(`/api/pets/documents/${document.id}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: nombre.trim() }),
    })
    await loadPet()
  } catch (error) {
    pageError.value = error.message
  }
}

async function deleteDocument(document) {
  if (!window.confirm(`¿Eliminar el documento "${document.nombre}"? Esta acción no se puede deshacer.`)) return
  pageError.value = ''
  try {
    await fetchJson(`/api/pets/documents/${document.id}`, { method: 'DELETE' })
    if (previewDocument.value?.id === document.id) previewDocument.value = null
    await loadPet()
  } catch (error) {
    pageError.value = error.message
  }
}

function formatFileSize(value) {
  const bytes = Number(value ?? 0)
  if (!bytes) return ''
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

function vaccineSubtitle(vaccine) {
  const parts = [`Aplicada ${formatDate(vaccine.fecha)}`]
  if (vaccine.proxima_dosis) parts.push(`próxima ${formatDate(vaccine.proxima_dosis)}`)
  if (vaccine.veterinaria) parts.push(vaccine.veterinaria)
  return parts.join(' · ')
}

onMounted(loadPet)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Bansky</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">El centro de tu mascota</h1>
        <p class="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Perfil, vacunas y gastos. Todo gasto queda sincronizado con Gastos e Ingresos en ambos sentidos.
        </p>
      </div>
      <div v-if="pet" class="flex shrink-0 gap-2">
        <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openGastoEditor">+ Nuevo gasto</button>
        <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500" @click="openVaccineEditor()">+ Vacuna</button>
      </div>
    </header>

    <div v-if="pageError" class="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      <span>{{ pageError }}</span>
      <button type="button" class="font-bold" aria-label="Cerrar error" @click="pageError = ''">×</button>
    </div>

    <div v-if="loading" class="mt-6 rounded-lg border border-zinc-200 p-10 text-center text-sm text-zinc-400 dark:border-zinc-800">Cargando…</div>

    <div v-else-if="!pet" class="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
      <div class="text-4xl">🐾</div>
      <p class="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">Crea el perfil de tu mascota</p>
      <p class="mt-1 text-sm text-zinc-500">Guarda sus datos, lleva sus vacunas y controla cuánto gastas en ella.</p>
      <button type="button" class="mt-5 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500" @click="openPetEditor">Crear perfil</button>
    </div>

    <template v-else>
      <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-wrap items-center gap-4 px-5 py-5">
          <span class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-950">{{ especieEmoji }}</span>
          <div class="min-w-0 flex-1">
            <h2 class="text-2xl font-bold text-zinc-950 dark:text-white">{{ pet.nombre }}</h2>
            <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {{ [pet.raza, edadLabel, pet.sexo, pet.color].filter(Boolean).join(' · ') || 'Completa su perfil' }}
            </p>
            <p v-if="pet.microchip" class="mt-0.5 text-xs text-zinc-400">Microchip: <span class="font-mono">{{ pet.microchip }}</span></p>
          </div>
          <button type="button" class="h-9 shrink-0 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openPetEditor">Editar perfil</button>
        </div>
        <p v-if="pet.notas" class="border-t border-zinc-100 px-5 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{{ pet.notas }}</p>
      </section>

      <section v-if="resumen" class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Gasto total</p>
          <p class="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">{{ formatCOP(resumen.total) }}</p>
          <p class="mt-0.5 text-xs text-zinc-500">{{ resumen.count }} gastos registrados</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Este año</p>
          <p class="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">{{ formatCOP(resumen.total_anio) }}</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Este mes</p>
          <p class="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">{{ formatCOP(resumen.total_mes) }}</p>
        </div>
      </section>

      <section class="mt-6">
        <h3 class="text-lg font-bold text-zinc-950 dark:text-white">💉 Vacunas y aplicaciones</h3>
        <div v-if="!vaccines.length" class="mt-3 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Aún no has registrado vacunas. Agrega la primera con "+ Vacuna".
        </div>
        <div v-else class="mt-3 grid gap-3 md:grid-cols-2">
          <button
            v-for="vaccine in vaccines"
            :key="vaccine.id"
            type="button"
            class="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800"
            @click="openVaccineEditor(vaccine)"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold text-zinc-950 dark:text-white">{{ vaccine.nombre }}</p>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="VACCINE_ESTADOS[vaccine.estado]?.badge">
                {{ VACCINE_ESTADOS[vaccine.estado]?.label }}
                <template v-if="vaccine.estado === 'proxima'"> ({{ vaccine.dias_restantes }} d)</template>
              </span>
            </div>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ vaccineSubtitle(vaccine) }}</p>
            <p v-if="vaccine.notas" class="mt-1 text-xs text-zinc-400">{{ vaccine.notas }}</p>
          </button>
        </div>
      </section>

      <section class="mt-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-lg font-bold text-zinc-950 dark:text-white">📄 Documentos</h3>
          <label class="flex h-9 cursor-pointer items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500">
            {{ uploadingDocument ? 'Subiendo…' : '📎 Subir PDF' }}
            <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingDocument" @change="uploadDocument">
          </label>
        </div>
        <div v-if="!documents.length" class="mt-3 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Sube aquí el carnet de vacunas, historia clínica, certificados… (PDF, máx. 10 MB)
        </div>
        <div v-else class="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div v-for="doc in documents" :key="doc.id" class="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-zinc-800">
            <span class="text-lg">📄</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ doc.nombre }}</p>
              <p class="truncate text-xs text-zinc-500">{{ doc.file_name }} · {{ formatFileSize(doc.file_size) }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <button type="button" class="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500" @click="previewDocument = doc">Ver</button>
              <a :href="`/api/pets/documents/${doc.id}/file?download=1`" class="flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">Descargar</a>
              <button type="button" class="h-8 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="renameDocument(doc)">Renombrar</button>
              <button type="button" class="h-8 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteDocument(doc)">Quitar</button>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-zinc-950 dark:text-white">🧾 Gastos de {{ pet.nombre }}</h3>
          <span class="text-xs text-zinc-400">Sincronizado con Gastos e Ingresos</span>
        </div>
        <div v-if="!gastos.length" class="mt-3 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Sin gastos todavía. Regístralos aquí o desde Gastos con la categoría 🐾 Mascotas: se verán en ambos lados.
        </div>
        <div v-else class="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div v-for="gasto in gastos" :key="gasto.id" class="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-zinc-800">
            <span class="text-lg">{{ gasto.categoria_icono ?? '🐾' }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ gasto.descripcion }}</p>
              <p class="text-xs text-zinc-500">{{ formatDate(gasto.fecha) }}<template v-if="gasto.categoria_nombre"> · {{ gasto.categoria_nombre }}</template></p>
            </div>
            <p class="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCOP(gasto.monto) }}</p>
            <button type="button" class="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950" :aria-label="`Eliminar ${gasto.descripcion}`" @click="deleteGasto(gasto)">×</button>
          </div>
        </div>
      </section>
    </template>

    <!-- Visor PDF -->
    <div v-if="previewDocument" class="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 p-3 sm:p-6">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-t-lg bg-zinc-900 px-4 py-3 text-white">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ previewDocument.nombre }} · {{ pet?.nombre }}</p>
          <p class="truncate text-xs text-zinc-400">{{ previewDocument.file_name }}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <a :href="`/api/pets/documents/${previewDocument.id}/file?download=1`" class="flex h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold hover:bg-emerald-500">Descargar</a>
          <button type="button" class="h-9 rounded-lg bg-zinc-700 px-3 text-sm font-semibold hover:bg-zinc-600" @click="previewDocument = null">Cerrar</button>
        </div>
      </div>
      <iframe :src="`/api/pets/documents/${previewDocument.id}/file`" :title="`Documento ${previewDocument.nombre}`" class="mx-auto h-full w-full max-w-6xl rounded-b-lg bg-white" />
    </div>

    <!-- Modal perfil -->
    <div v-if="petEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="petEditorOpen = false">
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">{{ petForm.id ? 'Editar perfil' : 'Crear perfil de tu mascota' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="savePet">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="petForm.nombre" required maxlength="80" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Especie</span>
              <select v-model="petForm.especie" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="especie in ESPECIES" :key="especie.value" :value="especie.value">{{ especie.emoji }} {{ especie.label }}</option>
              </select>
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Raza <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="petForm.raza" maxlength="80" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Sexo <span class="font-normal text-zinc-400">(opcional)</span></span>
              <select v-model="petForm.sexo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="">Sin especificar</option>
                <option value="macho">Macho</option>
                <option value="hembra">Hembra</option>
              </select>
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nacimiento</span>
              <input v-model="petForm.fecha_nacimiento" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Color <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="petForm.color" maxlength="60" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Microchip <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="petForm.microchip" maxlength="60" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 font-mono text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="petForm.notas" maxlength="800" rows="3" placeholder="Alergias, comida favorita, veterinaria de confianza…" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="petEditorOpen = false">Cancelar</button>
            <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal vacuna -->
    <div v-if="vaccineEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="vaccineEditorOpen = false">
      <div class="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">{{ vaccineForm.id ? 'Editar vacuna' : 'Registrar vacuna' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveVaccine">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
            <input v-model="vaccineForm.nombre" required maxlength="120" type="text" placeholder="Rabia, triple, desparasitación…" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha de aplicación</span>
              <input v-model="vaccineForm.fecha" required type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Próxima dosis <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="vaccineForm.proxima_dosis" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Veterinaria <span class="font-normal text-zinc-400">(opcional)</span></span>
            <input v-model="vaccineForm.veterinaria" maxlength="120" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="vaccineForm.notas" maxlength="800" rows="2" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-3 pt-1">
            <button v-if="vaccineForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="deleteVaccine">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="vaccineEditorOpen = false">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal gasto -->
    <div v-if="gastoEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="gastoEditorOpen = false">
      <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">Nuevo gasto de {{ pet?.nombre }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveGasto">
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="sugerencia in GASTO_SUGERENCIAS"
              :key="sugerencia"
              type="button"
              class="h-8 rounded-full border px-3 text-xs font-semibold transition"
              :class="gastoForm.concepto === sugerencia
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="gastoForm.concepto = sugerencia"
            >
              {{ sugerencia }}
            </button>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Concepto</span>
            <input v-model="gastoForm.concepto" required maxlength="120" type="text" placeholder="Comida, veterinaria…" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha</span>
              <input v-model="gastoForm.fecha" required type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto</span>
              <input v-model.number="gastoForm.monto" required type="number" step="0.01" min="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-right tabular-nums text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <p class="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">Se guardará también en Gastos e Ingresos con la categoría 🐾 Mascotas.</p>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="gastoEditorOpen = false">Cancelar</button>
            <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar gasto' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
