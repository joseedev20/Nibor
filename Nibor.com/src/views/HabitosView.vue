<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatDate } from '../utils/format.js'
import VChart from '../charts/setup.js'
import { useIsDark } from '../composables/useIsDark.js'
import { chartInk } from '../utils/chartColors.js'
import NotificationModuleSettings from '../components/NotificationModuleSettings.vue'

const DAYS = [
  { id: 1, label: 'L' },
  { id: 2, label: 'M' },
  { id: 3, label: 'X' },
  { id: 4, label: 'J' },
  { id: 5, label: 'V' },
  { id: 6, label: 'S' },
  { id: 0, label: 'D' },
]

const TABS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'mis', label: 'Mis hábitos' },
  { id: 'progreso', label: 'Progreso' },
  { id: 'integraciones', label: 'Integraciones' },
]

const LINK_OPTIONS = [
  { key: 'salud:medication_taken', module: 'salud', behavior: 'medication_taken', label: 'Losartán', target_label: 'Losartán 50 mg' },
  { key: 'salud:exercise_done', module: 'salud', behavior: 'exercise_done', label: 'Ejercicio', target_label: 'Ejercicio' },
  { key: 'salud:hygiene_done', module: 'salud', behavior: 'hygiene_done', label: 'Higiene', target_label: 'Cepillarse' },
  { key: 'knowledge:reading_done', module: 'knowledge', behavior: 'reading_done', label: 'Lectura', target_label: 'Lectura' },
  { key: 'knowledge:language_practice', module: 'knowledge', behavior: 'language_practice', label: 'Inglés', target_label: 'Inglés' },
]

const BEHAVIOR_LABELS = {
  medication_taken: 'Medicamento tomado',
  exercise_done: 'Ejercicio',
  hygiene_done: 'Higiene',
  reading_done: 'Lectura',
  language_practice: 'Práctica de idioma',
}

const todayData = ref(emptyToday())
const habitsData = ref({ habits: [], summary: { total: 0, active: 0, linked: 0 } })
const progressData = ref({ items: [], summary: { total_habits: 0, done_today: 0, planned_today: 0, percent_today: 0, best_current_streak: 0 } })
const healthActivity = ref({ events: [], summary: [] })
const knowledgeActivity = ref({ events: [], summary: [] })
const activeTab = ref('hoy')
const loading = ref(false)
const actionLoading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const editorOpen = ref(false)
const editorError = ref('')
const form = ref(emptyForm())

const activeHabits = computed(() => habitsData.value.summary?.active ?? habitsData.value.habits.length)
const linkedHabits = computed(() => habitsData.value.summary?.linked ?? 0)
const pendingToday = computed(() => todayData.value.summary?.pending_today ?? 0)
const percentToday = computed(() => todayData.value.summary?.percent_today ?? 0)
const progressItems = computed(() => progressData.value.items ?? [])
const healthTotal = computed(() => healthActivity.value.summary.reduce((sum, item) => sum + Number(item.total ?? 0), 0))
const knowledgeTotal = computed(() => knowledgeActivity.value.summary.reduce((sum, item) => sum + Number(item.total ?? 0), 0))

function emptyToday() {
  return {
    date: '',
    habits: [],
    summary: { planned_today: 0, done_today: 0, pending_today: 0, percent_today: 0 },
  }
}

function emptyForm() {
  return {
    id: null,
    name: '',
    description: '',
    emoji: '',
    color: '#10b981',
    target_per_day: 1,
    is_active: true,
    start_date: todayLocal(),
    end_date: '',
    days: [],
    linkKeys: [],
  }
}

function todayLocal() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '—'
  return `${formatDate(value.slice(0, 10))} · ${value.slice(11, 16)}`
}

function fetchJson(path, options) {
  return fetch(path, options).then(async (response) => {
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'Error de red')
    return json.data
  })
}

// silent = refrescar datos sin desmontar la vista (evita el "flash" de recarga
// al completar/posponer); el spinner solo aparece en la carga inicial.
async function loadAll(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const [today, habits, progress, health, knowledge] = await Promise.all([
      fetchJson('/api/habits/today'),
      fetchJson('/api/habits'),
      fetchJson('/api/habits/progress'),
      fetchJson('/api/habits/activity?module=salud&limit=12'),
      fetchJson('/api/habits/activity?module=knowledge&limit=12'),
    ])
    todayData.value = today
    habitsData.value = habits
    progressData.value = progress
    healthActivity.value = health
    knowledgeActivity.value = knowledge
  } catch (err) {
    error.value = err.message
  } finally {
    if (!silent) loading.value = false
  }
}

