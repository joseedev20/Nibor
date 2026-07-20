import { onBeforeUnmount, onMounted, ref } from 'vue'

// Gesto "deslizar hacia abajo para recargar" en móvil, como una app nativa.
// Solo se activa con touch (no interfiere con mouse/desktop) y solo cuando
// el scroll de la página está en el tope. Ignora el gesto si empieza dentro
// de un overlay a pantalla completa (modales, visores de PDF, sidebar) para
// no robarle el scroll interno a esas capas.
const PULL_THRESHOLD = 70
const MAX_PULL = 120
const RESISTANCE = 2.2

export function usePullToRefresh(onRefresh) {
  const pulling = ref(false)
  const refreshing = ref(false)
  const distance = ref(0)
  const ready = ref(false)

  let startY = 0
  let tracking = false

  function isInsideOverlay(target) {
    return Boolean(target?.closest?.('.fixed.inset-0'))
  }

  function reset() {
    tracking = false
    pulling.value = false
    ready.value = false
    distance.value = 0
  }

  function onTouchStart(event) {
    if (refreshing.value || event.touches.length !== 1) return
    if (window.scrollY > 0 || isInsideOverlay(event.target)) return
    startY = event.touches[0].clientY
    tracking = true
  }

  function onTouchMove(event) {
    if (!tracking || refreshing.value) return
    if (window.scrollY > 0) {
      reset()
      return
    }
    const delta = event.touches[0].clientY - startY
    if (delta <= 0) {
      pulling.value = false
      distance.value = 0
      ready.value = false
      return
    }
    pulling.value = true
    distance.value = Math.min(MAX_PULL, delta / RESISTANCE)
    ready.value = distance.value >= PULL_THRESHOLD
    event.preventDefault()
  }

  async function onTouchEnd() {
    if (!tracking) return
    const shouldRefresh = ready.value
    tracking = false
    if (shouldRefresh) {
      refreshing.value = true
      pulling.value = true
      distance.value = PULL_THRESHOLD
      await onRefresh()
      // onRefresh normalmente recarga la página (se descarta este estado).
      reset()
      refreshing.value = false
    } else {
      reset()
    }
  }

  onMounted(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchEnd)
  })

  return { pulling, refreshing, distance, ready }
}
