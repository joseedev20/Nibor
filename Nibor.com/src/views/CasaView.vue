<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { formatCOP, formatDate, monthName } from '../utils/format.js'

const property = ref(null)
const periods = ref([])
const anios = ref([])
const resumen = ref(null)
const loading = ref(true)
const pageError = ref('')
const selectedAnio = ref(null)
const estadoFilter = ref('')

const editorOpen = ref(false)
const saving = ref(false)
const editorError = ref('')
const paymentOpen = ref(false)
const paymentPeriod = ref(null)
const propertyEditorOpen = ref(false)
const uploadingId = ref(null)
const previewPeriod = ref(null)

const ESTADO_META = {
  pendiente: { label: 'Pendiente', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  pagado_con_descuento: { label: 'Pagado con descuento', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  pagado_sin_descuento: { label: 'Pagado sin descuento', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  en_mora: { label: 'En mora', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

const ESTADO_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'pagado_con_descuento', label: 'Con descuento' },
  { value: 'pagado_sin_descuento', label: 'Sin descuento' },
  { value: 'en_mora', label: 'En mora' },
]

const MESES = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: monthName(index + 1) }))

const now = new Date()

const form = reactive({
  id: null,
  anio: now.getFullYear(),
  mes: now.getMonth() + 1,
  fecha_emision: '',
  numero_cuenta: '',
  fecha_limite_descuento: '',
  fecha_vencimiento: '',
  descuento_pct: '',
  descuento_valor: '',
  total_con_descuento: '',
  notas: '',
  items: [],
})

const paymentForm = reactive({ fecha_pago: '', valor_pagado: '', mora_cobrada: '' })
const propertyForm = reactive({ id: null, nombre: '', notas: '' })