function tabClass(tab) {
  return activeTab.value === tab
    ? 'bg-emerald-600 text-white'
    : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
}

function dayText(days) {
  if (!days?.length) return 'Todos los días'
  const labels = DAYS.filter((day) => days.includes(day.id)).map((day) => day.label)
  return labels.join(' · ')
}

function behaviorLabel(behavior) {
  return BEHAVIOR_LABELS[behavior] ?? behavior
}

function progressWidth(value) {
  return `${Math.max(0, Math.min(100, Number(value ?? 0)))}%`
}

function heatmapClass(cell) {
  if (!cell.planned) return 'bg-zinc-100 dark:bg-zinc-800'
  if (cell.met) return 'bg-emerald-500'
  if (Number(cell.done ?? 0) > 0) return 'bg-emerald-200 dark:bg-emerald-900'
  return 'bg-zinc-300 dark:bg-zinc-700'
}

function openNew() {
  editorError.value = ''
  form.value = emptyForm()
  editorOpen.value = true
}

function openEdit(habit) {
  editorError.value = ''
  form.value = {
    id: habit.id,
    name: habit.name,
    description: habit.description ?? '',
    emoji: habit.emoji ?? '',
    color: habit.color ?? '#10b981',
    target_per_day: Number(habit.target_per_day ?? 1),
    is_active: Number(habit.is_active) === 1,
    start_date: habit.start_date ?? todayLocal(),
    end_date: habit.end_date ?? '',
    days: [...(habit.days ?? [])],
    linkKeys: (habit.links ?? []).map((link) => `${link.module}:${link.behavior}`),
  }
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = ''
}

function toggleDay(day) {
  const selected = new Set(form.value.days)
  if (selected.has(day)) selected.delete(day)
  else selected.add(day)
  form.value.days = [...selected].sort((a, b) => a - b)
}

function toggleLink(key) {
  const selected = new Set(form.value.linkKeys)
  if (selected.has(key)) selected.delete(key)
  else selected.add(key)
  form.value.linkKeys = [...selected]
}

function buildLinks() {
  return LINK_OPTIONS
    .filter((option) => form.value.linkKeys.includes(option.key))
    .map((option) => ({
      module: option.module,
      behavior: option.behavior,
      target_label: option.target_label,
    }))
}

