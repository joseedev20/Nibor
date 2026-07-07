<script setup>
import { computed, onMounted, ref } from 'vue'
import VChart from '../charts/setup.js'
import { useIsDark } from '../composables/useIsDark.js'
import { chartInk, NEGATIVE_COLOR, POSITIVE_COLOR } from '../utils/chartColors.js'
import { formatDate } from '../utils/format.js'

const CONDITION_TYPES = [
  { id: 'general', label: 'General' },
  { id: 'cardiovascular', label: 'Cardiovascular' },
  { id: 'vision', label: 'Visión' },
  { id: 'respiratorio', label: 'Respiratorio' },
  { id: 'otro', label: 'Otro' },
]
const CONDITION_STATUSES = [
  { id: 'activo', label: 'Activo' },
  { id: 'controlado', label: 'Controlado' },
  { id: 'resuelto', label: 'Resuelto' },
]
const APPOINTMENT_STATUSES = [
  { id: 'programada', label: 'Programada' },
  { id: 'asistida', label: 'Asistida' },
  { id: 'cancelada', label: 'Cancelada' },
]
const BMI_TONE_CLASSES = {
  zinc: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}
const CONDITION_TYPE_LABELS = Object.fromEntries(CONDITION_TYPES.map((type) => [type.id, type.label]))
const CONDITION_STATUS_LABELS = Object.fromEntries(CONDITION_STATUSES.map((status) => [status.id, status.label]))
const APPOINTMENT_STATUS_LABELS = Object.fromEntries(APPOINTMENT_STATUSES.map((status) => [status.id, status.label]))

const health = ref(emptyHealth())
const habitActivity = ref({ events: [], summary: [] })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editorError = ref('')
const notice = ref('')

const profileForm = ref(emptyProfileForm())
const measurementEditorOpen = ref(false)
const conditionEditorOpen = ref(false)
const medicationEditorOpen = ref(false)
const appointmentEditorOpen = ref(false)
const visionEditorOpen = ref(false)
const measurementForm = ref(emptyMeasurementForm())
const conditionForm = ref(emptyConditionForm())
const medicationForm = ref(emptyMedicationForm())
const appointmentForm = ref(emptyAppointmentForm())
const visionForm = ref(emptyVisionForm())

const isDark = useIsDark()
const mode = computed(() => (isDark.value ? 'dark' : 'light'))
const ink = computed(() => chartInk(mode.value))
const chartSeries = computed(() => health.value.summary?.series ?? [])
const hasChartData = computed(() => chartSeries.value.length > 0)
const latestMeasurement = computed(() => health.value.measurements[0] ?? null)
const activeConditions = computed(() => health.value.conditions.filter((condition) => condition.estado !== 'resuelto'))
const activeMedications = computed(() => health.value.medications.filter((medication) => Number(medication.activa) === 1))
const upcomingAppointments = computed(() => health.value.appointments.filter((appointment) => appointment.estado === 'programada'))
const latestVision = computed(() => health.value.vision[0] ?? null)
const bmiToneClass = computed(() => BMI_TONE_CLASSES[health.value.summary?.categoria_imc?.tone] ?? BMI_TONE_CLASSES.zinc)
const habitActivityTotal = computed(() => habitActivity.value.summary.reduce((sum, item) => sum + Number(item.total ?? 0), 0))
const healthChartOption = computed(() => ({
  color: [POSITIVE_COLOR[mode.value], '#2563eb'],
  textStyle: { color: ink.value.text },
  tooltip: {
    trigger: 'axis',
    backgroundColor: ink.value.surface,
    borderColor: ink.value.axisLine,
    textStyle: { color: ink.value.text },
  },
  legend: {
    top: 0,
    textStyle: { color: ink.value.text },
  },
  grid: { left: 12, right: 12, top: 44, bottom: 24, containLabel: true },
  xAxis: {
    type: 'category',
    data: chartSeries.value.map((item) => formatDate(item.fecha)),
    axisLabel: { color: ink.value.muted },
    axisLine: { lineStyle: { color: ink.value.axisLine } },
    axisTick: { show: false },
  },
  yAxis: [
    {
      type: 'value',
      name: 'kg',
      min: (value) => Math.max(0, Math.floor(value.min - 2)),
      axisLabel: { color: ink.value.muted },
      axisLine: { lineStyle: { color: ink.value.axisLine } },
      splitLine: { lineStyle: { color: ink.value.grid } },
    },
    {
      type: 'value',
      name: 'IMC',
      min: (value) => Math.max(0, Math.floor(value.min - 1)),
      axisLabel: { color: ink.value.muted },
      axisLine: { lineStyle: { color: ink.value.axisLine } },
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: 'Peso',
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      symbolSize: 7,
      data: chartSeries.value.map((item) => item.peso_kg),
    },
    {
      name: 'IMC',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      symbolSize: 7,
      data: chartSeries.value.map((item) => item.imc),
    },
  ],
}))

