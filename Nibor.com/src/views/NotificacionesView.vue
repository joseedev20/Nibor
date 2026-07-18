<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatDate } from '../utils/format.js'

const PAGE_SIZE = 5

function bogotaIsoDate(daysAgo = 0) {
  const date = new Date(Date.now() - (daysAgo * 86400000))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

const todayIso = bogotaIsoDate()
const yesterdayIso = bogotaIsoDate(1)

const notifications = ref([])
const unread = ref(0)
const settings = ref(emptySettings())
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const running = ref(false)
const error = ref('')
const notice = ref('')
const runSummary = ref(null)
const visibleCount = ref(PAGE_SIZE)
const settingsOpen = ref(false)

const typeMeta = {
  suscripcion: { label: 'Suscripción', letter: 'S', class: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  habitos: { label: 'Hábitos', letter: 'H', class: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  vehiculo: { label: 'Vehículo', letter: 'V', class: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  evento: { label: 'Evento', letter: 'E', class: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  recordatorio: { label: 'Recordatorio', letter: 'R', class: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
}

const ruleCards = [
  {
    suffix: 'suscripciones',
    type: 'suscripcion',
    label: 'Suscripciones',
    description: 'Cobros, pagos manuales e ingresos fijos del día.',
    enabledKey: 'regla_suscripciones',
    pushKey: 'push_suscripciones',
    priorityKey: 'prioridad_suscripciones',
    soundKey: 'sonido_suscripciones',
  },
  {
    suffix: 'habitos',
    type: 'habitos',
    label: 'Hábitos',
    description: 'Hábitos pendientes después de la hora definida.',
    enabledKey: 'regla_habitos',
    pushKey: 'push_habitos',
    priorityKey: 'prioridad_habitos',
    soundKey: 'sonido_habitos',
  },
  {
    suffix: 'vehiculos',
    type: 'vehiculo',
    label: 'Vehículos',
    description: 'SOAT, técnico mecánica y documentos por vencer o vencidos.',
    enabledKey: 'regla_vehiculos',
    pushKey: 'push_vehiculos',
    priorityKey: 'prioridad_vehiculos',
    soundKey: 'sonido_vehiculos',
  },
  {
    suffix: 'eventos',
    type: 'evento',
    label: 'Eventos',
    description: 'Eventos de hoy y próximos según días configurados.',
    enabledKey: 'regla_eventos',
    pushKey: 'push_eventos',
    priorityKey: 'prioridad_eventos',
    soundKey: 'sonido_eventos',
  },
  {
    suffix: 'recordatorios',
    type: 'recordatorio',
    label: 'Recordatorios',
    description: 'Tareas por hacer; insisten a diario hasta marcarlas hechas.',
    enabledKey: 'regla_recordatorios',
    pushKey: 'push_recordatorios',
    priorityKey: 'prioridad_recordatorios',
    soundKey: 'sonido_recordatorios',
  },
]

const priorityOptions = [
  { value: '-1', label: 'Silenciosa' },
  { value: '0', label: 'Normal' },
  { value: '1', label: 'Alta' },
]

const soundOptions = [
  { value: '', label: 'Predeterminado' },
  { value: 'pushover', label: 'Pushover' },
  { value: 'bike', label: 'Bike' },
  { value: 'bugle', label: 'Bugle' },
  { value: 'cashregister', label: 'Cash register' },
  { value: 'classical', label: 'Classical' },
  { value: 'cosmic', label: 'Cosmic' },
  { value: 'falling', label: 'Falling' },
  { value: 'gamelan', label: 'Gamelan' },
  { value: 'incoming', label: 'Incoming' },
  { value: 'intermission', label: 'Intermission' },
  { value: 'magic', label: 'Magic' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'pianobar', label: 'Piano bar' },
  { value: 'siren', label: 'Siren' },
  { value: 'spacealarm', label: 'Space alarm' },
  { value: 'tugboat', label: 'Tugboat' },
  { value: 'none', label: 'Sin sonido' },
]

const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}))

const repeatOptions = [
  { value: '15', label: 'Cada 15 min' },
  { value: '30', label: 'Cada 30 min' },
  { value: '60', label: 'Cada 1 hora' },
  { value: '120', label: 'Cada 2 horas' },
  { value: '180', label: 'Cada 3 horas' },
]

const activeRules = computed(() => ruleCards.filter((rule) => settings.value[rule.enabledKey]).length)
const pushEnabledLabel = computed(() => {
  if (!settings.value.push_habilitado) return 'Apagado'
  return settings.value.pushover_user && settings.value.pushover_token ? 'Activo' : 'Sin llaves'
})

const quietWindowLabel = computed(() => {
  if (settings.value.silencio_inicio === settings.value.silencio_fin) return 'Sin silencio'
  return `${hourLabel(settings.value.silencio_inicio)} a ${hourLabel(settings.value.silencio_fin)}`
})

const pausedUntilLabel = computed(() => formatDateTime(settings.value.pausado_hasta))
const deliveryStatus = computed(() => {
  if (runSummary.value?.pausado || isFutureDateTime(settings.value.pausado_hasta)) {
    return pausedUntilLabel.value ? `Pausado hasta ${pausedUntilLabel.value}` : 'Pausado'
  }
  if (runSummary.value?.en_silencio) return 'En silencio ahora'
  return quietWindowLabel.value
})

const runDetail = computed(() => {
  if (!runSummary.value) return ''
  const retained = Number(runSummary.value.push_retenidas ?? 0)
  return `${runSummary.value.nuevas} nuevas - ${runSummary.value.push_enviadas} push enviadas - ${retained} retenidas`
})

const visibleNotifications = computed(() => notifications.value.slice(0, visibleCount.value))
const remainingNotifications = computed(() => Math.max(0, notifications.value.length - visibleCount.value))
const groupedNotifications = computed(() => [
  {
    key: 'today',
    title: 'Hoy',
    items: visibleNotifications.value.filter((notification) => notification.fecha === todayIso),
  },
  {
    key: 'yesterday',
    title: 'Ayer',
    items: visibleNotifications.value.filter((notification) => notification.fecha === yesterdayIso),
  },
].filter((group) => group.items.length))

function showMoreNotifications() {
  visibleCount.value += PAGE_SIZE
}

function emptySettings() {
  return {
    push_habilitado: false,
    pushover_user: '',
    pushover_token: '',
    regla_suscripciones: true,
    regla_habitos: true,
    regla_vehiculos: true,
    regla_eventos: true,
    regla_recordatorios: true,
    recordatorios_repetir_horas: '4',
    vehiculos_umbrales: '180,90,30,15,8,3,0',
    eventos_dias_antes: '1',
    habitos_hora: '18',
    habitos_inicio: '18',
    habitos_fin: '22',
    habitos_cada_min: '60',
    push_suscripciones: true,
    push_habitos: true,
    push_vehiculos: true,
    push_eventos: true,
    push_recordatorios: true,
    prioridad_suscripciones: '0',
    prioridad_habitos: '0',
    prioridad_vehiculos: '1',
    prioridad_eventos: '0',
    prioridad_recordatorios: '0',
    sonido_suscripciones: '',
    sonido_habitos: '',
    sonido_vehiculos: '',
    sonido_eventos: '',
    sonido_recordatorios: '',
    silencio_inicio: '22',
    silencio_fin: '7',
    pausado_hasta: '',
    resumen_diario: false,
    vencida_recordar_cada: '3',
  }
}

function normalizeSettings(data = {}) {
  return {
    push_habilitado: data.push_habilitado === '1',
    pushover_user: data.pushover_user ?? '',
    pushover_token: data.pushover_token ?? '',
    regla_suscripciones: data.regla_suscripciones !== '0',
    regla_habitos: data.regla_habitos !== '0',
    regla_vehiculos: data.regla_vehiculos !== '0',
    regla_eventos: data.regla_eventos !== '0',
    regla_recordatorios: data.regla_recordatorios !== '0',
    recordatorios_repetir_horas: ['1', '2', '3', '4', '6', '8', '12', '24'].includes(String(data.recordatorios_repetir_horas)) ? String(data.recordatorios_repetir_horas) : '4',
    vehiculos_umbrales: data.vehiculos_umbrales ?? '180,90,30,15,8,3,0',
    eventos_dias_antes: data.eventos_dias_antes ?? '1',
    habitos_hora: data.habitos_inicio ?? data.habitos_hora ?? '18',
    habitos_inicio: normalizeHour(data.habitos_inicio ?? data.habitos_hora, '18'),
    habitos_fin: normalizeHour(data.habitos_fin, '22'),
    habitos_cada_min: normalizeRepeat(data.habitos_cada_min, '60'),
    push_suscripciones: data.push_suscripciones !== '0',
    push_habitos: data.push_habitos !== '0',
    push_vehiculos: data.push_vehiculos !== '0',
    push_eventos: data.push_eventos !== '0',
    push_recordatorios: data.push_recordatorios !== '0',
    prioridad_suscripciones: normalizePriority(data.prioridad_suscripciones, '0'),
    prioridad_habitos: normalizePriority(data.prioridad_habitos, '0'),
    prioridad_vehiculos: normalizePriority(data.prioridad_vehiculos, '1'),
    prioridad_eventos: normalizePriority(data.prioridad_eventos, '0'),
    prioridad_recordatorios: normalizePriority(data.prioridad_recordatorios, '0'),
    sonido_suscripciones: data.sonido_suscripciones ?? '',
    sonido_habitos: data.sonido_habitos ?? '',
    sonido_vehiculos: data.sonido_vehiculos ?? '',
    sonido_eventos: data.sonido_eventos ?? '',
    sonido_recordatorios: data.sonido_recordatorios ?? '',
    silencio_inicio: normalizeHour(data.silencio_inicio, '22'),
    silencio_fin: normalizeHour(data.silencio_fin, '7'),
    pausado_hasta: toDatetimeInput(data.pausado_hasta),
    resumen_diario: data.resumen_diario === '1',
    vencida_recordar_cada: data.vencida_recordar_cada ?? '3',
  }
}

function normalizePriority(value, fallback) {
  const text = String(value ?? fallback)
  return ['-1', '0', '1'].includes(text) ? text : fallback
}

function normalizeHour(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number <= 23 ? String(number) : fallback
}

function normalizeRepeat(value, fallback) {
  const text = String(value ?? fallback)
  return repeatOptions.some((option) => option.value === text) ? text : fallback
}

function settingsPayload() {
  return {
    push_habilitado: settings.value.push_habilitado ? '1' : '0',
    pushover_user: settings.value.pushover_user.trim(),
    pushover_token: settings.value.pushover_token.trim(),
    regla_suscripciones: settings.value.regla_suscripciones ? '1' : '0',
    regla_habitos: settings.value.regla_habitos ? '1' : '0',
    regla_vehiculos: settings.value.regla_vehiculos ? '1' : '0',
    regla_eventos: settings.value.regla_eventos ? '1' : '0',
    regla_recordatorios: settings.value.regla_recordatorios ? '1' : '0',
    recordatorios_repetir_horas: String(settings.value.recordatorios_repetir_horas),
    vehiculos_umbrales: settings.value.vehiculos_umbrales.trim(),
    eventos_dias_antes: String(settings.value.eventos_dias_antes).trim(),
    habitos_hora: String(settings.value.habitos_inicio).trim(),
    habitos_inicio: String(settings.value.habitos_inicio).trim(),
    habitos_fin: String(settings.value.habitos_fin).trim(),
    habitos_cada_min: String(settings.value.habitos_cada_min).trim(),
    push_suscripciones: settings.value.push_suscripciones ? '1' : '0',
    push_habitos: settings.value.push_habitos ? '1' : '0',
    push_vehiculos: settings.value.push_vehiculos ? '1' : '0',
    push_eventos: settings.value.push_eventos ? '1' : '0',
    push_recordatorios: settings.value.push_recordatorios ? '1' : '0',
    prioridad_suscripciones: settings.value.prioridad_suscripciones,
    prioridad_habitos: settings.value.prioridad_habitos,
    prioridad_vehiculos: settings.value.prioridad_vehiculos,
    prioridad_eventos: settings.value.prioridad_eventos,
    prioridad_recordatorios: settings.value.prioridad_recordatorios,
    sonido_suscripciones: settings.value.sonido_suscripciones,
    sonido_habitos: settings.value.sonido_habitos,
    sonido_vehiculos: settings.value.sonido_vehiculos,
    sonido_eventos: settings.value.sonido_eventos,
    sonido_recordatorios: settings.value.sonido_recordatorios,
    silencio_inicio: settings.value.silencio_inicio,
    silencio_fin: settings.value.silencio_fin,
    pausado_hasta: String(settings.value.pausado_hasta).trim(),
    resumen_diario: settings.value.resumen_diario ? '1' : '0',
    vencida_recordar_cada: String(settings.value.vencida_recordar_cada).trim(),
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, options)
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

function emitChanged() {
  window.dispatchEvent(new CustomEvent('nibor:notifications-changed'))
}

async function loadNotifications() {
  const data = await fetchJson(`/api/notifications?desde=${yesterdayIso}&limit=200`)
  notifications.value = data.notificaciones ?? []
  visibleCount.value = PAGE_SIZE
  unread.value = Number(data.no_leidas ?? 0)
  emitChanged()
}

async function loadSettings() {
  settings.value = normalizeSettings(await fetchJson('/api/notifications/settings'))
}

async function loadAll({ run = false } = {}) {
  loading.value = true
  error.value = ''
  try {
    if (run) runSummary.value = await fetchJson('/api/notifications/run', { method: 'POST' })
    await Promise.all([loadNotifications(), loadSettings()])
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function runChecks() {
  running.value = true
  error.value = ''
  notice.value = ''
  try {
    runSummary.value = await fetchJson('/api/notifications/run', { method: 'POST' })
    notice.value = `Revisión ejecutada: ${runSummary.value.nuevas} nuevas, ${runSummary.value.push_enviadas} push enviadas, ${runSummary.value.push_retenidas ?? 0} retenidas.`
    await loadNotifications()
  } catch (err) {
    error.value = err.message
  } finally {
    running.value = false
  }
}

async function markRead(notification) {
  if (Number(notification.leida) === 1) return
  error.value = ''
  try {
    await fetchJson(`/api/notifications/${notification.id}/read`, { method: 'POST' })
    notification.leida = 1
    unread.value = Math.max(0, unread.value - 1)
    emitChanged()
  } catch (err) {
    error.value = err.message
  }
}

async function markAllRead() {
  error.value = ''
  try {
    await fetchJson('/api/notifications/read-all', { method: 'POST' })
    for (const notification of notifications.value) notification.leida = 1
    unread.value = 0
    notice.value = 'Todas las notificaciones quedaron leídas.'
    emitChanged()
  } catch (err) {
    error.value = err.message
  }
}

async function saveSettings() {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    settings.value = normalizeSettings(await fetchJson('/api/notifications/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settingsPayload()),
    }))
    notice.value = 'Configuración guardada.'
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function saveAndCloseSettings() {
  await saveSettings()
  if (!error.value) settingsOpen.value = false
}

async function testPush() {
  testing.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveSettings()
    await fetchJson('/api/notifications/test-push', { method: 'POST' })
    notice.value = 'Prueba enviada a Pushover.'
  } catch (err) {
    error.value = err.message
  } finally {
    testing.value = false
  }
}

function pauseForHours(hours) {
  const date = new Date(Date.now() + hours * 3600000)
  settings.value.pausado_hasta = toDatetimeLocal(date)
}

function pauseUntilTomorrow() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(7, 0, 0, 0)
  settings.value.pausado_hasta = toDatetimeLocal(date)
}

function clearPause() {
  settings.value.pausado_hasta = ''
}

function hourLabel(value) {
  return `${String(Number(value)).padStart(2, '0')}:00`
}

function toDatetimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toDatetimeInput(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : toDatetimeLocal(date)
}

function isFutureDateTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  const date = new Date(raw)
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now()
}

function formatDateTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function metaFor(type) {
  return typeMeta[type] ?? { label: type, letter: '?', class: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' }
}

onMounted(() => loadAll({ run: true }))
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Centro de notificaciones</p>
        <div class="mt-1 flex items-center gap-2">
          <h1 class="text-2xl font-bold">Notificaciones</h1>
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-emerald-800 dark:hover:text-emerald-400"
            title="Configurar notificaciones"
            aria-label="Configurar notificaciones"
            @click="settingsOpen = true"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.6 3.3l.5 1.8a7.5 7.5 0 013.8 0l.5-1.8 2.2 1.3-1.3 1.4a7.6 7.6 0 011.9 3.3l1.9-.4v2.6l-1.9-.4a7.6 7.6 0 01-1.9 3.3l1.3 1.4-2.2 1.3-.5-1.8a7.5 7.5 0 01-3.8 0l-.5 1.8-2.2-1.3 1.3-1.4a7.6 7.6 0 01-1.9-3.3l-1.9.4V8.9l1.9.4A7.6 7.6 0 018.7 6L7.4 4.6l2.2-1.3z" />
              <circle cx="12" cy="10.2" r="2.6" />
            </svg>
          </button>
        </div>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Avisos de suscripciones, hábitos, vehículos y eventos, con entrega push configurable por regla.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="running" @click="runChecks">
        {{ running ? 'Revisando...' : 'Revisar ahora' }}
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">No leídas</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ unread }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Push Pushover</p>
        <p class="mt-2 text-2xl font-bold">{{ pushEnabledLabel }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Reglas activas</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ activeRules }}/4</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Entrega</p>
        <p class="mt-2 text-lg font-bold leading-tight">{{ deliveryStatus }}</p>
      </div>
    </div>

    <section class="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-semibold">Bandeja</h2>
          <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Mostrando avisos de hoy y ayer.</p>
          <p v-if="runSummary" class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Última revisión: {{ formatDate(runSummary.fecha) }} - {{ runDetail }}.</p>
        </div>
        <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" :disabled="unread === 0" @click="markAllRead">
          Marcar todas leídas
        </button>
      </div>

      <div v-if="loading" class="p-8 text-center text-sm text-zinc-400">Cargando...</div>
      <div v-else-if="!notifications.length" class="p-10 text-center text-sm text-zinc-400">Todavía no hay notificaciones.</div>
      <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <section v-for="group in groupedNotifications" :key="group.key">
          <div class="bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-500">{{ group.title }}</div>
          <article
            v-for="notification in group.items"
            :key="notification.id"
            class="flex gap-3 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            :class="Number(notification.leida) === 0 ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent opacity-75'"
          >
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold" :class="metaFor(notification.tipo).class">
              {{ metaFor(notification.tipo).letter }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ notification.titulo }}</p>
                <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{{ metaFor(notification.tipo).label }}</span>
              </div>
              <p v-if="notification.mensaje" class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ notification.mensaje }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span>{{ formatDate(notification.fecha) }}</span>
                <span>{{ Number(notification.push_enviada) === 1 ? 'Push listo' : 'Push pendiente' }}</span>
              </div>
            </div>
            <button
              v-if="Number(notification.leida) === 0"
              type="button"
              class="h-9 shrink-0 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              @click="markRead(notification)"
            >
              Leída
            </button>
          </article>
        </section>
        <div v-if="remainingNotifications > 0" class="flex justify-center border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <button
            type="button"
            class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            @click="showMoreNotifications"
          >
            Mostrar más ({{ remainingNotifications }})
          </button>
        </div>
      </div>
    </section>

    <div v-if="settingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 py-6 backdrop-blur-sm" @click.self="settingsOpen = false">
      <section role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" class="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Configuración</p>
            <h2 id="notification-settings-title" class="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">Notificaciones y Pushover</h2>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Las notificaciones in-app siguen activas; configura reglas, entrega y push desde aquí.</p>
          </div>
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Cerrar configuración de notificaciones" @click="settingsOpen = false">✕</button>
        </div>

        <div class="overflow-y-auto p-4 sm:p-5">
          <div class="grid gap-4 xl:grid-cols-2">
        <article v-for="rule in ruleCards" :key="rule.suffix" class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold" :class="metaFor(rule.type).class">
                {{ metaFor(rule.type).letter }}
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ rule.label }}</h3>
                <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ rule.description }}</p>
              </div>
            </div>
            <label class="flex shrink-0 items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              <input v-model="settings[rule.enabledKey]" type="checkbox" class="h-4 w-4 accent-emerald-600">
              Regla
            </label>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <label class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Push</span>
              <input v-model="settings[rule.pushKey]" type="checkbox" class="h-4 w-4 accent-emerald-600">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Prioridad</span>
              <select v-model="settings[rule.priorityKey]" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                <option v-for="option in priorityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm">
              <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sonido</span>
              <select v-model="settings[rule.soundKey]" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                <option v-for="option in soundOptions" :key="option.value || 'default'" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
        </article>
          </div>

          <div class="mt-4 grid gap-4 xl:grid-cols-3">
        <article class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 class="text-sm font-semibold">Ajustes de reglas</h3>
          <div class="mt-3 grid gap-3">
            <div class="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              Las franjas avanzadas de hábitos se ajustan desde la campana del módulo Hábitos.
            </div>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Eventos antes</span>
              <input v-model="settings.eventos_dias_antes" type="number" min="0" max="30" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Vehículos</span>
              <input v-model="settings.vehiculos_umbrales" type="text" placeholder="180,90,30,15,8,3,0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Recordatorios pendientes repiten</span>
              <select v-model="settings.recordatorios_repetir_horas" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                <option value="1">Cada hora</option>
                <option value="2">Cada 2 horas</option>
                <option value="3">Cada 3 horas</option>
                <option value="4">Cada 4 horas</option>
                <option value="6">Cada 6 horas</option>
                <option value="8">Cada 8 horas</option>
                <option value="12">Cada 12 horas</option>
                <option value="24">Una vez al día</option>
              </select>
            </label>
          </div>
        </article>

        <article class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 class="text-sm font-semibold">Entrega</h3>
          <div class="mt-3 grid gap-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Silencio inicia</span>
                <select v-model="settings.silencio_inicio" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                  <option v-for="option in hourOptions" :key="`start-${option.value}`" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label class="grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Silencio termina</span>
                <select v-model="settings.silencio_fin" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                  <option v-for="option in hourOptions" :key="`end-${option.value}`" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
            </div>

            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Pausado hasta</span>
              <input v-model="settings.pausado_hasta" type="datetime-local" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
            </label>

            <div class="grid gap-2 sm:grid-cols-3">
              <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="pauseForHours(1)">Pausar 1h</button>
              <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="pauseUntilTomorrow">Hasta mañana</button>
              <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="clearPause">Quitar pausa</button>
            </div>

            <label class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Resumen diario</span>
              <input v-model="settings.resumen_diario" type="checkbox" class="h-4 w-4 accent-emerald-600">
            </label>

            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">Recordar vencidas cada</span>
              <input v-model="settings.vencida_recordar_cada" type="number" min="1" max="30" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
          </div>
        </article>

        <article class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold">Pushover</h3>
            <label class="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <input v-model="settings.push_habilitado" type="checkbox" class="h-4 w-4 accent-emerald-600">
              Activar push
            </label>
          </div>

          <div class="mt-3 grid gap-3">
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">User Key</span>
              <input v-model="settings.pushover_user" type="text" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <label class="grid gap-1 text-sm">
              <span class="font-medium text-zinc-700 dark:text-zinc-300">API Token</span>
              <input v-model="settings.pushover_token" type="password" autocomplete="off" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
            </label>
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" :disabled="testing" @click="testPush">
              {{ testing ? 'Enviando...' : 'Enviar prueba' }}
            </button>
          </div>
        </article>
          </div>
        </div>

        <div class="flex flex-col-reverse gap-2 border-t border-zinc-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-5 dark:border-zinc-800">
          <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="settingsOpen = false">Cancelar</button>
          <button type="button" class="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white" :disabled="saving" @click="saveAndCloseSettings">
            {{ saving ? 'Guardando...' : 'Guardar configuración' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
