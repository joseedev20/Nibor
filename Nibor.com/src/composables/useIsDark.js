import { ref, onMounted, onUnmounted } from 'vue'

// Reactivo a la clase .dark en <html> (estrategia class de Tailwind).
export function useIsDark() {
  const isDark = ref(typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  let observer

  onMounted(() => {
    observer = new MutationObserver(() => {
      isDark.value = document.documentElement.classList.contains('dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  })

  onUnmounted(() => observer?.disconnect())

  return isDark
}
