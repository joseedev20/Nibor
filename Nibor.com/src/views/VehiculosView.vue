<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatCOP, formatDate } from '../utils/format.js'
import NotificationModuleSettings from '../components/NotificationModuleSettings.vue'
import { useIsDark } from '../composables/useIsDark.js'

const now = new Date()
const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const vehicles = ref([])
const driverLicense = ref({ categories: [] })
const activeId = ref(null)
const gastos = ref([])
const loading = ref(false)
const saving = ref(false)
const uploadingItemId = ref(null)
const uploadingLicense = ref(false)
const error = ref('')
const notice = ref('')
const isDark = useIsDark()

const vehicleEditorOpen = ref(false)
const vehicleForm = ref(emptyVehicleForm())
const itemEditorOpen = ref(false)
const itemForm = ref(emptyItemForm())
const gastoEditorOpen = ref(false)
const gastoForm = ref(emptyGastoForm())
const licenseCategoryEditorOpen = ref(false)
const licenseCategoryForm = ref(emptyLicenseCategoryForm())
const editorError = ref('')

const activeVehicle = computed(() => vehicles.value.find((v) => v.id === activeId.value) ?? null)
const chartMode = computed(() => (isDark.value ? 'dark' : 'light'))

const TIPO_EMOJI = { carro: '🚗', moto: '🏍️', otro: '🚙' }

