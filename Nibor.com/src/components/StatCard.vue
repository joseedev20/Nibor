<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  sub: { type: String, default: '' },
  tone: { type: String, default: 'neutral' }, // 'positive' | 'negative' | 'neutral'
})

const toneClasses = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-rose-700 dark:text-rose-400',
  neutral: 'text-zinc-900 dark:text-zinc-100',
}
</script>

<template>
  <div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{{ label }}</p>
    <p class="mt-2 text-2xl font-bold tabular-nums" :class="toneClasses[tone] ?? toneClasses.neutral">{{ value }}</p>
    <p v-if="sub" class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ sub }}</p>
  </div>
</template>
