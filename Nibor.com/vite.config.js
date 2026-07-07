import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      // El frontend siempre llama rutas relativas /api/*; en dev las atiende Wrangler
      '/api': 'http://localhost:8787',
    },
  },
})
