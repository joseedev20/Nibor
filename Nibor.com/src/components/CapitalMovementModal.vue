<script setup>
import { computed, ref, watch } from 'vue'
import { formatCOP, monthName } from '../utils/format.js'

const props = defineProps({
  open: { type: Boolean, required: true },
})
const emit = defineEmits(['close', 'saved'])

const now = new Date()
const platforms = ref([])
const saving = ref(false)
const error = ref('')
const success = ref(null)
const form = ref(emptyForm())

const monthLabel = computed(() => monthName(now.getMonth() + 1, now.getFullYear()))

function emptyForm() {
  return { platform_id: '', tipo: 'aporte', monto: '', motivo: '' }
}

watch(() => props.open, async (open) => {
  if (!open) return
  error.value = ''
  success.value = null
  form.value = emptyForm()
  try {
    const res = await fetch('/api/platforms?activa=1')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Error cargando plataformas')
    platforms.value = json.data.filter((p) => Number(p.activa) === 1)
  } catch (err) {
    error.value = err.message
  }
})

async function save() {
  if (form.value.platform_id === '' || form.value.monto === '' || Number(form.value.monto) <= 0) {
    error.value = 'Elige la plataforma y un monto mayor a 0'
    return
  }
  if (form.value.tipo === 'retiro' && !form.value.motivo.trim()) {
    error.value = 'Escribe el motivo del retiro — queda guardado en el historial del mes'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const res = await fetch('/api/snapshots/movement', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform_id: Number(form.value.platform_id),
        anio: now.getFullYear(),
        mes: now.getMonth() + 1,
        tipo: form.value.tipo,
        monto: Number(form.value.monto),
        motivo: form.value.motivo.trim(),
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'No se pudo registrar el movimiento')
    success.value = json.data
    emit('saved', json.data)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

function close() {
  if (saving.value) return
  emit('close')
}

const selectedPlatform = computed(() => platforms.value.find((p) => p.id === Number(form.value.platform_id)))
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm" @click.self="close">
    <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
      <div class="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Aporte / retiro de {{ monthLabel }}</h2>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Se acumula en los movimientos del mes en curso; la ganancia se calcula al cerrar el mes.</p>
      </div>

      <!-- Éxito -->
      <div v-if="success" class="grid gap-4 p-5">
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Registrado ✓ — {{ selectedPlatform?.nombre }} lleva en {{ monthLabel.split(' ')[0].toLowerCase() }}:
          aportes <strong>{{ formatCOP(success.aporte) }}</strong> · retiros <strong>{{ formatCOP(success.retiros) }}</strong>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="close">Cerrar</button>
          <button type="button" class="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500" @click="success = null; form = { platform_id: form.platform_id, tipo: 'aporte', monto: '', motivo: '' }">Registrar otro</button>
        </div>
      </div>

      <!-- Formulario -->
      <form v-else class="grid gap-4 p-5" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="h-10 rounded-lg border text-sm font-semibold transition"
            :class="form.tipo === 'aporte' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="form.tipo = 'aporte'"
          >
            ↑ Aporte
          </button>
          <button
            type="button"
            class="h-10 rounded-lg border text-sm font-semibold transition"
            :class="form.tipo === 'retiro' ? 'border-rose-600 bg-rose-600 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="form.tipo = 'retiro'"
          >
            ↓ Retiro
          </button>
        </div>

        <label class="grid gap-1 text-sm">
          <span class="font-medium text-zinc-700 dark:text-zinc-300">Plataforma</span>
          <select v-model="form.platform_id" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
            <option value="" disabled>Elige…</option>
            <option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
        </label>

        <label class="grid gap-1 text-sm">
          <span class="font-medium text-zinc-700 dark:text-zinc-300">Monto</span>
          <input v-model="form.monto" type="number" min="1" step="0.01" placeholder="0" class="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        </label>

        <label class="grid gap-1 text-sm">
          <span class="font-medium" :class="form.tipo === 'retiro' ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-300'">
            {{ form.tipo === 'retiro' ? 'Motivo del retiro (obligatorio)' : 'Nota (opcional)' }}
          </span>
          <textarea
            v-model="form.motivo"
            rows="2"
            maxlength="300"
            :placeholder="form.tipo === 'retiro' ? '¿Por qué retiras este dinero? Queda guardado en el historial' : 'p. ej. prima de mitad de año'"
            class="rounded-lg border bg-white px-3 py-2 text-zinc-900 outline-none dark:bg-zinc-950 dark:text-zinc-100"
            :class="form.tipo === 'retiro' ? 'border-rose-300 focus:border-rose-500 dark:border-rose-900' : 'border-zinc-200 focus:border-emerald-500 dark:border-zinc-700'"
          />
        </label>

        <div v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{{ error }}</div>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" @click="close">Cancelar</button>
          <button type="submit" class="h-10 rounded-lg px-5 text-sm font-semibold text-white transition disabled:opacity-60" :class="form.tipo === 'aporte' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'" :disabled="saving">
            {{ saving ? 'Guardando…' : form.tipo === 'aporte' ? 'Registrar aporte' : 'Registrar retiro' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
