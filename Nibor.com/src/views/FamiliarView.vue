<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const members = ref([])
const loading = ref(true)
const pageError = ref('')
const editorOpen = ref(false)
const saving = ref(false)
const editorError = ref('')
const uploadingId = ref(null)
const previewMember = ref(null)
const copiedMemberId = ref(null)
let copyFeedbackTimer = null

const DOCUMENT_TYPES = [
  { value: 'cedula_ciudadania', label: 'Cédula de ciudadanía' },
  { value: 'tarjeta_identidad', label: 'Tarjeta de identidad' },
  { value: 'cedula_extranjeria', label: 'Cédula de extranjería' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'registro_civil', label: 'Registro civil' },
  { value: 'otro', label: 'Otro' },
]

const form = reactive({
  id: null,
  nombre: '',
  parentesco: '',
  tipo_documento: 'cedula_ciudadania',
  numero_documento: '',
  telefono: '',
  direccion: '',
  notas: '',
})

const memberCountLabel = computed(() => (
  members.value.length === 1 ? '1 familiar guardado' : `${members.value.length} familiares guardados`
))

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'No se pudo completar la solicitud')
  return json.data
}

async function loadMembers() {
  try {
    members.value = await fetchJson('/api/family')
    pageError.value = ''
  } catch (error) {
    pageError.value = error.message
  } finally {
    loading.value = false
  }
}

function resetForm(member = null) {
  form.id = member?.id ?? null
  form.nombre = member?.nombre ?? ''
  form.parentesco = member?.parentesco ?? ''
  form.tipo_documento = member?.tipo_documento ?? 'cedula_ciudadania'
  form.numero_documento = member?.numero_documento ?? ''
  form.telefono = member?.telefono ?? ''
  form.direccion = member?.direccion ?? ''
  form.notas = member?.notas ?? ''
  editorError.value = ''
}

function openEditor(member = null) {
  resetForm(member)
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  resetForm()
}

