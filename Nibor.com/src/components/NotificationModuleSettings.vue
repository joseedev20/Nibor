<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  module: {
    type: String,
    required: true,
  },
})

const MODULES = {
  suscripciones: {
    suffix: 'suscripciones',
    title: 'Notificaciones de suscripciones',
    eyebrow: 'Suscripciones y fijos',
    description: 'Cobros, pagos manuales e ingresos fijos del día.',
    accent: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    letter: 'S',
  },
  habitos: {
    suffix: 'habitos',
    title: 'Notificaciones de hábitos',
    eyebrow: 'Nibor Hábitos',
    description: 'Recordatorios repetidos dentro de una franja, solo para hábitos pendientes.',
    accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    letter: 'H',
  },
  vehiculos: {
    suffix: 'vehiculos',
    title: 'Notificaciones de vehículos',
    eyebrow: 'Nibor Vehículos',
    description: 'SOAT, técnico mecánica y documentos con avisos programados antes de vencer.',
    accent: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    letter: 'V',
  },
  eventos: {
    suffix: 'eventos',
    title: 'Notificaciones de eventos',
    eyebrow: 'Nibor Eventos',
    description: 'Eventos de hoy y próximos según los días de anticipación configurados.',
    accent: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    letter: 'E',
  },
}

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

const dayOptions = [
  { id: 1, label: 'L' },
  { id: 2, label: 'M' },
  { id: 3, label: 'X' },
  { id: 4, label: 'J' },
  { id: 5, label: 'V' },
  { id: 6, label: 'S' },
  { id: 0, label: 'D' },
]

const repeatOptions = [
  { value: '15', label: 'Cada 15 min' },
  { value: '30', label: 'Cada 30 min' },
  { value: '60', label: 'Cada 1 hora' },
  { value: '120', label: 'Cada 2 horas' },
  { value: '180', label: 'Cada 3 horas' },
]

const moduleConfig = computed(() => MODULES[props.module] ?? MODULES.habitos)
const suffix = computed(() => moduleConfig.value.suffix)
const enabledKey = computed(() => `regla_${suffix.value}`)
const pushKey = computed(() => `push_${suffix.value}`)
const priorityKey = computed(() => `prioridad_${suffix.value}`)
const soundKey = computed(() => `sonido_${suffix.value}`)

const open = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const settings = ref(emptySettings())

const pushReady = computed(() => settings.value.push_habilitado && settings.value.pushover_user && settings.value.pushover_token)

function emptySettings() {
  return {
    push_habilitado: false,
    pushover_user: '',
    pushover_token: '',
    regla_suscripciones: true,
    regla_habitos: true,
    regla_vehiculos: true,
    regla_eventos: true,
    push_suscripciones: true,
    push_habitos: true,
    push_vehiculos: true,
    push_eventos: true,
    prioridad_suscripciones: '0',
    prioridad_habitos: '0',
    prioridad_vehiculos: '1',
    prioridad_eventos: '0',
    sonido_suscripciones: '',
    sonido_habitos: '',
    sonido_vehiculos: '',
    sonido_eventos: '',
    vehiculos_umbrales: '180,90,30,15,8,3,0',
    vencida_recordar_cada: '3',
    eventos_dias_antes: '1',
    habitos_hora: '18',
    habitos_inicio: '18',
    habitos_fin: '22',
    habitos_cada_min: '60',
    habitos_franjas: defaultHabitWindows(),
    silencio_inicio: '22',
    silencio_fin: '7',
    pausado_hasta: '',
    resumen_diario: false,
  }
}