async function saveHabit() {
  saving.value = true
  editorError.value = ''
  const payload = {
    name: form.value.name,
    description: form.value.description || null,
    emoji: form.value.emoji || null,
    color: form.value.color || '#10b981',
    target_per_day: Number(form.value.target_per_day),
    is_active: form.value.is_active,
    start_date: form.value.start_date || null,
    end_date: form.value.end_date || null,
    days: form.value.days,
    links: buildLinks(),
  }

  try {
    await fetchJson(form.value.id ? `/api/habits/${form.value.id}` : '/api/habits', {
      method: form.value.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    notice.value = form.value.id ? 'Hábito actualizado.' : 'Hábito creado.'
    editorOpen.value = false
    await loadAll(true)
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteHabit() {
  if (!form.value.id || !window.confirm('¿Eliminar este hábito y su historial?')) return
  saving.value = true
  try {
    await fetchJson(`/api/habits/${form.value.id}`, { method: 'DELETE' })
    notice.value = 'Hábito eliminado.'
    editorOpen.value = false
    await loadAll(true)
  } catch (err) {
    editorError.value = err.message
  } finally {
    saving.value = false
  }
}

async function checkHabit(habit) {
  actionLoading.value = true
  notice.value = ''
  // Optimista: la carta sale del mazo de una y la siguiente sube sin esperar la red
  todayData.value = {
    ...todayData.value,
    habits: todayData.value.habits.filter((item) => item.id !== habit.id),
  }
  try {
    const result = await fetchJson(`/api/habits/${habit.id}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    notice.value = result.met ? 'Hábito completado por hoy.' : 'Registro guardado.'
  } catch (err) {
    error.value = err.message
  } finally {
    // Refresco silencioso: corrige contadores (y devuelve la carta si falló)
    await loadAll(true)
    actionLoading.value = false
  }
}

async function deferHabit(habit) {
  actionLoading.value = true
  notice.value = ''
  // Optimista: la carta pasa al final del mazo de inmediato
  const rest = todayData.value.habits.filter((item) => item.id !== habit.id)
  todayData.value = { ...todayData.value, habits: [...rest, habit] }
  try {
    await fetchJson(`/api/habits/${habit.id}/defer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    notice.value = 'Lo moví al final de hoy.'
  } catch (err) {
    error.value = err.message
  } finally {
    await loadAll(true)
    actionLoading.value = false
  }
}

async function moveHabit(index, direction) {
  const list = [...habitsData.value.habits]
  const target = index + direction
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  habitsData.value = {
    ...habitsData.value,
    habits: list,
  }
  try {
    await fetchJson('/api/habits/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: list.map((habit) => habit.id) }),
    })
    await loadAll(true)
  } catch (err) {
    error.value = err.message
  }
}

// Frases motivacionales rotativas, como en HabitDay original
const QUOTES = [
  '“La destrucción es esencial para la construcción. Si queremos construir algo nuevo, debemos estar dispuestos a dejar que arda lo viejo.”',
  '“No cuentes los días, haz que los días cuenten.”',
  '“Somos lo que hacemos repetidamente. La excelencia no es un acto, es un hábito.”',
  '“Un viaje de mil millas comienza con un solo paso.”',
  '“La disciplina es el puente entre las metas y los logros.”',
  '“No tienes que ser grande para empezar, pero tienes que empezar para ser grande.”',
  '“El secreto de tu futuro está escondido en tu rutina diaria.”',
]
const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
const quoteOfDay = QUOTES[dayOfYear % QUOTES.length]

// Mazo: la primera carta es la activa, las siguientes asoman detrás
const topHabitId = computed(() => todayData.value.habits[0]?.id ?? null)

function deckStyle(habit, index) {
  const base = { backgroundColor: habit.color, zIndex: String(20 - index) }
  if (index === 0 && drag.value.id === habit.id) {
    return { ...base, ...cardStyle(habit) }
  }
  return {
    ...base,
    transform: `translateY(${index * 12}px) scale(${1 - index * 0.03})`,
    transformOrigin: 'bottom center',
    transition: 'transform 0.28s ease',
  }
}

// Swipe estilo app original: la tarjeta sigue el dedo con rotación,
// derecha (>100px) = completar, izquierda (<-100px) = posponer al final.
const drag = ref({ id: null, startX: 0, dx: 0, active: false, leaving: false })
const SWIPE_THRESHOLD = 100

function resetDrag() {
  drag.value = { id: null, startX: 0, dx: 0, active: false, leaving: false }
}

function onPointerDown(event, habit) {
  if (actionLoading.value || drag.value.leaving) return
  if (habit.id !== topHabitId.value) return // solo la carta de arriba se desliza
  if (event.button !== undefined && event.button !== 0) return
  if (event.target.closest('button')) return // los botones siguen siendo clic normal
  drag.value = { id: habit.id, startX: event.clientX, dx: 0, active: true, leaving: false }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event, habit) {
  if (!drag.value.active || drag.value.id !== habit.id) return
  drag.value.dx = event.clientX - drag.value.startX
}

function onPointerUp(event, habit) {
  if (!drag.value.active || drag.value.id !== habit.id) return
  const dx = event.clientX - drag.value.startX

  if (dx > SWIPE_THRESHOLD) {
    // vuela a la derecha y completa
    drag.value = { ...drag.value, active: false, leaving: true, dx: 600 }
    setTimeout(async () => { await checkHabit(habit); resetDrag() }, 280)
  } else if (dx < -SWIPE_THRESHOLD) {
    // vuela a la izquierda y pasa al final
    drag.value = { ...drag.value, active: false, leaving: true, dx: -600 }
    setTimeout(async () => { await deferHabit(habit); resetDrag() }, 280)
  } else {
    // no alcanzó el umbral: regresa suave a su lugar
    drag.value = { ...drag.value, active: false, dx: 0 }
    setTimeout(resetDrag, 300)
  }
}

function onPointerCancel(event, habit) {
  if (drag.value.id === habit.id && !drag.value.leaving) resetDrag()
}

function cardStyle(habit) {
  if (drag.value.id !== habit.id) return {}
  return {
    transform: `translateX(${drag.value.dx}px) rotate(${drag.value.dx / 20}deg)`,
    transition: drag.value.active ? 'none' : 'transform 0.28s ease, opacity 0.28s ease',
    opacity: drag.value.leaving ? '0.35' : '1',
  }
}

function cardHintClass(habit) {
  if (drag.value.id !== habit.id || !drag.value.active) return ''
  if (drag.value.dx > SWIPE_THRESHOLD) return 'ring-2 ring-emerald-500'
  if (drag.value.dx < -SWIPE_THRESHOLD) return 'ring-2 ring-amber-500'
  return ''
}

// ── Gráficas de progreso (ECharts) ─────────────────────────────────────────
const isDark = useIsDark()
const chartMode = computed(() => (isDark.value ? 'dark' : 'light'))
const ink = computed(() => chartInk(chartMode.value))
const calendarFilter = ref('all')

// Rampa secuencial de un solo matiz (magnitud de cumplimiento)
const EMERALD_RAMP = {
  light: ['#d1fae5', '#6ee7b7', '#10b981', '#047857'],
  dark: ['#064e3b', '#047857', '#10b981', '#6ee7b7'],
}
const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function shortDate(iso) {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTH_SHORT[Number(m) - 1]}`
}

const chartTooltip = computed(() => ({
  backgroundColor: ink.value.surface,
  borderColor: ink.value.axisLine,
  textStyle: { color: ink.value.text, fontSize: 12 },
}))

const weeklyOption = computed(() => {
  const serie = progressData.value.weekly_series ?? []
  return {
    tooltip: {
      ...chartTooltip.value,
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0]
        const w = serie[p.dataIndex]
        return `Semana del ${shortDate(w.week_start)}<br/>${p.marker} ${w.percent ?? 0} % (${w.done}/${w.planned})`
      },
    },
    grid: { left: 42, right: 12, top: 14, bottom: 26 },
    xAxis: { type: 'category', data: serie.map((w) => shortDate(w.week_start)), axisTick: { show: false }, axisLine: { lineStyle: { color: ink.value.axisLine } }, axisLabel: { color: ink.value.muted, fontSize: 10 } },
    yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: ink.value.grid } }, axisLabel: { color: ink.value.muted, fontSize: 10, formatter: '{value} %' } },
    series: [{
      type: 'bar',
      barMaxWidth: 22,
      data: serie.map((w) => w.percent ?? 0),
      itemStyle: { color: chartMode.value === 'dark' ? '#10b981' : '#059669', borderRadius: [4, 4, 0, 0] },
    }],
  }
})

const byHabitOption = computed(() => {
  const items = [...(progressData.value.items ?? [])]
    .sort((a, b) => (a.monthly?.percent ?? 0) - (b.monthly?.percent ?? 0))
  return {
    tooltip: { ...chartTooltip.value, trigger: 'item', formatter: (p) => `${p.name}: ${p.value} % este mes` },
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: ink.value.grid } }, axisLabel: { color: ink.value.muted, fontSize: 10, formatter: '{value} %' } },
    yAxis: { type: 'category', data: items.map((h) => `${h.emoji ?? ''} ${h.name}`.trim()), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: ink.value.text, fontSize: 12 } },
    series: [{
      type: 'bar',
      barMaxWidth: 16,
      data: items.map((h) => ({ value: h.monthly?.percent ?? 0, itemStyle: { color: h.color, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: ink.value.text, fontSize: 11, formatter: '{c} %' },
    }],
  }
})

const calendarRange = computed(() => {
  const daily = progressData.value.daily ?? []
  return daily.length ? [daily[0].date, daily[daily.length - 1].date] : null
})

const calendarData = computed(() => {
  if (calendarFilter.value === 'all') {
    return (progressData.value.daily ?? [])
      .filter((d) => d.percent !== null)
      .map((d) => [d.date, d.percent])
  }
  const habit = (progressData.value.items ?? []).find((h) => h.id === calendarFilter.value)
  if (!habit) return []
  const target = Number(habit.target_per_day || 1)
  return habit.heatmap
    .filter((cell) => cell.planned)
    .map((cell) => [cell.date, Math.min(100, Math.round((cell.done / target) * 100))])
})

const calendarOption = computed(() => ({
  tooltip: { ...chartTooltip.value, formatter: (p) => `${formatDate(p.value[0])}: ${p.value[1]} %` },
  visualMap: { min: 0, max: 100, show: false, inRange: { color: EMERALD_RAMP[chartMode.value] } },
  calendar: {
    range: calendarRange.value,
    cellSize: ['auto', 15],
    left: 32,
    right: 8,
    top: 30,
    bottom: 6,
    dayLabel: { firstDay: 1, nameMap: ['D', 'L', 'M', 'X', 'J', 'V', 'S'], color: ink.value.muted, fontSize: 10 },
    monthLabel: { nameMap: MONTH_SHORT, color: ink.value.muted, fontSize: 10 },
    yearLabel: { show: false },
    itemStyle: { color: chartMode.value === 'dark' ? '#27272a' : '#f4f4f5', borderColor: ink.value.surface, borderWidth: 2 },
    splitLine: { show: false },
  },
  series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: calendarData.value }],
}))

onMounted(loadAll)
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-400">Nibor Hábitos</p>
        <div class="mt-1 flex items-center gap-2">
          <h1 class="text-2xl font-bold">Hábitos</h1>
          <NotificationModuleSettings module="habitos" />
        </div>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Rutinas diarias, rachas e integración con salud y conocimiento.</p>
      </div>

      <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500" @click="openNew">
        Nuevo hábito
      </button>
    </div>

    <div v-if="error" class="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
      {{ error }}
    </div>
    <div v-if="notice" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      {{ notice }}
    </div>

    <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Hoy</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ progressData.summary.done_today }}<span class="text-base text-zinc-400">/{{ progressData.summary.planned_today }}</span></p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ percentToday }} % completado</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Pendientes</p>
        <p class="mt-2 text-2xl font-bold tabular-nums" :class="pendingToday ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'">{{ pendingToday }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ todayData.date ? formatDate(todayData.date) : 'Hoy' }}</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Hábitos activos</p>
        <p class="mt-2 text-2xl font-bold tabular-nums">{{ activeHabits }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ linkedHabits }} conectados</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Mejor racha</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{{ progressData.summary.best_current_streak }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">días actuales</p>
      </div>
      <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">Registros vinculados</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">{{ healthTotal + knowledgeTotal }}</p>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">salud y conocimiento</p>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap gap-2">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="h-10 rounded-lg px-4 text-sm font-semibold transition"
        :class="tabClass(tab.id)"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'hoy'" class="mt-6">
      <div v-if="loading" class="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Cargando hábitos...
      </div>

      <div v-else-if="todayData.habits.length === 0" class="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        Todos los hábitos de hoy están completos.
      </div>

      <div v-else>
        <!-- Estilo HabitDay original: frase del día + mazo de cartas -->
        <h2 class="text-center text-lg font-bold">Tus hábitos de hoy</h2>
        <p class="mx-auto mt-2 max-w-md text-center text-xs italic text-zinc-500 dark:text-zinc-400">{{ quoteOfDay }}</p>

        <div class="relative mx-auto mt-8 w-full max-w-sm" style="height: 26rem">
          <article
            v-for="(habit, index) in todayData.habits.slice(0, 5)"
            :key="habit.id"
            class="absolute inset-x-0 top-0 flex h-96 touch-pan-y select-none flex-col items-center justify-center rounded-3xl p-6 text-center shadow-xl"
            :class="[cardHintClass(habit), index === 0 ? 'cursor-grab active:cursor-grabbing' : '']"
            :style="deckStyle(habit, index)"
            @pointerdown="onPointerDown($event, habit)"
            @pointermove="onPointerMove($event, habit)"
            @pointerup="onPointerUp($event, habit)"
            @pointercancel="onPointerCancel($event, habit)"
          >
            <span v-if="habit.emoji" class="text-5xl drop-shadow">{{ habit.emoji }}</span>
            <h3 class="mt-4 text-2xl font-bold text-white drop-shadow-md">{{ habit.name }}</h3>
            <p class="mt-2 text-sm text-white/80 drop-shadow">{{ dayText(habit.days) }}</p>
            <span class="absolute bottom-4 right-5 text-sm font-semibold text-white/90 drop-shadow">
              {{ habit.done_today }} / {{ habit.target_per_day }}
            </span>
          </article>
        </div>

        <p class="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Desliza a la derecha para completar · a la izquierda para dejarlo después
        </p>

        <div class="mt-3 flex justify-center gap-3">
          <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" :disabled="actionLoading || !todayData.habits.length" @click="deferHabit(todayData.habits[0])">
            ← Después
          </button>
          <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="actionLoading || !todayData.habits.length" @click="checkHabit(todayData.habits[0])">
            Completar →
          </button>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'mis'" class="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 class="text-sm font-semibold">Mis hábitos</h2>
      </div>
      <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div v-for="(habit, index) in habitsData.habits" :key="habit.id" class="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: habit.color }" />
              <p class="font-semibold">{{ habit.name }}</p>
              <span v-if="Number(habit.is_active) !== 1" class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">Inactivo</span>
            </div>
            <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ dayText(habit.days) }} · meta {{ habit.target_per_day }} por día</p>
            <div v-if="habit.links.length" class="mt-2 flex flex-wrap gap-1">
              <span v-for="link in habit.links" :key="link.id" class="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                {{ behaviorLabel(link.behavior) }}
              </span>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="h-9 w-9 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" :disabled="index === 0" title="Subir" @click="moveHabit(index, -1)">
              ↑
            </button>
            <button type="button" class="h-9 w-9 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" :disabled="index === habitsData.habits.length - 1" title="Bajar" @click="moveHabit(index, 1)">
              ↓
            </button>
            <button type="button" class="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="openEdit(habit)">
              Editar
            </button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'progreso'" class="mt-6 space-y-6">
      <div class="grid gap-6 xl:grid-cols-2">
        <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 class="text-sm font-semibold">Cumplimiento semanal</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Últimas 12 semanas · todos los hábitos</p>
          <VChart class="mt-3 w-full" style="height: 220px" :option="weeklyOption" autoresize />
        </article>

        <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 class="text-sm font-semibold">Cumplimiento por hábito</h2>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Este mes · cada barra en el color del hábito</p>
          <VChart class="mt-3 w-full" style="height: 220px" :option="byHabitOption" autoresize />
        </article>
      </div>

      <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">Calendario de actividad</h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Últimos 6 meses · más verde = más cumplido</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="h-8 rounded-full px-3 text-xs font-medium transition"
              :class="calendarFilter === 'all' ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
              @click="calendarFilter = 'all'"
            >
              Todos
            </button>
            <button
              v-for="habit in progressItems"
              :key="`cal-${habit.id}`"
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition"
              :class="calendarFilter === habit.id ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
              @click="calendarFilter = habit.id"
            >
              <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: habit.color }" />
              {{ habit.name }}
            </button>
          </div>
        </div>
        <VChart class="mt-3 w-full" style="height: 200px" :option="calendarOption" autoresize />
      </article>

      <div class="grid gap-4 lg:grid-cols-2">
      <article v-for="habit in progressItems" :key="habit.id" class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold">{{ habit.name }}</h2>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Racha {{ habit.streak_current }} días · mejor {{ habit.streak_longest }}</p>
          </div>
          <span class="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{{ habit.weekly.percent }} % semana</span>
        </div>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div class="h-full rounded-full bg-emerald-500" :style="{ width: progressWidth(habit.weekly.percent) }" />
        </div>
        <div class="mt-4 flex flex-wrap gap-1">
          <span
            v-for="cell in habit.heatmap.slice(-30)"
            :key="`${habit.id}-${cell.date}`"
            class="h-3.5 w-3.5 rounded-sm"
            :class="heatmapClass(cell)"
            :title="`${formatDate(cell.date)} · ${cell.done}`"
          />
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div class="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Mes</p>
            <p class="font-semibold">{{ habit.monthly.percent }} %</p>
          </div>
          <div class="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Trimestre</p>
            <p class="font-semibold">{{ habit.quarterly.percent }} %</p>
          </div>
          <div class="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Semestre</p>
            <p class="font-semibold">{{ habit.semiannual.percent }} %</p>
          </div>
          <div class="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800">
            <p class="text-xs text-zinc-500 dark:text-zinc-400">Año</p>
            <p class="font-semibold">{{ habit.annual.percent }} %</p>
          </div>
        </div>
      </article>
      </div>
    </section>

    <section v-if="activeTab === 'integraciones'" class="mt-6 grid gap-6 xl:grid-cols-2">
      <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">Salud</h2>
          <span class="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">{{ healthTotal }} registros</span>
        </div>
        <div class="mt-4 space-y-2">
          <div v-for="item in healthActivity.summary" :key="`${item.behavior}-${item.target_label}`" class="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
            <span class="text-sm">{{ item.target_label || behaviorLabel(item.behavior) }}</span>
            <span class="text-sm font-semibold">{{ item.total }}</span>
          </div>
          <p v-if="!healthActivity.summary.length" class="text-sm text-zinc-500 dark:text-zinc-400">Sin registros vinculados.</p>
        </div>
        <div class="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          <div v-for="event in healthActivity.events" :key="event.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <span class="truncate">{{ event.target_label || event.habit_name }}</span>
            <span class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ formatDateTime(event.event_time) }}</span>
          </div>
        </div>
      </article>

      <article class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">Conocimiento</h2>
          <span class="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{{ knowledgeTotal }} registros</span>
        </div>
        <div class="mt-4 space-y-2">
          <div v-for="item in knowledgeActivity.summary" :key="`${item.behavior}-${item.target_label}`" class="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
            <span class="text-sm">{{ item.target_label || behaviorLabel(item.behavior) }}</span>
            <span class="text-sm font-semibold">{{ item.total }}</span>
          </div>
          <p v-if="!knowledgeActivity.summary.length" class="text-sm text-zinc-500 dark:text-zinc-400">Sin registros vinculados.</p>
        </div>
        <div class="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          <div v-for="event in knowledgeActivity.events" :key="event.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <span class="truncate">{{ event.target_label || event.habit_name }}</span>
            <span class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ formatDateTime(event.event_time) }}</span>
          </div>
        </div>
      </article>
    </section>

    <div v-if="editorOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4 py-6">
      <form class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900" @submit.prevent="saveHabit">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold">{{ form.id ? 'Editar hábito' : 'Nuevo hábito' }}</h2>
          <button type="button" class="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeEditor">
            ✕
          </button>
        </div>

        <div v-if="editorError" class="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ editorError }}</div>

        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <label class="sm:col-span-2">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nombre</span>
            <input v-model="form.name" required maxlength="120" class="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>

          <label>
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Meta por día</span>
            <input v-model.number="form.target_per_day" type="number" min="1" max="50" class="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>

          <label>
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Color</span>
            <input v-model="form.color" type="color" class="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>

          <label>
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Inicio</span>
            <input v-model="form.start_date" type="date" class="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>

          <label>
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Cierre</span>
            <input v-model="form.end_date" type="date" class="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>

          <label class="sm:col-span-2">
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Notas</span>
            <textarea v-model="form.description" rows="3" class="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
        </div>

        <div class="mt-5">
          <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Días</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="day in DAYS"
              :key="day.id"
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition"
              :class="form.days.includes(day.id) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="toggleDay(day.id)"
            >
              {{ day.label }}
            </button>
          </div>
        </div>

        <div class="mt-5">
          <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Integraciones</p>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              v-for="option in LINK_OPTIONS"
              :key="option.key"
              type="button"
              class="rounded-lg border px-3 py-2 text-left text-sm transition"
              :class="form.linkKeys.includes(option.key) ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="toggleLink(option.key)"
            >
              <span class="font-semibold">{{ option.label }}</span>
              <span class="block text-xs opacity-75">{{ option.module === 'salud' ? 'Salud' : 'Conocimiento' }}</span>
            </button>
          </div>
        </div>

        <label class="mt-5 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input v-model="form.is_active" type="checkbox" class="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
          Activo
        </label>

        <div class="mt-6 flex flex-wrap justify-between gap-2">
          <button v-if="form.id" type="button" class="h-10 rounded-lg px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950" :disabled="saving" @click="deleteHabit">
            Eliminar
          </button>
          <span v-else />
          <div class="flex gap-2">
            <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" :disabled="saving" @click="closeEditor">
              Cancelar
            </button>
            <button type="submit" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60" :disabled="saving">
              Guardar
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
