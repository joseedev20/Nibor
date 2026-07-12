<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useIsDark } from './composables/useIsDark.js'

const nav = [
  { to: '/', label: 'Resumen', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/musica', label: 'Música', icon: 'M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-2c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
  { to: '/conocimiento', label: 'Conocimiento', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { to: '/habitos', label: 'Hábitos', icon: 'M9 12l2 2 4-4M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { to: '/eventos', label: 'Eventos', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { to: '/salud', label: 'Salud', icon: 'M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z' },
  { to: '/inversiones', label: 'Inversiones', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { to: '/metas', label: 'Metas', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 17a5 5 0 100-10 5 5 0 000 10zM12 13a1 1 0 100-2 1 1 0 000 2z' },
  { to: '/prestamos', label: 'Préstamos', icon: 'M17 9V7a5 5 0 00-10 0v2M5 9h14l-1 11H6L5 9zm7 3v4m-2-2h4' },
  { to: '/vehiculos', label: 'Vehículos', icon: 'M8 17h8M6 11l1.5-4.5A2 2 0 019.4 5h5.2a2 2 0 011.9 1.5L18 11m-12 0h12a2 2 0 012 2v3a1 1 0 01-1 1h-1a2 2 0 11-4 0H10a2 2 0 11-4 0H5a1 1 0 01-1-1v-3a2 2 0 012-2z' },
  { to: '/gastos', label: 'Gastos e Ingresos', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { to: '/suscripciones', label: 'Suscripciones', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  { to: '/cierre', label: 'Cierre de mes', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/config', label: 'Configuración', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
]

const mounted = ref(false)
const isProduction = import.meta.env.PROD
const isDark = useIsDark()
const sidebarOpen = ref(false)
const isOffline = ref(false)
const notificationUnread = ref(0)
const notificationError = ref('')
let notificationTimer = null

const notificationUnreadLabel = computed(() => notificationUnread.value > 99 ? '99+' : String(notificationUnread.value))

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('theme', theme)
}

function toggleTheme() {
  applyTheme(isDark.value ? 'light' : 'dark')
}

function closeSidebar() {
  sidebarOpen.value = false
}

function updateConnectionStatus() {
  isOffline.value = !navigator.onLine
}

function reloadPage() {
  window.location.reload()
}

async function notificationRequest(path, options = {}) {
  const response = await fetch(path, options)
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'Error de red')
  return json.data
}

async function refreshNotifications({ runChecks = true } = {}) {
  try {
    if (runChecks) await notificationRequest('/api/notifications/run', { method: 'POST' })
    const data = await notificationRequest('/api/notifications?limit=1')
    notificationUnread.value = Number(data.no_leidas ?? 0)
    notificationError.value = ''
  } catch (err) {
    notificationError.value = err.message
  }
}

function handleNotificationsChanged() {
  refreshNotifications({ runChecks: false })
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  applyTheme(savedTheme === 'dark' || (!savedTheme && prefersDark) ? 'dark' : 'light')
  mounted.value = true
  updateConnectionStatus()
  window.addEventListener('online', updateConnectionStatus)
  window.addEventListener('offline', updateConnectionStatus)
  window.addEventListener('nibor:notifications-changed', handleNotificationsChanged)
  refreshNotifications()
  notificationTimer = window.setInterval(() => refreshNotifications(), 5 * 60 * 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateConnectionStatus)
  window.removeEventListener('offline', updateConnectionStatus)
  window.removeEventListener('nibor:notifications-changed', handleNotificationsChanged)
  if (notificationTimer) window.clearInterval(notificationTimer)
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <header class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center gap-2">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 font-bold text-white">N</div>
        <div>
          <p class="text-sm font-semibold leading-tight">Nibor</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Centro personal</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <RouterLink
          to="/notificaciones"
          class="relative flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="Notificaciones"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
          </svg>
          <span v-if="notificationUnread > 0" class="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
            {{ notificationUnreadLabel }}
          </span>
        </RouterLink>

        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="Abrir menú"
          @click="sidebarOpen = true"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </header>

    <div
      v-if="isOffline"
      role="alert"
      class="sticky top-16 z-20 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:top-0 md:ml-60 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <span>Sin conexión. Los datos pueden estar desactualizados y no se guardarán cambios.</span>
      <button type="button" class="shrink-0 font-semibold underline underline-offset-2" @click="reloadPage">Reintentar</button>
    </div>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm md:hidden"
      @click="closeSidebar"
    />

    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-200 md:z-20 md:w-60 md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-900"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center gap-2 px-6 py-5">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 font-bold text-white">N</div>
        <div>
          <p class="text-sm font-semibold leading-tight">Nibor</p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Centro personal</p>
        </div>
        <button
          type="button"
          class="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 md:hidden dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Cerrar menú"
          @click="closeSidebar"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="px-3 pb-2">
        <RouterLink
          to="/notificaciones"
          class="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          exact-active-class="bg-emerald-50 !text-emerald-700 dark:bg-emerald-950 dark:!text-emerald-400"
          :title="notificationError || 'Notificaciones'"
          @click="closeSidebar"
        >
          <span class="flex min-w-0 items-center gap-3">
            <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
            </svg>
            Notificaciones
          </span>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
            :class="notificationUnread > 0 ? 'bg-rose-600 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
          >
            {{ notificationUnread > 0 ? notificationUnreadLabel : 'Al día' }}
          </span>
        </RouterLink>
      </div>

      <nav class="mt-1 flex-1 space-y-1 px-3">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          exact-active-class="bg-emerald-50 !text-emerald-700 dark:bg-emerald-950 dark:!text-emerald-400"
          @click="closeSidebar"
        >
          <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
          </svg>
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button
          type="button"
          class="flex h-10 w-full items-center justify-between rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          :title="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
          @click="toggleTheme"
        >
          <span class="flex items-center gap-3">
            <svg v-if="mounted && isDark" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m8.66-13.66-.7.7M4.04 19.96l-.7.7M21 12h-1M4 12H3m16.96 7.96-.7-.7M4.04 4.04l-.7-.7M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
            <svg v-else class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
            {{ mounted && isDark ? 'Modo claro' : 'Modo oscuro' }}
          </span>
          <span class="h-2 w-2 rounded-full" :class="mounted && isDark ? 'bg-zinc-100' : 'bg-zinc-900'" />
        </button>

        <a
          v-if="isProduction"
          href="/cdn-cgi/access/logout"
          class="mt-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" />
          </svg>
          Cerrar sesión
        </a>

        <p class="px-3 pt-3 text-xs text-zinc-400 dark:text-zinc-600">v0.2 - datos en Cloudflare D1</p>
      </div>
    </aside>

    <main class="md:ml-60">
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <RouterView />
      </div>
    </main>
  </div>
</template>
