<template>
  <section class="flex min-h-[60vh] items-center justify-center">
    <div class="max-w-lg text-center">
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Error 404</p>
      <h1 class="mt-3 text-3xl font-bold text-zinc-950 dark:text-zinc-50">Esta página no existe</h1>
      <p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        La dirección puede estar incompleta o la sección pudo haberse movido.
      </p>
      <RouterLink
        to="/"
        class="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        Volver al resumen
      </RouterLink>
    </div>
  </section>
</template>