function emptyHealth() {
  return {
    profile: null,
    measurements: [],
    conditions: [],
    medications: [],
    appointments: [],
    vision: [],
    summary: {
      peso_actual: null,
      estatura_cm: null,
      imc_actual: null,
      categoria_imc: { label: 'Sin IMC', tone: 'zinc' },
      condiciones_activas: 0,
      medicamentos_activos: 0,
      citas_programadas: 0,
      proxima_cita: null,
      condiciones_vision: 0,
      series: [],
    },
  }
}

function todayLocal() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function nowLocalDateTime() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function emptyProfileForm() {
  return { estatura_cm: null, fecha_nacimiento: '', sexo: '', notas: '' }
}

function emptyMeasurementForm() {
  return { id: null, fecha: todayLocal(), peso_kg: null, estatura_cm: null, notas: '' }
}

function emptyConditionForm() {
  return { id: null, nombre: '', tipo: 'general', estado: 'activo', fecha_diagnostico: '', notas: '' }
}

function emptyMedicationForm() {
  return { id: null, condition_id: '', nombre: '', dosis: '', frecuencia: 'Diaria', hora: '09:00', activa: true, notas: '' }
}

function emptyAppointmentForm() {
  return { id: null, fecha_hora: nowLocalDateTime(), especialidad: '', profesional: '', lugar: '', motivo: '', estado: 'programada', notas: '' }
}

function emptyVisionForm() {
  return {
    id: null,
    fecha: todayLocal(),
    ojo_derecho_esfera: null,
    ojo_derecho_cilindro: null,
    ojo_derecho_eje: null,
    ojo_izquierdo_esfera: null,
    ojo_izquierdo_cilindro: null,
    ojo_izquierdo_eje: null,
    notas: '',
  }
}

function formatKg(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg`
}

function formatCm(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} cm`
}