function normalizeSettings(data = {}) {
  return {
    ...emptySettings(),
    push_habilitado: data.push_habilitado === '1',
    pushover_user: data.pushover_user ?? '',
    pushover_token: data.pushover_token ?? '',
    regla_suscripciones: data.regla_suscripciones !== '0',
    regla_habitos: data.regla_habitos !== '0',
    regla_vehiculos: data.regla_vehiculos !== '0',
    regla_eventos: data.regla_eventos !== '0',
    push_suscripciones: data.push_suscripciones !== '0',
    push_habitos: data.push_habitos !== '0',
    push_vehiculos: data.push_vehiculos !== '0',
    push_eventos: data.push_eventos !== '0',
    prioridad_suscripciones: normalizePriority(data.prioridad_suscripciones, '0'),
    prioridad_habitos: normalizePriority(data.prioridad_habitos, '0'),
    prioridad_vehiculos: normalizePriority(data.prioridad_vehiculos, '1'),
    prioridad_eventos: normalizePriority(data.prioridad_eventos, '0'),
    sonido_suscripciones: data.sonido_suscripciones ?? '',
    sonido_habitos: data.sonido_habitos ?? '',
    sonido_vehiculos: data.sonido_vehiculos ?? '',
    sonido_eventos: data.sonido_eventos ?? '',
    vehiculos_umbrales: data.vehiculos_umbrales ?? '180,90,30,15,8,3,0',
    vencida_recordar_cada: data.vencida_recordar_cada ?? '3',
    eventos_dias_antes: data.eventos_dias_antes ?? '1',
    habitos_hora: data.habitos_hora ?? data.habitos_inicio ?? '18',
    habitos_inicio: normalizeHour(data.habitos_inicio ?? data.habitos_hora, '18'),
    habitos_fin: normalizeHour(data.habitos_fin, '22'),
    habitos_cada_min: normalizeRepeat(data.habitos_cada_min, '60'),
    habitos_franjas: parseHabitWindows(data),
    silencio_inicio: normalizeHour(data.silencio_inicio, '22'),
    silencio_fin: normalizeHour(data.silencio_fin, '7'),
    pausado_hasta: data.pausado_hasta ?? '',
    resumen_diario: data.resumen_diario === '1',
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
  const habitWindows = sanitizeHabitWindows(settings.value.habitos_franjas)
  const firstHabitWindow = habitWindows[0] ?? createHabitWindow()
  settings.value.habitos_franjas = habitWindows
  return {
    push_habilitado: settings.value.push_habilitado ? '1' : '0',
    pushover_user: settings.value.pushover_user,
    pushover_token: settings.value.pushover_token,
    regla_suscripciones: settings.value.regla_suscripciones ? '1' : '0',
    regla_habitos: settings.value.regla_habitos ? '1' : '0',
    regla_vehiculos: settings.value.regla_vehiculos ? '1' : '0',
    regla_eventos: settings.value.regla_eventos ? '1' : '0',
    push_suscripciones: settings.value.push_suscripciones ? '1' : '0',
    push_habitos: settings.value.push_habitos ? '1' : '0',
    push_vehiculos: settings.value.push_vehiculos ? '1' : '0',
    push_eventos: settings.value.push_eventos ? '1' : '0',
    prioridad_suscripciones: settings.value.prioridad_suscripciones,
    prioridad_habitos: settings.value.prioridad_habitos,
    prioridad_vehiculos: settings.value.prioridad_vehiculos,
    prioridad_eventos: settings.value.prioridad_eventos,
    sonido_suscripciones: settings.value.sonido_suscripciones,
    sonido_habitos: settings.value.sonido_habitos,
    sonido_vehiculos: settings.value.sonido_vehiculos,
    sonido_eventos: settings.value.sonido_eventos,
    vehiculos_umbrales: String(settings.value.vehiculos_umbrales).trim(),
    vencida_recordar_cada: String(settings.value.vencida_recordar_cada).trim(),
    eventos_dias_antes: String(settings.value.eventos_dias_antes).trim(),
    habitos_hora: firstHabitWindow.start.slice(0, 2),
    habitos_inicio: firstHabitWindow.start.slice(0, 2),
    habitos_fin: firstHabitWindow.end.slice(0, 2),
    habitos_cada_min: settings.value.habitos_cada_min,
    habitos_franjas: JSON.stringify(habitWindows),
    silencio_inicio: settings.value.silencio_inicio,
    silencio_fin: settings.value.silencio_fin,
    pausado_hasta: settings.value.pausado_hasta,
    resumen_diario: settings.value.resumen_diario ? '1' : '0',
  }
}

function createHabitWindow(overrides = {}) {
  return {
    id: `franja-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    days: [1, 2, 3, 4, 5, 6, 0],
    start: '18:00',
    end: '22:00',
    ...overrides,
  }
}

function defaultHabitWindows() {
  return [createHabitWindow({ id: 'diario-tarde' })]
}

function hourToTime(value, fallback) {
  const hour = Number(value)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback
  return `${String(hour).padStart(2, '0')}:00`
}

function normalizeTime(value, fallback) {
  const text = String(value ?? '')
  const match = text.match(/^(\d{2}):(\d{2})$/)
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? text : fallback
}

function parseHabitWindows(data = {}) {
  try {
    const parsed = JSON.parse(String(data.habitos_franjas ?? ''))
    if (Array.isArray(parsed)) {
      const windows = sanitizeHabitWindows(parsed)
      if (windows.length) return windows
    }
  } catch {
    // Compatibilidad con la configuración anterior de una sola franja.
  }
  return [createHabitWindow({
    id: 'legacy',
    start: hourToTime(data.habitos_inicio ?? data.habitos_hora, '18:00'),
    end: hourToTime(data.habitos_fin, '22:00'),
  })]
}

function sanitizeHabitWindows(windows = []) {
  const normalized = Array.isArray(windows) ? windows : []
  const result = normalized
    .map((window, index) => {
      const rawDays = Array.isArray(window.days) ? window.days.map(Number) : []
      const days = dayOptions.map((day) => day.id).filter((day) => rawDays.includes(day))
      return {
        id: String(window.id ?? `franja-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `franja-${index + 1}`,
        days,
        start: normalizeTime(window.start, '18:00'),
        end: normalizeTime(window.end, '22:00'),
      }
    })
    .filter((window) => window.days.length)
  return result.length ? result : defaultHabitWindows()
}

