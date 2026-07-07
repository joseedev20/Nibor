import { defineStore } from 'pinia'

// Store global: periodo seleccionado y catálogos compartidos entre vistas.
export const useFinanzasStore = defineStore('finanzas', {
  state: () => {
    const now = new Date()
    return {
      anio: now.getFullYear(),
      mes: now.getMonth() + 1,
      platforms: [],
      categories: [],
    }
  },
  actions: {
    async loadPlatforms() {
      const res = await fetch('/api/platforms')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error cargando plataformas')
      this.platforms = json.data
    },
    async loadCategories() {
      const res = await fetch('/api/categories')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error cargando categorías')
      this.categories = json.data
    },
  },
})