const yearOptions = computed(() => {
  const set = new Set(anios.value)
  if (selectedAnio.value) set.add(selectedAnio.value)
  set.add(now.getFullYear())
  return [...set].sort((a, b) => b - a)
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

async function loadPeriods() {
  try {
    const params = new URLSearchParams()
    if (selectedAnio.value) params.set('anio', String(selectedAnio.value))
    if (estadoFilter.value) params.set('estado', estadoFilter.value)
    const query = params.toString()
    const data = await fetchJson(`/api/home/periods${query ? `?${query}` : ''}`)
    property.value = data.property
    periods.value = data.periods
    anios.value = data.anios
    resumen.value = data.resumen
    if (data.resumen) selectedAnio.value = data.resumen.anio
    pageError.value = ''
  } catch (error) {
    pageError.value = error.message
  } finally {
    loading.value = false
  }
}

function changeAnio(event) {
  selectedAnio.value = Number(event.target.value)
  loadPeriods()
}

function changeEstado(value) {
  estadoFilter.value = value
  loadPeriods()
}

// ── Propiedad ────────────────────────────────────────────────────────────────

function openPropertyEditor() {
  propertyForm.id = property.value?.id ?? null
  propertyForm.nombre = property.value?.nombre ?? ''
  propertyForm.notas = property.value?.notas ?? ''
  editorError.value = ''
  propertyEditorOpen.value = true
}

async function saveProperty() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(propertyForm.id ? `/api/home/properties/${propertyForm.id}` : '/api/home/properties', {
      method: propertyForm.id ? 'PUT' : 'POST',
      body: JSON.stringify({ nombre: propertyForm.nombre, notas: propertyForm.notas }),
    })
    propertyEditorOpen.value = false
    await loadPeriods()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

// ── Mensualidad (cuenta de cobro) ────────────────────────────────────────────

function emptyItem(concepto = '') {
  return { concepto, saldo_anterior: '', cuota_mes: '', nuevo_saldo: '' }
}

function resetForm(period = null) {
  form.id = period?.id ?? null
  form.anio = period?.anio ?? (selectedAnio.value ?? now.getFullYear())
  form.mes = period?.mes ?? now.getMonth() + 1
  form.fecha_emision = period?.fecha_emision ?? ''
  form.numero_cuenta = period?.numero_cuenta ?? ''
  form.fecha_limite_descuento = period?.fecha_limite_descuento ?? ''
  form.fecha_vencimiento = period?.fecha_vencimiento ?? ''
  form.descuento_pct = period?.descuento_pct ?? ''
  form.descuento_valor = period?.descuento_valor ?? ''
  form.total_con_descuento = period?.total_con_descuento ?? ''
  form.notas = period?.notas ?? ''
  form.items = period?.items?.length
    ? period.items.map((item) => ({
      concepto: item.concepto,
      saldo_anterior: item.saldo_anterior,
      cuota_mes: item.cuota_mes,
      nuevo_saldo: item.nuevo_saldo,
    }))
    : [emptyItem('Administración')]
  editorError.value = ''
}

async function openEditor(period = null) {
  resetForm(period)
  editorOpen.value = true
  if (period || !property.value) return
  // Mes nuevo: el backend sugiere el mes siguiente con los conceptos y el
  // saldo anterior arrastrado del último periodo (0 si ya quedó pagado).
  try {
    const template = await fetchJson(`/api/home/periods/template?property_id=${property.value.id}`)
    if (template && editorOpen.value && !form.id) {
      form.anio = template.anio
      form.mes = template.mes
      form.items = template.items.map((item) => ({ ...item }))
    }
  } catch {
    // sin plantilla se conservan los valores por defecto
  }
}

function syncNuevoSaldo(item) {
  const saldo = Number(item.saldo_anterior) || 0
  const cuota = Number(item.cuota_mes) || 0
  item.nuevo_saldo = Math.round((saldo + cuota) * 100) / 100
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
}

function addItem() {
  form.items.push(emptyItem())
}

function removeItem(index) {
  form.items.splice(index, 1)
}

async function savePeriod() {
  saving.value = true
  editorError.value = ''
  try {
    const payload = {
      property_id: property.value.id,
      anio: form.anio,
      mes: form.mes,
      fecha_emision: form.fecha_emision || null,
      numero_cuenta: form.numero_cuenta || null,
      fecha_limite_descuento: form.fecha_limite_descuento || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      descuento_pct: form.descuento_pct === '' ? null : form.descuento_pct,
      descuento_valor: form.descuento_valor === '' ? null : form.descuento_valor,
      total_con_descuento: form.total_con_descuento === '' ? null : form.total_con_descuento,
      notas: form.notas || null,
      items: form.items,
    }
    await fetchJson(form.id ? `/api/home/periods/${form.id}` : '/api/home/periods', {
      method: form.id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    })
    editorOpen.value = false
    if (!form.id) selectedAnio.value = form.anio
    await loadPeriods()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function deletePeriod() {
  if (!form.id || !window.confirm('¿Eliminar esta mensualidad y su PDF? Esta acción no se puede deshacer.')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/home/periods/${form.id}`, { method: 'DELETE' })
    editorOpen.value = false
    await loadPeriods()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

// ── Pago ─────────────────────────────────────────────────────────────────────

function openPayment(period) {
  paymentPeriod.value = period
  paymentForm.fecha_pago = period.fecha_pago ?? ''
  paymentForm.valor_pagado = period.valor_pagado ?? ''
  paymentForm.mora_cobrada = period.mora_cobrada ?? ''
  editorError.value = ''
  paymentOpen.value = true
}

async function savePayment() {
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/home/periods/${paymentPeriod.value.id}/payment`, {
      method: 'PUT',
      body: JSON.stringify({
        fecha_pago: paymentForm.fecha_pago,
        valor_pagado: paymentForm.valor_pagado,
        mora_cobrada: paymentForm.mora_cobrada === '' ? null : paymentForm.mora_cobrada,
      }),
    })
    paymentOpen.value = false
    await loadPeriods()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

async function removePayment() {
  if (!window.confirm('¿Quitar el pago registrado de esta mensualidad?')) return
  saving.value = true
  editorError.value = ''
  try {
    await fetchJson(`/api/home/periods/${paymentPeriod.value.id}/payment`, { method: 'DELETE' })
    paymentOpen.value = false
    await loadPeriods()
  } catch (error) {
    editorError.value = error.message
  } finally {
    saving.value = false
  }
}

// ── PDF único por periodo ────────────────────────────────────────────────────

async function uploadFile(period, event) {
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

  uploadingId.value = period.id
  pageError.value = ''
  try {
    const response = await fetch(`/api/home/periods/${period.id}/file`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent(file.name),
      },
      body: file,
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.error ?? 'No se pudo subir el PDF')
    await loadPeriods()
  } catch (error) {
    pageError.value = error.message
  } finally {
    uploadingId.value = null
    input.value = ''
  }
}

async function removeFile(period) {
  if (!window.confirm(`¿Quitar el PDF de ${monthName(period.mes, period.anio)}?`)) return
  pageError.value = ''
  try {
    await fetchJson(`/api/home/periods/${period.id}/file`, { method: 'DELETE' })
    if (previewPeriod.value?.id === period.id) previewPeriod.value = null
    await loadPeriods()
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

onMounted(loadPeriods)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Casa</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">Administración de tu propiedad</h1>
        <p class="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Registra cada cuenta de cobro mensual, su pago y el PDF con la cuenta y el comprobante unidos.
        </p>
      </div>
      <div v-if="property" class="flex shrink-0 gap-2">
        <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openPropertyEditor">
          {{ property.nombre }} ✎
        </button>
        <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openEditor()">
          + Registrar mes
        </button>
      </div>
    </header>

    <div v-if="pageError" class="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      <span>{{ pageError }}</span>
      <button type="button" class="font-bold" aria-label="Cerrar error" @click="pageError = ''">×</button>
    </div>

    <div v-if="loading" class="mt-6 rounded-lg border border-zinc-200 p-10 text-center text-sm text-zinc-400 dark:border-zinc-800">Cargando mensualidades…</div>

    <div v-else-if="!property" class="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
      <div class="text-4xl">🏢</div>
      <p class="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">Configura tu propiedad</p>
      <p class="mt-1 text-sm text-zinc-500">Dale un nombre (por ejemplo "Apartamento") y luego registra la administración de cada mes.</p>
      <button type="button" class="mt-5 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500" @click="openPropertyEditor">Crear propiedad</button>
    </div>

    <template v-else>
      <section v-if="resumen" class="mt-6 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Total pagado {{ resumen.anio }}</p>
          <p class="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">{{ formatCOP(resumen.total_pagado) }}</p>
          <p class="mt-0.5 text-xs text-zinc-500">{{ resumen.pagados }} de {{ resumen.meses_registrados }} meses pagados</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Descuentos ganados</p>
          <p class="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ formatCOP(resumen.total_descuentos) }}</p>
          <p class="mt-0.5 text-xs text-zinc-500">{{ resumen.con_descuento }} pagos con descuento · {{ resumen.sin_descuento }} sin descuento</p>
        </div>
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Moras pagadas</p>
          <p class="mt-1 text-2xl font-bold" :class="resumen.total_moras > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-950 dark:text-white'">{{ formatCOP(resumen.total_moras) }}</p>
          <p class="mt-0.5 text-xs text-zinc-500">{{ resumen.en_mora }} meses en mora · {{ resumen.pendientes }} pendientes</p>
        </div>
      </section>

      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="option in ESTADO_FILTERS"
            :key="option.value"
            type="button"
            class="h-8 rounded-full border px-3 text-xs font-semibold transition"
            :class="estadoFilter === option.value
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="changeEstado(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <select :value="selectedAnio" class="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @change="changeAnio">
          <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
        </select>
      </div>

      <div v-if="!periods.length" class="mt-6 rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
        <div class="text-4xl">🧾</div>
        <p class="mt-3 font-semibold text-zinc-800 dark:text-zinc-200">
          {{ estadoFilter ? 'No hay mensualidades con este estado' : `Aún no has registrado meses de ${selectedAnio}` }}
        </p>
        <p class="mt-1 text-sm text-zinc-500">Registra la cuenta de cobro del mes para llevar el control de pagos y descuentos.</p>
        <button v-if="!estadoFilter" type="button" class="mt-5 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500" @click="openEditor()">Registrar mes</button>
      </div>

      <section v-else class="mt-4 grid gap-4">
        <article v-for="period in periods" :key="period.id" class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-bold text-zinc-950 dark:text-white">{{ monthName(period.mes, period.anio) }}</h2>
              <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="ESTADO_META[period.estado]?.badge">{{ ESTADO_META[period.estado]?.label ?? period.estado }}</span>
            </div>
            <div class="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span v-if="period.numero_cuenta">Cuenta {{ period.numero_cuenta }}</span>
              <span v-if="period.fecha_emision">Emitida {{ formatDate(period.fecha_emision) }}</span>
              <button type="button" class="font-semibold text-emerald-700 hover:underline dark:text-emerald-400" @click="openEditor(period)">Editar</button>
            </div>
          </div>

          <div class="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_16rem]">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr class="text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <th class="pb-2 pr-3 font-medium">Concepto</th>
                    <th class="pb-2 pr-3 text-right font-medium">Saldo anterior</th>
                    <th class="pb-2 pr-3 text-right font-medium">Cuota del mes</th>
                    <th class="pb-2 text-right font-medium">Nuevo saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in period.items" :key="item.id" class="border-t border-zinc-100 dark:border-zinc-800">
                    <td class="py-1.5 pr-3 text-zinc-700 dark:text-zinc-300">{{ item.concepto }}</td>
                    <td class="py-1.5 pr-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{{ formatCOP(item.saldo_anterior) }}</td>
                    <td class="py-1.5 pr-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{{ formatCOP(item.cuota_mes) }}</td>
                    <td class="py-1.5 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{{ formatCOP(item.nuevo_saldo) }}</td>
                  </tr>
                  <tr class="border-t border-zinc-200 font-semibold dark:border-zinc-700">
                    <td class="py-2 pr-3 text-zinc-900 dark:text-zinc-100">Total</td>
                    <td class="py-2 pr-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCOP(period.total_saldo_anterior) }}</td>
                    <td class="py-2 pr-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCOP(period.total_cuota_mes) }}</td>
                    <td class="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCOP(period.total_nuevo_saldo) }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="period.total_con_descuento !== null && period.fecha_limite_descuento" class="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                💡 Pagando antes del {{ formatDate(period.fecha_limite_descuento) }}: <span class="font-semibold">{{ formatCOP(period.total_con_descuento) }}</span>
                <template v-if="period.descuento_valor"> (descuento de {{ formatCOP(period.descuento_valor) }})</template>
              </p>
              <p v-if="period.fecha_vencimiento" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Vence el {{ formatDate(period.fecha_vencimiento) }}</p>
              <p v-if="period.notas" class="mt-2 whitespace-pre-line text-xs text-zinc-500 dark:text-zinc-400">{{ period.notas }}</p>
            </div>

            <div class="grid content-start gap-3">
              <div class="rounded-lg border border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Pago</p>
                <template v-if="period.pagado">
                  <p class="mt-1 text-lg font-bold tabular-nums text-zinc-950 dark:text-white">{{ formatCOP(period.valor_pagado) }}</p>
                  <p class="text-xs text-zinc-500">{{ formatDate(period.fecha_pago) }}</p>
                  <p v-if="Number(period.mora_cobrada) > 0" class="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">Mora cobrada: {{ formatCOP(period.mora_cobrada) }}</p>
                  <button type="button" class="mt-2 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400" @click="openPayment(period)">Editar pago</button>
                </template>
                <template v-else>
                  <p class="mt-1 text-sm text-zinc-500">Sin pago registrado</p>
                  <button type="button" class="mt-2 h-9 w-full rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500" @click="openPayment(period)">Registrar pago</button>
                </template>
              </div>

              <div class="rounded-lg border border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">PDF del mes</p>
                <div v-if="period.file_name" class="mt-2 grid gap-2">
                  <div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>📄</span>
                    <span class="min-w-0 flex-1 truncate">{{ period.file_name }}</span>
                    <span>{{ formatFileSize(period.file_size) }}</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500" @click="previewPeriod = period">Ver</button>
                    <a :href="`/api/home/periods/${period.id}/file?download=1`" class="flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">Descargar</a>
                    <label class="flex h-8 cursor-pointer items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      {{ uploadingId === period.id ? 'Subiendo…' : 'Reemplazar' }}
                      <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingId !== null" @change="uploadFile(period, $event)">
                    </label>
                    <button type="button" class="h-8 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950" @click="removeFile(period)">Quitar</button>
                  </div>
                </div>
                <label v-else class="mt-2 flex h-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs font-medium text-zinc-500 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-emerald-400">
                  {{ uploadingId === period.id ? 'Subiendo PDF…' : '📎 Adjuntar cuenta + comprobante' }}
                  <input type="file" accept="application/pdf" class="hidden" :disabled="uploadingId !== null" @change="uploadFile(period, $event)">
                </label>
              </div>
            </div>
          </div>
        </article>
      </section>
    </template>

    <!-- Modal propiedad -->
    <div v-if="propertyEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="propertyEditorOpen = false">
      <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">{{ propertyForm.id ? 'Editar propiedad' : 'Crear propiedad' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveProperty">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
            <input v-model="propertyForm.nombre" required maxlength="120" type="text" placeholder="Apartamento" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="propertyForm.notas" maxlength="800" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="propertyEditorOpen = false">Cancelar</button>
            <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal mensualidad -->
    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="closeEditor">
      <div class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">{{ form.id ? `Editar ${monthName(form.mes, form.anio)}` : 'Registrar mensualidad' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="savePeriod">
          <div class="grid gap-4 sm:grid-cols-4">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Año</span>
              <input v-model.number="form.anio" required type="number" min="1900" max="2200" :disabled="!!form.id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Mes</span>
              <select v-model.number="form.mes" :disabled="!!form.id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="month in MESES" :key="month.value" :value="month.value">{{ month.label }}</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha de emisión</span>
              <input v-model="form.fecha_emision" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">N.º de cuenta</span>
              <input v-model="form.numero_cuenta" maxlength="40" type="text" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>

          <fieldset class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <legend class="px-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Conceptos de la cuenta</legend>
            <div class="grid gap-2">
              <div class="hidden gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400 sm:grid sm:grid-cols-[1fr_7rem_7rem_7rem_2rem]">
                <span>Concepto</span><span class="text-right">Saldo anterior</span><span class="text-right">Cuota del mes</span><span class="text-right">Nuevo saldo</span><span />
              </div>
              <div v-for="(item, index) in form.items" :key="index" class="grid gap-2 rounded-lg border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-[1fr_7rem_7rem_7rem_2rem] sm:border-0 sm:p-0">
                <input v-model="item.concepto" required maxlength="80" type="text" placeholder="Administración, Parqueadero…" class="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <label class="grid gap-0.5">
                  <span class="text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:hidden">Saldo anterior</span>
                  <input v-model.number="item.saldo_anterior" type="number" step="0.01" placeholder="0" class="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @input="syncNuevoSaldo(item)">
                </label>
                <label class="grid gap-0.5">
                  <span class="text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:hidden">Cuota del mes</span>
                  <input v-model.number="item.cuota_mes" type="number" step="0.01" placeholder="0" class="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" @input="syncNuevoSaldo(item)">
                </label>
                <label class="grid gap-0.5">
                  <span class="text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:hidden">Nuevo saldo <span class="normal-case">(se calcula solo)</span></span>
                  <input v-model.number="item.nuevo_saldo" type="number" step="0.01" placeholder="0" class="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                </label>
                <button type="button" class="h-9 rounded-lg text-sm font-bold text-rose-500 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950" :disabled="form.items.length === 1" aria-label="Quitar concepto" @click="removeItem(index)">×</button>
              </div>
              <button type="button" class="h-9 rounded-lg border border-dashed border-zinc-300 text-sm font-medium text-zinc-500 hover:border-emerald-500 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-emerald-400" @click="addItem">+ Agregar concepto</button>
            </div>
            <p class="mt-2 text-xs text-zinc-400">El nuevo saldo se calcula solo (saldo anterior + cuota) y puedes ajustarlo si tu cuenta trae otro valor. Los totales del mes los calcula Nibor.</p>
          </fieldset>

          <fieldset class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <legend class="px-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Descuento y vencimiento</legend>
            <div class="grid gap-4 sm:grid-cols-4">
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Descuento %</span>
                <input v-model.number="form.descuento_pct" type="number" step="0.01" min="0" max="100" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </label>
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Valor descuento</span>
                <input v-model.number="form.descuento_valor" type="number" step="0.01" min="0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </label>
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Total con descuento</span>
                <input v-model.number="form.total_con_descuento" type="number" step="0.01" min="0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </label>
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Pagar antes de</span>
                <input v-model="form.fecha_limite_descuento" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </label>
            </div>
            <div class="mt-3 grid gap-4 sm:grid-cols-4">
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Vencimiento</span>
                <input v-model="form.fecha_vencimiento" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </label>
            </div>
            <p class="mt-2 text-xs text-zinc-400">El descuento puede aplicar solo a algunos conceptos; registra el valor tal como viene en la cuenta.</p>
          </fieldset>

          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas <span class="font-normal text-zinc-400">(opcional)</span></span>
            <textarea v-model="form.notas" maxlength="800" rows="2" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>

          <p v-if="!form.id" class="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">Después de guardar podrás registrar el pago y adjuntar el PDF desde la tarjeta del mes.</p>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-3 pt-1">
            <button v-if="form.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="deletePeriod">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditor">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal pago -->
    <div v-if="paymentOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 backdrop-blur-sm" @click.self="paymentOpen = false">
      <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="font-semibold text-zinc-950 dark:text-white">Pago de {{ monthName(paymentPeriod.mes, paymentPeriod.anio) }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="savePayment">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha de pago</span>
            <input v-model="paymentForm.fecha_pago" required type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Valor pagado</span>
            <input v-model.number="paymentForm.valor_pagado" required type="number" step="0.01" min="0.01" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Mora cobrada <span class="font-normal text-zinc-400">(si te cobraron)</span></span>
            <input v-model.number="paymentForm.mora_cobrada" type="number" step="0.01" min="0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-3 pt-1">
            <button v-if="paymentPeriod?.pagado" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="removePayment">Quitar pago</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="paymentOpen = false">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar pago' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Visor PDF -->
    <div v-if="previewPeriod" class="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 p-3 sm:p-6">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-t-lg bg-zinc-900 px-4 py-3 text-white">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ monthName(previewPeriod.mes, previewPeriod.anio) }} · {{ property?.nombre }}</p>
          <p class="truncate text-xs text-zinc-400">{{ previewPeriod.file_name }}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <a :href="`/api/home/periods/${previewPeriod.id}/file?download=1`" class="flex h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold hover:bg-emerald-500">Descargar</a>
          <button type="button" class="h-9 rounded-lg bg-zinc-700 px-3 text-sm font-semibold hover:bg-zinc-600" @click="previewPeriod = null">Cerrar</button>
        </div>
      </div>
      <iframe :src="`/api/home/periods/${previewPeriod.id}/file`" :title="`Administración de ${monthName(previewPeriod.mes, previewPeriod.anio)}`" class="mx-auto h-full w-full max-w-6xl rounded-b-lg bg-white" />
    </div>
  </div>
</template>