function addHabitWindow() {
  settings.value.habitos_franjas = [
    ...settings.value.habitos_franjas,
    createHabitWindow({ days: [1, 2, 3, 4, 5], start: '16:00', end: '23:59' }),
  ]
}

function removeHabitWindow(id) {
  const next = settings.value.habitos_franjas.filter((window) => window.id !== id)
  settings.value.habitos_franjas = next.length ? next : settings.value.habitos_franjas
}

function toggleHabitWindowDay(window, day) {
  const hasDay = window.days.includes(day)
  window.days = hasDay
    ? window.days.filter((item) => item !== day)
    : dayOptions.map((option) => option.id).filter((item) => [...window.days, day].includes(item))
}

function applyHabitPreset() {
  settings.value.habitos_franjas = [
    createHabitWindow({ id: 'lv-manana', days: [1, 2, 3, 4, 5], start: '06:00', end: '07:00' }),
    createHabitWindow({ id: 'lv-tarde', days: [1, 2, 3, 4, 5], start: '16:00', end: '23:59' }),
    createHabitWindow({ id: 'finde-dia', days: [6, 0], start: '00:00', end: '23:59' }),
  ]
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, options)
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function openDialog() {
  open.value = true
  notice.value = ''
  error.value = ''
  loading.value = true
  try {
    settings.value = normalizeSettings(await fetchJson('/api/notifications/settings'))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function closeDialog() {
  open.value = false
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
    window.dispatchEvent(new CustomEvent('nibor:notifications-changed'))
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function applyVehiclePreset() {
  settings.value.vehiculos_umbrales = '180,90,30,15,8,3,0'
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950 dark:hover:text-emerald-300"
    title="Configurar notificaciones"
    aria-label="Configurar notificaciones"
    @click="openDialog"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 17H9m9-6a6 6 0 0 0-12 0c0 4-2 5-2 5h16s-2-1-2-5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  </button>

  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4">
      <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div class="flex items-start justify-between gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div class="flex min-w-0 gap-3">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold" :class="moduleConfig.accent">
              {{ moduleConfig.letter }}
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">{{ moduleConfig.eyebrow }}</p>
              <h2 class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-50">{{ moduleConfig.title }}</h2>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ moduleConfig.description }}</p>
            </div>
          </div>
          <button type="button" class="h-9 w-9 rounded-lg border border-zinc-200 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900" @click="closeDialog">
            ×
          </button>
        </div>

        <div class="grid gap-4 p-5">
          <div v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>
          <div v-if="notice" class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{{ notice }}</div>
          <div v-if="loading" class="rounded-lg border border-zinc-200 p-6 text-center text-sm text-zinc-400 dark:border-zinc-800">Cargando configuración...</div>

          <template v-else>
            <section class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Regla activa</span>
                  <input v-model="settings[enabledKey]" type="checkbox" class="h-4 w-4 accent-emerald-600">
                </label>
                <label class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Push global</span>
                  <input v-model="settings.push_habilitado" type="checkbox" class="h-4 w-4 accent-emerald-600">
                </label>
                <label class="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Push de este módulo</span>
                  <input v-model="settings[pushKey]" type="checkbox" class="h-4 w-4 accent-emerald-600">
                </label>
                <div class="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                  <span class="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Estado Pushover</span>
                  <span class="mt-1 block font-semibold" :class="pushReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'">
                    {{ pushReady ? 'Listo para enviar' : 'Faltan llaves en Pushover' }}
                  </span>
                </div>
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <label class="grid gap-1 text-sm">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Prioridad</span>
                  <select v-model="settings[priorityKey]" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                    <option v-for="option in priorityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <label class="grid gap-1 text-sm">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Sonido</span>
                  <select v-model="settings[soundKey]" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                    <option v-for="option in soundOptions" :key="option.value || 'default'" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
              </div>
            </section>

            <section v-if="props.module === 'habitos'" class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="text-sm font-semibold">Franjas de hábitos</h3>
                  <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Puedes tener varias franjas por días. En cada aviso se recalculan solo los hábitos pendientes.</p>
                </div>
                <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900" @click="applyHabitPreset">
                  Usar ejemplo L-V/S-D
                </button>
              </div>

              <div class="mt-4 grid gap-3">
                <article v-for="(window, index) in settings.habitos_franjas" :key="window.id" class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Franja {{ index + 1 }}</p>
                    <button
                      v-if="settings.habitos_franjas.length > 1"
                      type="button"
                      class="h-8 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      @click="removeHabitWindow(window.id)"
                    >
                      Quitar
                    </button>
                  </div>

                  <div class="mt-3 flex flex-wrap gap-1.5">
                    <button
                      v-for="day in dayOptions"
                      :key="`${window.id}-${day.id}`"
                      type="button"
                      class="h-8 w-8 rounded-lg border text-xs font-bold transition"
                      :class="window.days.includes(day.id)
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400'"
                      @click="toggleHabitWindowDay(window, day.id)"
                    >
                      {{ day.label }}
                    </button>
                  </div>

                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <label class="grid gap-1 text-sm">
                      <span class="font-medium text-zinc-700 dark:text-zinc-300">Inicia</span>
                      <input v-model="window.start" type="time" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                    </label>
                    <label class="grid gap-1 text-sm">
                      <span class="font-medium text-zinc-700 dark:text-zinc-300">Termina</span>
                      <input v-model="window.end" type="time" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                    </label>
                  </div>
                </article>
              </div>

              <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label class="grid gap-1 text-sm">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Repetir</span>
                  <select v-model="settings.habitos_cada_min" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                    <option v-for="option in repeatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900" @click="addHabitWindow">
                  Agregar franja
                </button>
              </div>
            </section>

            <section v-if="props.module === 'vehiculos'" class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="text-sm font-semibold">Avisos programados</h3>
                  <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Días antes del vencimiento, separados por coma.</p>
                </div>
                <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="applyVehiclePreset">
                  Usar 6m/3m/1m/15/8/3/hoy
                </button>
              </div>
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <label class="grid gap-1 text-sm">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Antes de vencer</span>
                  <input v-model="settings.vehiculos_umbrales" type="text" placeholder="180,90,30,15,8,3,0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                </label>
                <label class="grid gap-1 text-sm">
                  <span class="font-medium text-zinc-700 dark:text-zinc-300">Si ya venció, insistir cada</span>
                  <input v-model="settings.vencida_recordar_cada" type="number" min="1" max="30" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
                </label>
              </div>
            </section>

            <section v-if="props.module === 'eventos'" class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 class="text-sm font-semibold">Anticipación</h3>
              <label class="mt-3 grid gap-1 text-sm">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">Días antes</span>
                <input v-model="settings.eventos_dias_antes" type="number" min="0" max="30" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
              </label>
            </section>

            <section v-if="props.module === 'suscripciones'" class="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Las suscripciones avisan el día de cobro. Si el fijo está marcado como pago manual, el mensaje queda diferenciado para que recuerdes registrarlo.
            </section>
          </template>
        </div>

        <div class="flex flex-col-reverse gap-2 border-t border-zinc-200 p-5 sm:flex-row sm:justify-end dark:border-zinc-800">
          <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900" @click="closeDialog">
            Cerrar
          </button>
          <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving || loading" @click="saveSettings">
            {{ saving ? 'Guardando...' : 'Guardar configuración' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