function formatBmi(value) {
  if (value === null || value === undefined) return '—'
  return Number(value).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatDateTime(value) {
  if (!value) return '—'
  return `${formatDate(value.slice(0, 10))} · ${value.slice(11, 16)}`
}

function typeLabel(type) {
  return CONDITION_TYPE_LABELS[type] ?? type
}

function conditionStatusLabel(status) {
  return CONDITION_STATUS_LABELS[status] ?? status
}

function appointmentStatusLabel(status) {
  return APPOINTMENT_STATUS_LABELS[status] ?? status
}

function habitBehaviorLabel(behavior) {
  return {
    medication_taken: 'Medicamento tomado',
    exercise_done: 'Ejercicio',
    hygiene_done: 'Higiene',
  }[behavior] ?? behavior
}

function statusClass(status) {
  if (status === 'activo' || status === 'programada') return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  if (status === 'controlado' || status === 'asistida') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
}

function visionValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function fetchJson(path, options) {
  const response = await fetch(path, options)
  const json = await response.json()
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

function syncProfileForm() {
  const profile = health.value.profile
  profileForm.value = {
    estatura_cm: profile?.estatura_cm ?? null,
    fecha_nacimiento: profile?.fecha_nacimiento ?? '',
    sexo: profile?.sexo ?? '',
    notas: profile?.notas ?? '',
  }
}

async function loadHealth() {
  loading.value = true
  error.value = ''
  try {
    const [healthData, activityData] = await Promise.all([
      fetchJson('/api/salud'),
      fetchJson('/api/habits/activity?module=salud&limit=8'),
    ])
    health.value = healthData
    habitActivity.value = activityData
    syncProfileForm()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    await fetchJson('/api/salud/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        estatura_cm: profileForm.value.estatura_cm === '' ? null : Number(profileForm.value.estatura_cm),
        fecha_nacimiento: profileForm.value.fecha_nacimiento || null,
        sexo: profileForm.value.sexo || null,
        notas: profileForm.value.notas || null,
      }),
    })
    notice.value = 'Perfil de salud guardado.'
    await loadHealth()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function closeEditors() {
  if (saving.value) return
  measurementEditorOpen.value = false
  conditionEditorOpen.value = false
  medicationEditorOpen.value = false
  appointmentEditorOpen.value = false
  visionEditorOpen.value = false
  editorError.value = ''
}

function openMeasurement(measurement = null) {
  editorError.value = ''
  measurementForm.value = measurement
    ? { ...measurement, notas: measurement.notas ?? '' }
    : { ...emptyMeasurementForm(), estatura_cm: health.value.summary.estatura_cm ?? null }
  measurementEditorOpen.value = true
}

function openCondition(condition = null) {
  editorError.value = ''
  conditionForm.value = condition
    ? { ...condition, fecha_diagnostico: condition.fecha_diagnostico ?? '', notas: condition.notas ?? '' }
    : emptyConditionForm()
  conditionEditorOpen.value = true
}

function openMedication(medication = null) {
  editorError.value = ''
  medicationForm.value = medication
    ? {
        id: medication.id,
        condition_id: medication.condition_id ?? '',
        nombre: medication.nombre,
        dosis: medication.dosis ?? '',
        frecuencia: medication.frecuencia ?? 'Diaria',
        hora: medication.hora ?? '',
        activa: Number(medication.activa) === 1,
        notas: medication.notas ?? '',
      }
    : emptyMedicationForm()
  medicationEditorOpen.value = true
}

function openAppointment(appointment = null) {
  editorError.value = ''
  appointmentForm.value = appointment
    ? {
        id: appointment.id,
        fecha_hora: appointment.fecha_hora,
        especialidad: appointment.especialidad,
        profesional: appointment.profesional ?? '',
        lugar: appointment.lugar ?? '',
        motivo: appointment.motivo ?? '',
        estado: appointment.estado,
        notas: appointment.notas ?? '',
      }
    : emptyAppointmentForm()
  appointmentEditorOpen.value = true
}

function openVision(vision = null) {
  editorError.value = ''
  visionForm.value = vision ? { ...vision, notas: vision.notas ?? '' } : emptyVisionForm()
  visionEditorOpen.value = true
}

async function saveMeasurement() {
  saving.value = true
  editorError.value = ''
  const payload = {
    fecha: measurementForm.value.fecha,
    peso_kg: Number(measurementForm.value.peso_kg),
    estatura_cm: measurementForm.value.estatura_cm === '' || measurementForm.value.estatura_cm === null ? null : Number(measurementForm.value.estatura_cm),
    notas: measurementForm.value.notas || null,
  }
  try {
    await fetchJson(measurementForm.value.id ? `/api/salud/measurements/${measurementForm.value.id}` : '/api/salud/measurements', {
      method: measurementForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteMeasurement() {
  if (!measurementForm.value.id || !window.confirm('¿Eliminar esta medida?')) return
  saving.value = true
  try {
    await fetchJson(`/api/salud/measurements/${measurementForm.value.id}`, { method: 'DELETE' })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function saveCondition() {
  saving.value = true
  editorError.value = ''
  const payload = {
    nombre: conditionForm.value.nombre,
    tipo: conditionForm.value.tipo,
    estado: conditionForm.value.estado,
    fecha_diagnostico: conditionForm.value.fecha_diagnostico || null,
    notas: conditionForm.value.notas || null,
  }
  try {
    await fetchJson(conditionForm.value.id ? `/api/salud/conditions/${conditionForm.value.id}` : '/api/salud/conditions', {
      method: conditionForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteCondition() {
  if (!conditionForm.value.id || !window.confirm('¿Eliminar esta condición?')) return
  saving.value = true
  try {
    await fetchJson(`/api/salud/conditions/${conditionForm.value.id}`, { method: 'DELETE' })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function saveMedication() {
  saving.value = true
  editorError.value = ''
  const payload = {
    condition_id: medicationForm.value.condition_id || null,
    nombre: medicationForm.value.nombre,
    dosis: medicationForm.value.dosis || null,
    frecuencia: medicationForm.value.frecuencia,
    hora: medicationForm.value.hora || null,
    activa: medicationForm.value.activa,
    notas: medicationForm.value.notas || null,
  }
  try {
    await fetchJson(medicationForm.value.id ? `/api/salud/medications/${medicationForm.value.id}` : '/api/salud/medications', {
      method: medicationForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteMedication() {
  if (!medicationForm.value.id || !window.confirm('¿Eliminar este medicamento?')) return
  saving.value = true
  try {
    await fetchJson(`/api/salud/medications/${medicationForm.value.id}`, { method: 'DELETE' })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function saveAppointment() {
  saving.value = true
  editorError.value = ''
  const payload = {
    fecha_hora: appointmentForm.value.fecha_hora,
    especialidad: appointmentForm.value.especialidad,
    profesional: appointmentForm.value.profesional || null,
    lugar: appointmentForm.value.lugar || null,
    motivo: appointmentForm.value.motivo || null,
    estado: appointmentForm.value.estado,
    notas: appointmentForm.value.notas || null,
  }
  try {
    await fetchJson(appointmentForm.value.id ? `/api/salud/appointments/${appointmentForm.value.id}` : '/api/salud/appointments', {
      method: appointmentForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteAppointment() {
  if (!appointmentForm.value.id || !window.confirm('¿Eliminar esta cita?')) return
  saving.value = true
  try {
    await fetchJson(`/api/salud/appointments/${appointmentForm.value.id}`, { method: 'DELETE' })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function saveVision() {
  saving.value = true
  editorError.value = ''
  const payload = { ...visionForm.value }
  for (const key of ['ojo_derecho_esfera', 'ojo_derecho_cilindro', 'ojo_derecho_eje', 'ojo_izquierdo_esfera', 'ojo_izquierdo_cilindro', 'ojo_izquierdo_eje']) {
    payload[key] = payload[key] === '' || payload[key] === null ? null : Number(payload[key])
  }
  payload.notas = payload.notas || null
  try {
    await fetchJson(visionForm.value.id ? `/api/salud/vision/${visionForm.value.id}` : '/api/salud/vision', {
      method: visionForm.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteVision() {
  if (!visionForm.value.id || !window.confirm('¿Eliminar esta fórmula visual?')) return
  saving.value = true
  try {
    await fetchJson(`/api/salud/vision/${visionForm.value.id}`, { method: 'DELETE' })
    closeEditors()
    await loadHealth()
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(loadHealth)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Salud</p>
        <h1 class="mt-1 text-2xl font-bold">Salud</h1>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Citas, medidas, condiciones, medicamentos y visión.</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openAppointment()">
          Nueva cita
        </button>
        <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openMeasurement()">
          Registrar peso
        </button>
      </div>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Peso actual</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ formatKg(health.summary.peso_actual) }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ latestMeasurement ? formatDate(latestMeasurement.fecha) : 'Sin registro' }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Estatura</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ formatCm(health.summary.estatura_cm) }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">base para calcular IMC</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">IMC</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <p class="text-2xl font-bold tabular-nums">{{ formatBmi(health.summary.imc_actual) }}</p>
          <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="bmiToneClass">{{ health.summary.categoria_imc?.label ?? 'Sin IMC' }}</span>
        </div>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">referencia adulta, no diagnóstico</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Citas programadas</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">{{ health.summary.citas_programadas }}</p>
        <p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{{ health.summary.proxima_cita ? formatDateTime(health.summary.proxima_cita.fecha_hora) : 'Sin próximas citas' }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Medicamentos</p>
        <p class="mt-2 text-2xl font-bold tabular-nums" :class="activeMedications.length ? 'text-amber-700 dark:text-amber-400' : ''">{{ health.summary.medicamentos_activos }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">activos</p>
      </div>
    </div>

    <section class="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Registros desde hábitos</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Losartán, ejercicio e higiene vinculados a Nibor Hábitos.</p>
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
            Sin hábitos de salud registrados.
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

    <div class="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
      <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Evolución corporal</h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Peso e IMC por fecha registrada.</p>
          </div>
          <span class="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{{ health.measurements.length }} medidas</span>
        </div>
        <VChart v-if="hasChartData" class="mt-4 w-full" style="height: 320px" :option="healthChartOption" autoresize />
        <div v-else class="mt-4 flex h-80 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Registra tu peso y estatura para ver la gráfica.
        </div>
      </section>

      <section class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Perfil base</h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Datos usados para completar medidas.</p>
          </div>
        </div>
        <form class="mt-4 grid gap-3" @submit.prevent="saveProfile">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Estatura (cm)</span>
            <input v-model.number="profileForm.estatura_cm" type="number" min="80" max="250" step="0.1" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nacimiento</span>
              <input v-model="profileForm.fecha_nacimiento" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Sexo</span>
              <select v-model="profileForm.sexo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option value="">Sin registrar</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="profileForm.notas" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <button type="submit" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" :disabled="saving">
            {{ saving ? 'Guardando...' : 'Guardar perfil' }}
          </button>
        </form>
      </section>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <p class="text-sm font-semibold">Condiciones</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ activeConditions.length }} activas o controladas</p>
          </div>
          <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openCondition()">Nueva</button>
        </div>
        <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando...</div>
        <div v-else-if="!health.conditions.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay condiciones registradas.</div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button v-for="condition in health.conditions" :key="condition.id" type="button" class="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openCondition(condition)">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ condition.nombre }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusClass(condition.estado)">{{ conditionStatusLabel(condition.estado) }}</span>
              <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{{ typeLabel(condition.tipo) }}</span>
            </span>
            <span v-if="condition.notas" class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ condition.notas }}</span>
          </button>
        </div>
      </section>

      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <p class="text-sm font-semibold">Medicamentos</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ activeMedications.length }} activos</p>
          </div>
          <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openMedication()">Nuevo</button>
        </div>
        <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando...</div>
        <div v-else-if="!health.medications.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay medicamentos registrados.</div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button v-for="medication in health.medications" :key="medication.id" type="button" class="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openMedication(medication)">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ medication.nombre }}</span>
              <span v-if="medication.dosis" class="text-xs font-medium text-zinc-500 dark:text-zinc-400">{{ medication.dosis }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="Number(medication.activa) === 1 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'">{{ Number(medication.activa) === 1 ? 'Activo' : 'Inactivo' }}</span>
            </span>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ medication.frecuencia }}<span v-if="medication.hora"> · {{ medication.hora }}</span><span v-if="medication.condicion_nombre"> · {{ medication.condicion_nombre }}</span></span>
          </button>
        </div>
      </section>
    </div>

    <div class="mt-6 grid gap-6 xl:grid-cols-2">
      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <p class="text-sm font-semibold">Citas médicas</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ upcomingAppointments.length }} programadas</p>
          </div>
          <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openAppointment()">Nueva</button>
        </div>
        <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando...</div>
        <div v-else-if="!health.appointments.length" class="p-8 text-center text-sm text-zinc-400">Aún no hay citas registradas.</div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button v-for="appointment in health.appointments" :key="appointment.id" type="button" class="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openAppointment(appointment)">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ appointment.especialidad }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusClass(appointment.estado)">{{ appointmentStatusLabel(appointment.estado) }}</span>
            </span>
            <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ formatDateTime(appointment.fecha_hora) }}<span v-if="appointment.profesional"> · {{ appointment.profesional }}</span><span v-if="appointment.lugar"> · {{ appointment.lugar }}</span></span>
            <span v-if="appointment.motivo" class="truncate text-xs text-zinc-400">{{ appointment.motivo }}</span>
          </button>
        </div>
      </section>

      <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <p class="text-sm font-semibold">Visión</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ health.summary.condiciones_vision }} condiciones visuales activas</p>
          </div>
          <button type="button" class="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500" @click="openVision()">Nueva fórmula</button>
        </div>
        <div v-if="!latestVision" class="p-8 text-center text-sm text-zinc-400">Aún no hay fórmula visual registrada.</div>
        <button v-else type="button" class="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60" @click="openVision(latestVision)">
          <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Última fórmula · {{ formatDate(latestVision.fecha) }}</span>
          <span class="grid gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-2">
            <span>OD: esfera {{ visionValue(latestVision.ojo_derecho_esfera) }} · cil {{ visionValue(latestVision.ojo_derecho_cilindro) }} · eje {{ latestVision.ojo_derecho_eje ?? '—' }}</span>
            <span>OI: esfera {{ visionValue(latestVision.ojo_izquierdo_esfera) }} · cil {{ visionValue(latestVision.ojo_izquierdo_cilindro) }} · eje {{ latestVision.ojo_izquierdo_eje ?? '—' }}</span>
          </span>
          <span v-if="latestVision.notas" class="truncate text-xs text-zinc-400">{{ latestVision.notas }}</span>
        </button>
      </section>
    </div>

    <div v-if="measurementEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditors">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ measurementForm.id ? 'Editar medida' : 'Registrar peso' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveMeasurement">
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha</span>
              <input v-model="measurementForm.fecha" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Peso kg</span>
              <input v-model.number="measurementForm.peso_kg" type="number" min="1" max="350" step="0.1" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-right text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estatura cm</span>
              <input v-model.number="measurementForm.estatura_cm" type="number" min="80" max="250" step="0.1" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-right text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="measurementForm.notas" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="measurementForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteMeasurement">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditors">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="conditionEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditors">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ conditionForm.id ? 'Editar condición' : 'Nueva condición' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveCondition">
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
            <input v-model="conditionForm.nombre" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Tipo</span>
              <select v-model="conditionForm.tipo" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="type in CONDITION_TYPES" :key="type.id" :value="type.id">{{ type.label }}</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estado</span>
              <select v-model="conditionForm.estado" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="status in CONDITION_STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Diagnóstico</span>
              <input v-model="conditionForm.fecha_diagnostico" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="conditionForm.notas" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="conditionForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteCondition">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditors">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="medicationEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditors">
      <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ medicationForm.id ? 'Editar medicamento' : 'Nuevo medicamento' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveMedication">
          <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
              <input v-model="medicationForm.nombre" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Dosis</span>
              <input v-model="medicationForm.dosis" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Frecuencia</span>
              <input v-model="medicationForm.frecuencia" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Hora</span>
              <input v-model="medicationForm.hora" type="time" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="flex items-end gap-2 pb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="medicationForm.activa" type="checkbox" class="h-4 w-4 accent-emerald-600">
              Activo
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Condición asociada</span>
            <select v-model="medicationForm.condition_id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <option value="">Sin asociar</option>
              <option v-for="condition in health.conditions" :key="condition.id" :value="condition.id">{{ condition.nombre }}</option>
            </select>
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="medicationForm.notas" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="medicationForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteMedication">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditors">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="appointmentEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditors">
      <div class="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ appointmentForm.id ? 'Editar cita' : 'Nueva cita' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveAppointment">
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha y hora</span>
              <input v-model="appointmentForm.fecha_hora" type="datetime-local" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Especialidad</span>
              <input v-model="appointmentForm.especialidad" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Estado</span>
              <select v-model="appointmentForm.estado" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <option v-for="status in APPOINTMENT_STATUSES" :key="status.id" :value="status.id">{{ status.label }}</option>
              </select>
            </label>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Profesional</span>
              <input v-model="appointmentForm.profesional" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Lugar</span>
              <input v-model="appointmentForm.lugar" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Motivo</span>
            <input v-model="appointmentForm.motivo" type="text" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="appointmentForm.notas" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="appointmentForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteAppointment">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditors">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div v-if="visionEditorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="closeEditors">
      <div class="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 class="text-base font-semibold">{{ visionForm.id ? 'Editar fórmula visual' : 'Nueva fórmula visual' }}</h2>
        </div>
        <form class="grid gap-4 p-5" @submit.prevent="saveVision">
          <label class="grid gap-1 text-sm sm:max-w-48">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Fecha</span>
            <input v-model="visionForm.fecha" type="date" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p class="text-sm font-semibold">Ojo derecho</p>
              <div class="mt-3 grid gap-3 sm:grid-cols-3">
                <input v-model.number="visionForm.ojo_derecho_esfera" type="number" step="0.25" placeholder="Esfera" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <input v-model.number="visionForm.ojo_derecho_cilindro" type="number" step="0.25" placeholder="Cilindro" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <input v-model.number="visionForm.ojo_derecho_eje" type="number" min="0" max="180" step="1" placeholder="Eje" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </div>
            </div>
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p class="text-sm font-semibold">Ojo izquierdo</p>
              <div class="mt-3 grid gap-3 sm:grid-cols-3">
                <input v-model.number="visionForm.ojo_izquierdo_esfera" type="number" step="0.25" placeholder="Esfera" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <input v-model.number="visionForm.ojo_izquierdo_cilindro" type="number" step="0.25" placeholder="Cilindro" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                <input v-model.number="visionForm.ojo_izquierdo_eje" type="number" min="0" max="180" step="1" placeholder="Eje" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              </div>
            </div>
          </div>
          <label class="grid gap-1 text-sm">
            <span class="font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="visionForm.notas" rows="3" class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </label>
          <div v-if="editorError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>
          <div class="flex justify-between gap-2 pt-2">
            <button v-if="visionForm.id" type="button" class="h-10 rounded-lg border border-rose-200 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950" @click="deleteVision">Eliminar</button>
            <span v-else />
            <div class="flex gap-2">
              <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="closeEditors">Cancelar</button>
              <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