const ESTADOS = {
  vigente: { label: 'Vigente', class: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400', ring: 'border-emerald-200 dark:border-emerald-900' },
  por_vencer: { label: 'Por vencer', class: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400', ring: 'border-amber-300 dark:border-amber-800' },
  vencida: { label: 'Vencida', class: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400', ring: 'border-rose-300 dark:border-rose-800' },
  por_configurar: { label: 'Por configurar', class: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400', ring: 'border-zinc-200 dark:border-zinc-800' },
  sin_vencimiento: { label: 'Permanente', class: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400', ring: 'border-sky-200 dark:border-sky-900' },
}

const LICENSE_CATEGORY_DETAILS = {
  A1: 'Motocicletas hasta 125 c. c.',
  A2: 'Motocicletas de más de 125 c. c.',
  B1: 'Automóviles, camperos, camionetas y microbuses particulares',
  B2: 'Camiones rígidos, buses y busetas particulares',
  B3: 'Vehículos articulados particulares',
  C1: 'Automóviles, camperos, camionetas y microbuses de servicio público',
  C2: 'Camiones rígidos, buses y busetas de servicio público',
  C3: 'Vehículos articulados de servicio público',
}

const EXPIRY_CYCLE_DAYS = 365
const GAUGE_COLORS = {
  vigente: { light: '#047857', dark: '#10b981' },
  por_vencer: { light: '#b45309', dark: '#f59e0b' },
  vencida: { light: '#be123c', dark: '#fb7185' },
  por_configurar: { light: '#a1a1aa', dark: '#52525b' },
}

function emptyVehicleForm() {
  return { id: null, nombre: '', tipo: 'carro', placa: '', color: '#2563eb', activa: true }
}

function emptyItemForm() {
  return { id: null, nombre: '', vence: '', notas: '', requiere_vencimiento: true }
}

function emptyGastoForm() {
  return { concepto: '', monto: '', fecha: todayIso }
}

function emptyLicenseCategoryForm() {
  return { id: null, categoria: 'A2', vence: '', notas: '' }
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function loadVehicles({ keepActive = true } = {}) {
  loading.value = true
  error.value = ''
  try {
    vehicles.value = await fetchJson('/api/vehicles')
    if (!keepActive || !vehicles.value.some((v) => v.id === activeId.value)) {
      activeId.value = vehicles.value[0]?.id ?? null
    }
    if (activeId.value) await loadGastos()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadDriverLicense() {
  try {
    driverLicense.value = await fetchJson('/api/vehicles/license')
  } catch (err) {
    error.value = err.message
  }
}

async function loadGastos() {
  if (!activeId.value) {
    gastos.value = []
    return
  }
  try {
    gastos.value = await fetchJson(`/api/vehicles/${activeId.value}/gastos`)
  } catch (err) {
    error.value = err.message
  }
}

function selectVehicle(id) {
  activeId.value = id
  loadGastos()
}

// ── Vehículos ──────────────────────────────────────────────────────────────

function openNewVehicle() {
  editorError.value = ''
  vehicleForm.value = emptyVehicleForm()
  vehicleEditorOpen.value = true
}

function openEditVehicle(vehicle) {
  editorError.value = ''
  vehicleForm.value = {
    id: vehicle.id,
    nombre: vehicle.nombre,
    tipo: vehicle.tipo,
    placa: vehicle.placa ?? '',
    color: vehicle.color,
    activa: Number(vehicle.activa) === 1,
  }
  vehicleEditorOpen.value = true
}

async function saveVehicle() {
  saving.value = true
  editorError.value = ''
  try {
    const payload = {
      nombre: vehicleForm.value.nombre,
      tipo: vehicleForm.value.tipo,
      placa: vehicleForm.value.placa,
      color: vehicleForm.value.color,
      activa: vehicleForm.value.activa,
    }
    const saved = await fetchJson(vehicleForm.value.id ? `/api/vehicles/${vehicleForm.value.id}` : '/api/vehicles', {
      method: vehicleForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    vehicleEditorOpen.value = false
    notice.value = vehicleForm.value.id ? 'Vehículo actualizado.' : 'Vehículo creado con SOAT y Técnico mecánica listos para configurar.'
    await loadVehicles()
    activeId.value = saved.id
    await loadGastos()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteVehicle() {
  if (!vehicleForm.value.id || !window.confirm('¿Eliminar este vehículo y sus documentos?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/vehicles/${vehicleForm.value.id}`, { method: 'DELETE' })
    vehicleEditorOpen.value = false
    notice.value = 'Vehículo eliminado.'
    await loadVehicles({ keepActive: false })
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

// ── Items / documentos ─────────────────────────────────────────────────────

function openNewItem() {
  editorError.value = ''
  itemForm.value = emptyItemForm()
  itemEditorOpen.value = true
}

function openEditItem(item) {
  editorError.value = ''
  itemForm.value = {
    id: item.id,
    nombre: item.nombre,
    vence: item.vence ?? '',
    notas: item.notas ?? '',
    requiere_vencimiento: Number(item.requiere_vencimiento) !== 0,
  }
  itemEditorOpen.value = true
}

async function saveItem() {
  saving.value = true
  editorError.value = ''
  try {
    const payload = {
      nombre: itemForm.value.nombre,
      vence: itemForm.value.requiere_vencimiento ? (itemForm.value.vence || null) : null,
      notas: itemForm.value.notas,
      requiere_vencimiento: itemForm.value.requiere_vencimiento,
    }
    await fetchJson(itemForm.value.id ? `/api/vehicles/items/${itemForm.value.id}` : `/api/vehicles/${activeId.value}/items`, {
      method: itemForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    itemEditorOpen.value = false
    await loadVehicles()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteItem() {
  if (!itemForm.value.id || !window.confirm('¿Eliminar este documento (y su PDF adjunto)?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/vehicles/items/${itemForm.value.id}`, { method: 'DELETE' })
    itemEditorOpen.value = false
    await loadVehicles()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function uploadFile(item, fileEvent) {
  const file = fileEvent.target.files?.[0]
  fileEvent.target.value = ''
  if (!file) return
  if (file.type !== 'application/pdf') {
    error.value = 'Solo se aceptan archivos PDF'
    return
  }
  uploadingItemId.value = item.id
  error.value = ''
  try {
    const response = await fetch(`/api/vehicles/items/${item.id}/file`, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent(file.name) },
      body: file,
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'No se pudo subir el archivo')
    notice.value = `PDF adjuntado a ${item.nombre}.`
    await loadVehicles()
  } catch (err) {
    error.value = err.message
  } finally {
    uploadingItemId.value = null
  }
}

async function removeFile(item) {
  if (!window.confirm(`¿Quitar el PDF de ${item.nombre}?`)) return
  try {
    await fetchJson(`/api/vehicles/items/${item.id}/file`, { method: 'DELETE' })
    await loadVehicles()
  } catch (err) {
    error.value = err.message
  }
}

// ── Licencia de conducción ────────────────────────────────────────────────

function openNewLicenseCategory() {
  editorError.value = ''
  licenseCategoryForm.value = emptyLicenseCategoryForm()
  licenseCategoryEditorOpen.value = true
}

function openEditLicenseCategory(category) {
  editorError.value = ''
  licenseCategoryForm.value = {
    id: category.id,
    categoria: category.categoria,
    vence: category.vence,
    notas: category.notas ?? '',
  }
  licenseCategoryEditorOpen.value = true
}

async function saveLicenseCategory() {
  saving.value = true
  editorError.value = ''
  try {
    const form = licenseCategoryForm.value
    await fetchJson(form.id ? `/api/vehicles/license/categories/${form.id}` : '/api/vehicles/license/categories', {
      method: form.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoria: form.categoria, vence: form.vence, notas: form.notas }),
    })
    licenseCategoryEditorOpen.value = false
    notice.value = form.id ? 'Categoría de licencia actualizada.' : 'Categoría agregada a tu licencia.'
    await loadDriverLicense()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteLicenseCategory() {
  const form = licenseCategoryForm.value
  if (!form.id || !window.confirm(`¿Eliminar la categoría ${form.categoria} de tu licencia?`)) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/vehicles/license/categories/${form.id}`, { method: 'DELETE' })
    licenseCategoryEditorOpen.value = false
    notice.value = `Categoría ${form.categoria} eliminada.`
    await loadDriverLicense()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function uploadLicenseFile(fileEvent) {
  const file = fileEvent.target.files?.[0]
  fileEvent.target.value = ''
  if (!file) return
  if (file.type !== 'application/pdf') {
    error.value = 'Solo se aceptan archivos PDF'
    return
  }
  uploadingLicense.value = true
  error.value = ''
  try {
    const response = await fetch('/api/vehicles/license/file', {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent(file.name) },
      body: file,
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'No se pudo subir la licencia')
    notice.value = 'PDF de la licencia de conducción guardado.'
    await loadDriverLicense()
  } catch (err) {
    error.value = err.message
  } finally {
    uploadingLicense.value = false
  }
}

async function removeLicenseFile() {
  if (!window.confirm('¿Quitar el PDF de tu licencia de conducción?')) return
  try {
    await fetchJson('/api/vehicles/license/file', { method: 'DELETE' })
    notice.value = 'PDF de la licencia eliminado.'
    await loadDriverLicense()
  } catch (err) {
    error.value = err.message
  }
}

// ── Gastos ─────────────────────────────────────────────────────────────────

function openNewGasto() {
  editorError.value = ''
  gastoForm.value = emptyGastoForm()
  gastoEditorOpen.value = true
}

async function saveGasto() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/vehicles/${activeId.value}/gastos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        concepto: gastoForm.value.concepto,
        monto: Number(gastoForm.value.monto),
        fecha: gastoForm.value.fecha,
      }),
    })
    gastoEditorOpen.value = false
    notice.value = 'Gasto registrado — también aparece en Gastos e Ingresos.'
    await loadVehicles()
    await loadGastos()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

function venceLabel(item) {
  if (item.estado === 'sin_vencimiento') return 'Documento sin fecha de vencimiento'
  if (!item.vence) return 'Configura la fecha de vencimiento'
  if (item.estado === 'vencida') return `Venció el ${formatDate(item.vence)} (hace ${Math.abs(item.dias_restantes)} días)`
  if (item.estado === 'por_vencer') return `Vence el ${formatDate(item.vence)} — en ${item.dias_restantes} días`
  return `Vence el ${formatDate(item.vence)}`
}

function normalizeItemName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isExpiryGaugeItem(item) {
  const name = normalizeItemName(item.nombre)
  return name.includes('soat') || name.includes('tecnomecanica') || (name.includes('tecnico') && name.includes('mecanica'))
}

function gaugeColor(item) {
  const color = GAUGE_COLORS[item.estado] ?? GAUGE_COLORS.por_configurar
  return color[chartMode.value]
}

function remainingDays(item) {
  if (item.dias_restantes === null || item.dias_restantes === undefined || item.dias_restantes === '') return null
  const days = Number(item.dias_restantes)
  return Number.isFinite(days) ? days : null
}

function gaugeCenterText(item) {
  const days = remainingDays(item)
  if (days === null) return '--'
  return String(Math.max(0, days))
}

function gaugeSubtext(item) {
  return remainingDays(item) === null ? 'sin fecha' : 'días'
}

function gaugeHeadline(item) {
  const days = remainingDays(item)
  if (days === null) return 'Sin fecha'
  if (days < 0) return `Vencido hace ${Math.abs(days)} días`
  if (days === 0) return 'Vence hoy'
  return `Faltan ${days} días`
}

function gaugeDetail(item) {
  if (!item.vence) return 'Configura vencimiento'
  return `Vence el ${formatDate(item.vence)}`
}

function gaugePercent(item) {
  const days = remainingDays(item)
  if (days === null || days <= 0) return 100
  return Math.max(2, Math.min(100, Math.round((Math.min(days, EXPIRY_CYCLE_DAYS) / EXPIRY_CYCLE_DAYS) * 100)))
}

function gaugeRingStyle(item) {
  const percent = gaugePercent(item)
  const track = chartMode.value === 'dark' ? '#3f3f46' : '#e4e4e7'
  return {
    background: `conic-gradient(${gaugeColor(item)} 0% ${percent}%, ${track} ${percent}% 100%)`,
  }
}

onMounted(() => Promise.all([loadVehicles(), loadDriverLicense()]))
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Vehículos</p>
        <div class="mt-1 flex items-center gap-2">
          <h1 class="text-2xl font-bold">Tu carro y tu moto al día</h1>
          <NotificationModuleSettings module="vehiculos" />
        </div>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">SOAT, tecnomecánica, tarjeta de propiedad, licencia de conducción y gastos conectados a tus finanzas.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNewVehicle">
        Nuevo vehículo
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <!-- Licencia personal: un PDF, varias categorías con fechas independientes -->
    <section class="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Documento personal</p>
          <h2 class="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">Licencia de conducción</h2>
          <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Guarda un solo PDF y registra cada categoría con su propia fecha de vencimiento.</p>
        </div>
        <button type="button" class="h-9 shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNewLicenseCategory">
          + Categoría
        </button>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <template v-if="driverLicense.file_name">
          <a
            href="/api/vehicles/license/file"
            target="_blank"
            rel="noopener"
            class="flex h-9 items-center gap-2 rounded-lg bg-emerald-50 px-3 font-medium text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
          >
            📄 <span class="max-w-52 truncate">{{ driverLicense.file_name }}</span> · Ver PDF
          </a>
          <label class="flex h-9 cursor-pointer items-center rounded-lg border border-zinc-200 px-3 font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
            {{ uploadingLicense ? 'Subiendo…' : 'Reemplazar PDF' }}
            <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingLicense" @change="uploadLicenseFile">
          </label>
          <button type="button" class="h-9 rounded-lg px-3 text-zinc-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" @click="removeLicenseFile">Quitar PDF</button>
        </template>
        <label v-else class="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 font-medium text-zinc-600 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-emerald-400">
          {{ uploadingLicense ? 'Subiendo…' : '📎 Adjuntar PDF de la licencia' }}
          <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingLicense" @change="uploadLicenseFile">
        </label>
      </div>

      <div v-if="!driverLicense.categories?.length" class="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
        Agrega las categorías que aparecen en tu licencia, por ejemplo A2 para moto y B1 para carro.
      </div>
      <div v-else class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="category in driverLicense.categories"
          :key="category.id"
          type="button"
          class="rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
          :class="ESTADOS[category.estado]?.ring"
          @click="openEditLicenseCategory(category)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-base font-extrabold text-white dark:bg-zinc-100 dark:text-zinc-950">{{ category.categoria }}</span>
              <div class="min-w-0">
                <p class="font-semibold text-zinc-900 dark:text-zinc-100">{{ category.tipo_vehiculo === 'moto' ? '🏍️ Moto' : '🚗 Carro' }}</p>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ LICENSE_CATEGORY_DETAILS[category.categoria] }}</p>
              </div>
            </div>
            <span class="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" :class="ESTADOS[category.estado]?.class">{{ ESTADOS[category.estado]?.label }}</span>
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
            <span class="text-zinc-500 dark:text-zinc-400">Vence el {{ formatDate(category.vence) }}</span>
            <strong class="text-zinc-800 dark:text-zinc-200">{{ gaugeHeadline(category) }}</strong>
          </div>
        </button>
      </div>
    </section>

    <div v-if="loading" class="mt-6 rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">Cargando…</div>

    <div v-else-if="!vehicles.length" class="mt-6 rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
      Registra tu primer vehículo — se crea con SOAT, Técnico mecánica y Tarjeta de propiedad listos para configurar.
    </div>

    <template v-else>
      <!-- Tabs de vehículos -->
      <div class="mt-6 flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="vehicle in vehicles"
          :key="vehicle.id"
          type="button"
          class="flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition"
          :class="activeId === vehicle.id
            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
            : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'"
          :style="Number(vehicle.activa) === 0 ? 'opacity: 0.5' : ''"
          @click="selectVehicle(vehicle.id)"
        >
          {{ TIPO_EMOJI[vehicle.tipo] ?? '🚙' }} {{ vehicle.nombre }}
          <span v-if="vehicle.placa" class="rounded bg-black/10 px-1.5 py-0.5 text-xs font-semibold dark:bg-white/10">{{ vehicle.placa }}</span>
        </button>
      </div>

      <template v-if="activeVehicle">
        <!-- Encabezado del vehículo -->
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: activeVehicle.color }" />
            Gastos históricos: <strong class="text-zinc-900 dark:text-zinc-100">{{ formatCOP(activeVehicle.gastos_total) }}</strong> ({{ activeVehicle.gastos_count }})
          </div>
          <div class="flex gap-2">
            <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openEditVehicle(activeVehicle)">Editar vehículo</button>
            <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openNewItem">+ Documento</button>
            <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openNewGasto">+ Gasto</button>
          </div>
        </div>

        <!-- Tarjetas de documentos estilo R5 -->
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="item in activeVehicle.items"
            :key="item.id"
            class="rounded-lg border bg-white p-4 dark:bg-zinc-900"
            :class="ESTADOS[item.estado]?.ring"
          >
            <div class="flex items-start justify-between gap-2">
              <button type="button" class="min-w-0 text-left" @click="openEditItem(item)">
                <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ item.nombre }}</p>
                <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ venceLabel(item) }}</p>
              </button>
              <span class="shrink-0 rounded-full px-2 py-1 text-xs font-semibold" :class="ESTADOS[item.estado]?.class">
                {{ ESTADOS[item.estado]?.label }}
              </span>
            </div>

            <div v-if="isExpiryGaugeItem(item)" class="mt-4 flex items-center gap-4">
              <div class="relative h-24 w-24 shrink-0 rounded-full" :style="gaugeRingStyle(item)">
                <div class="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-zinc-900">
                  <span class="text-xl font-extrabold leading-none text-zinc-900 dark:text-zinc-100">{{ gaugeCenterText(item) }}</span>
                  <span class="mt-1 text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">{{ gaugeSubtext(item) }}</span>
                </div>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ gaugeHeadline(item) }}</p>
                <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ gaugeDetail(item) }}</p>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <template v-if="item.file_name">
                <a
                  :href="`/api/vehicles/items/${item.id}/file`"
                  class="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 font-medium text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
                >
                  📄 <span class="max-w-36 truncate">{{ item.file_name }}</span> ↓
                </a>
                <button type="button" class="h-8 rounded-lg px-2 text-zinc-400 transition hover:text-rose-600" title="Quitar PDF" @click="removeFile(item)">✕</button>
              </template>
              <label v-else class="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-2.5 font-medium text-zinc-500 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-emerald-400">
                {{ uploadingItemId === item.id ? 'Subiendo…' : '📎 Adjuntar PDF' }}
                <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingItemId !== null" @change="uploadFile(item, $event)">
              </label>
            </div>
          </article>
        </div>

        <!-- Gastos del vehículo -->
        <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <h2 class="text-sm font-semibold">Gastos de {{ activeVehicle.nombre }}</h2>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">Cada gasto se registra también en Gastos e Ingresos (categoría Vehículos 🚗)</p>
            </div>
          </div>
          <div v-if="!gastos.length" class="p-6 text-center text-sm text-zinc-400">Sin gastos registrados. Usa "+ Gasto" — ej: arreglo de frenos, $500.000.</div>
          <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
            <div v-for="gasto in gastos" :key="gasto.id" class="flex items-center justify-between px-4 py-2.5 text-sm">
              <span class="min-w-0 truncate">{{ gasto.descripcion }}</span>
              <span class="flex shrink-0 items-center gap-3">
                <span class="text-xs text-zinc-400">{{ formatDate(gasto.fecha) }}</span>
                <span class="font-semibold tabular-nums">{{ formatCOP(gasto.monto) }}</span>
              </span>
            </div>
          </div>
        </section>
      </template>
    </template>

    <!-- Modal vehículo -->
    <div v-if="vehicleEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="vehicleEditorOpen = false">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ vehicleForm.id ? 'Editar vehículo' : 'Nuevo vehículo' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveVehicle">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="vehicleForm.nombre" type="text" placeholder="p. ej. Moto AKT, Carro" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="vehicleForm.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="carro">🚗 Carro</option>
                <option value="moto">🏍️ Moto</option>
                <option value="otro">🚙 Otro</option>
              </select>
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm sm:col-span-2">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Placa <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="vehicleForm.placa" type="text" placeholder="WDZ90E" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 uppercase text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Color</span>
              <input v-model="vehicleForm.color" type="color" class="h-10 rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
          </div>
          <label v-if="vehicleForm.id" class="flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <input v-model="vehicleForm.activa" type="checkbox" class="h-4 w-4 accent-emerald-600">
            Activo
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="vehicleForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteVehicle">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="vehicleEditorOpen = false">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal documento -->
    <div v-if="itemEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="itemEditorOpen = false">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ itemForm.id ? 'Editar documento' : 'Nuevo documento' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveItem">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="itemForm.nombre" type="text" placeholder="p. ej. SOAT, Licencia, Llantas" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label v-if="itemForm.requiere_vencimiento" class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Vence <span class="font-normal text-zinc-400">(opcional)</span></span>
              <input v-model="itemForm.vence" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <div v-else class="flex items-end">
              <p class="flex h-10 w-full items-center rounded-lg bg-sky-50 px-3 text-sm text-sky-700 dark:bg-sky-950 dark:text-sky-300">Documento sin vencimiento</p>
            </div>
          </div>
          <label class="flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <input v-model="itemForm.requiere_vencimiento" type="checkbox" class="h-4 w-4 accent-emerald-600">
            Este documento tiene fecha de vencimiento
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="itemForm.notas" rows="2" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="itemForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteItem">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="itemEditorOpen = false">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal categoría de licencia -->
    <div v-if="licenseCategoryEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="licenseCategoryEditorOpen = false">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ licenseCategoryForm.id ? 'Editar categoría de licencia' : 'Agregar categoría a la licencia' }}</h2>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Cada categoría puede tener una fecha diferente aunque aparezca en la misma licencia física.</p>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveLicenseCategory">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Categoría</span>
              <select v-model="licenseCategoryForm.categoria" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <optgroup label="Moto">
                  <option value="A1">A1 · Moto hasta 125 c. c.</option>
                  <option value="A2">A2 · Moto de más de 125 c. c.</option>
                </optgroup>
                <optgroup label="Carro particular">
                  <option value="B1">B1 · Carro particular</option>
                  <option value="B2">B2 · Camión/bus particular</option>
                  <option value="B3">B3 · Articulado particular</option>
                </optgroup>
                <optgroup label="Servicio público">
                  <option value="C1">C1 · Carro público</option>
                  <option value="C2">C2 · Camión/bus público</option>
                  <option value="C3">C3 · Articulado público</option>
                </optgroup>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha de vencimiento</span>
              <input v-model="licenseCategoryForm.vence" type="date" required class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <div class="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            {{ LICENSE_CATEGORY_DETAILS[licenseCategoryForm.categoria] }}
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="licenseCategoryForm.notas" rows="2" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="licenseCategoryForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteLicenseCategory">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="licenseCategoryEditorOpen = false">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal gasto -->
    <div v-if="gastoEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="gastoEditorOpen = false">
      <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">Gasto de {{ activeVehicle?.nombre }}</h2>
          <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Se registra también en Gastos e Ingresos.</p>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveGasto">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Concepto</span>
            <input v-model="gastoForm.concepto" type="text" placeholder="p. ej. arreglo de frenos" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto</span>
              <input v-model="gastoForm.monto" type="number" min="1" step="0.01" placeholder="500000" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha</span>
              <input v-model="gastoForm.fecha" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="gastoEditorOpen = false">Cancelar</button>
            <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Registrar gasto' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