async function saveMember() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(form.id ? `/api/family/${form.id}` : '/api/family', {
      method: form.id ? 'PUT' : 'POST',
      body: JSON.stringify({
        nombre: form.nombre,
        parentesco: form.parentesco,
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento,
        telefono: form.telefono,
        direccion: form.direccion,
        notas: form.notas,
      }),
    })
    editorOpen.value = false
    resetForm()
    await loadMembers()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function deleteMember() {
  if (!form.id || !window.confirm('¿Eliminar este familiar y su PDF? Esta acción no se puede deshacer.')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/family/${form.id}`, { method: 'DELETE' })
    editorOpen.value = false
    resetForm()
    await loadMembers()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function uploadFile(member, event) {
  const input = event.target
  const file = input.files?.[0]
  if (!file) return
  if (file.type !== 'application/pdf') {
    pageError.value = 'Solo puedes adjuntar archivos PDF.'
    input.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    pageError.value = 'El PDF no puede superar 10 MB.'
    input.value = ''
    return
  }

  uploadingId.value = member.id
  pageError.value = ''
  try {
    const response = await fetch(`/api/family/${member.id}/file`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent(file.name),
      },
      body: file,
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.error ?? 'No se pudo subir el PDF')
    await loadMembers()
  } catch (error) {
    pageError.value = error.message
  } finally {
    uploadingId.value = null
    input.value = ''
  }
}

async function removeFile(member) {
  if (!window.confirm(`¿Quitar el PDF de ${member.nombre}?`)) return
  pageError.value = ''
  try {
    await fetchJson(`/api/family/${member.id}/file`, { method: 'DELETE' })
    if (previewMember.value?.id === member.id) previewMember.value = null
    await loadMembers()
  } catch (error) {
    pageError.value = error.message
  }
}

function documentTypeLabel(value) {
  return DOCUMENT_TYPES.find((item) => item.value === value)?.label ?? 'Documento'
}

async function copyDocumentNumber(member) {
  try {
    await navigator.clipboard.writeText(member.numero_documento)
    copiedMemberId.value = member.id
    window.clearTimeout(copyFeedbackTimer)
    copyFeedbackTimer = window.setTimeout(() => {
      copiedMemberId.value = null
    }, 2000)
  } catch {
    pageError.value = 'No se pudo copiar el número. Revisa el permiso del portapapeles e inténtalo de nuevo.'
  }
}

function formatFileSize(value) {
  const bytes = Number(value ?? 0)
  if (!bytes) return ''
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

onMounted(loadMembers)
onBeforeUnmount(() => window.clearTimeout(copyFeedbackTimer))
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Familiar</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">Documentos de tu familia, a la mano</h1>
        <p class="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">Guarda datos de identificación y PDFs privados. Solo los correos autorizados en Nibor pueden acceder.</p>
      </div>
      <button type="button" class="h-10 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openEditor()">
        + Agregar familiar
      </button>
    </header>

    <div class="mt-6 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span class="font-medium text-zinc-700 dark:text-zinc-300">{{ memberCountLabel }}</span>
      <span class="text-xs text-zinc-400">PDF máximo: 10 MB</span>
    </div>

    <div v-if="pageError" class="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      <span>{{ pageError }}</span>
      <button type="button" class="font-bold" aria-label="Cerrar error" @click="pageError = ''">×</button>
    </div>

    <div v-if="loading" class="mt-6 rounded-lg border border-zinc-200 p-10 text-center text-sm text-zinc-400 dark:border-zinc-800">Cargando familiares…</div>

    <div v-else-if="!members.length" class="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
      <div class="text-4xl">👨‍👩‍👧‍👦</div>
      <p class="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">Aún no tienes familiares guardados</p>
      <p class="mt-1 text-sm text-zinc-500">Agrega el primero y luego podrás adjuntar su documento en PDF.</p>
      <button type="button" class="mt-5 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500" @click="openEditor()">Agregar familiar</button>
    </div>

    <section v-else class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="member in members" :key="member.id" class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <button type="button" class="flex w-full items-start gap-3 px-5 py-5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50" @click="openEditor(member)">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">{{ member.nombre.charAt(0).toUpperCase() }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold text-zinc-950 dark:text-white">{{ member.nombre }}</span>
            <span class="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">{{ member.parentesco }}</span>
          </span>
          <span class="text-xs font-medium text-zinc-400">Editar</span>
        </button>

        <div class="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">{{ documentTypeLabel(member.tipo_documento) }}</p>
          <div class="mt-1 flex items-center gap-2">
            <p class="min-w-0 flex-1 break-all font-mono text-lg font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">{{ member.numero_documento }}</p>
            <button
              type="button"
              class="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
              :class="copiedMemberId === member.id ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : ''"
              :aria-label="`Copiar número de documento de ${member.nombre}`"
              :title="copiedMemberId === member.id ? 'Número copiado' : 'Copiar número'"
              @click="copyDocumentNumber(member)"
            >
              <svg v-if="copiedMemberId !== member.id" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" />
              </svg>
              <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 12l4 4L19 6" />
              </svg>
              <span>{{ copiedMemberId === member.id ? 'Copiado' : 'Copiar' }}</span>
            </button>
          </div>
          <div v-if="member.telefono || member.direccion" class="mt-3 grid gap-1.5 text-sm">
            <a v-if="member.telefono" :href="`tel:${member.telefono.replace(/[^\d+]/g, '')}`" class="flex items-center gap-2 text-zinc-700 hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-400">
              <span aria-hidden="true">📞</span>
              <span class="font-medium">{{ member.telefono }}</span>
            </a>
            <p v-if="member.direccion" class="flex items-start gap-2 text-zinc-500 dark:text-zinc-400">
              <span aria-hidden="true">📍</span>
              <span>{{ member.direccion }}</span>
            </p>
          </div>
          <p v-if="member.notas" class="mt-3 whitespace-pre-line text-sm text-zinc-500 dark:text-zinc-400">{{ member.notas }}</p>
        </div>

        <div class="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div v-if="member.file_name" class="grid gap-2">
            <div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>📄</span>
              <span class="min-w-0 flex-1 truncate">{{ member.file_name }}</span>
              <span>{{ formatFileSize(member.file_size) }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500" @click="previewMember = member">Ver PDF</button>
              <a :href="`/api/family/${member.id}/file?download=1`" class="flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">Descargar</a>
              <label class="flex h-9 cursor-pointer items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                {{ uploadingId === member.id ? 'Subiendo…' : 'Reemplazar' }}
                <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingId !== null" @change="uploadFile(member, $event)">
              </label>
              <button type="button" class="h-9 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950" @click="removeFile(member)">Quitar</button>
            </div>
          </div>
          <label v-else class="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm font-medium text-zinc-500 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-emerald-400">
            {{ uploadingId === member.id ? 'Subiendo PDF…' : '📎 Adjuntar cédula en PDF' }}
            <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingId !== null" @change="uploadFile(member, $event)">
          </label>
        </div>
      </article>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">{{ form.id ? 'Editar familiar' : 'Agregar familiar' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveMember">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre completo</span>
              <input v-model="form.nombre" required maxlength="120" type="text" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Parentesco</span>
              <input v-model="form.parentesco" required maxlength="60" type="text" placeholder="Hermano, tía, mamá…" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo de documento</span>
              <select v-model="form.tipo_documento" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="type in DOCUMENT_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Número de documento</span>
              <input v-model="form.numero_documento" required maxlength="40" type="text" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 font-mono text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Teléfono <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="form.telefono" maxlength="30" type="tel" placeholder="300 000 0000" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Dirección <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="form.direccion" maxlength="200" type="text" placeholder="Calle, ciudad…" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="form.notas" maxlength="800" rows="4" placeholder="Información que quieras tener a la mano…" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <p v-if="!form.id" class="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">Después de guardar podrás adjuntar el PDF desde la tarjeta del familiar.</p>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-3 pt-2">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="deleteMember">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="previewMember" class="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 p-3 sm:p-6">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-t-lg bg-zinc-900 px-4 py-3 text-white">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ previewMember.nombre }} · {{ previewMember.parentesco }}</p>
          <p class="truncate text-xs text-zinc-400">{{ previewMember.file_name }}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <a :href="`/api/family/${previewMember.id}/file?download=1`" class="flex h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold hover:bg-emerald-500">Descargar</a>
          <button type="button" class="h-9 rounded-lg bg-zinc-700 px-3 text-sm font-semibold hover:bg-zinc-600" @click="previewMember = null">Cerrar</button>
        </div>
      </div>
      <iframe :src="`/api/family/${previewMember.id}/file`" :title="`Documento de ${previewMember.nombre}`" class="mx-auto h-full w-full max-w-6xl rounded-b-lg bg-white" />
    </div>
  </div>
</template>
