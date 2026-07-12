# Convenciones compartidas (Claude + Codex)

Leer este archivo COMPLETO antes de escribir cualquier código.

## Estructura del proyecto

```
Nibor.com/
├── docs/plan/          # planes y tareas (este directorio)
├── server/             # Cloudflare Worker API
│   ├── index.js        # Worker/Hono, monta /api/*
│   ├── db.js           # helpers pequeños para consultas D1 y mapeo de errores
│   └── routes/         # un archivo por recurso: platforms.js, snapshots.js, movements.js, subscriptions.js, goals.js, music.js, knowledge.js, habits.js, events.js, vehicles.js, notifications.js, salud.js, summary.js
├── migrations/         # migraciones D1. 0001_initial.sql crea esquema y seed inicial
├── src/                # frontend Vue 3
│   ├── main.js
│   ├── App.vue         # layout: sidebar + <RouterView>
│   ├── router.js
│   ├── stores/         # Pinia: useFinanzasStore, etc.
│   ├── views/          # DashboardView, InversionesView, MetasView, MusicaView, ConocimientoView, HabitosView, EventosView, VehiculosView, NotificacionesView, SaludView, GastosView, SuscripcionesView, CierreView, ConfigView
│   ├── components/     # componentes reutilizables (StatCard, MonthPicker, PlatformTable, …)
│   └── utils/format.js # formato de moneda y fechas (usar SIEMPRE estas funciones)
├── wrangler.toml       # binding D1: DB -> nibor-finanzas
├── data/               # solo export/import local sensible; nunca borrar datos reales sin migración
└── package.json        # scripts: dev, worker, client, db:migrate:local, db:migrate:remote
```

## Reglas de código

- **Idioma:** UI y textos en español. Código (variables, funciones) en inglés.
- Vue 3 **Composition API con `<script setup>`** siempre. Nada de Options API.
- Tailwind para todos los estilos. Nada de CSS suelto salvo casos imposibles.
- Moneda: usar `formatCOP(valor)` de `src/utils/format.js` → `$ 4.048.014` (sin decimales en UI, decimales solo en inputs). Negativos en rojo con paréntesis como el Excel: `($ 928.551)`.
- Porcentajes: `formatPct(0.0125)` → `1,25 %`.
- Meses: enteros 1–12 en la DB; en UI siempre nombre en español ("Enero 2026").
- Fechas en DB: `YYYY-MM-DD` (texto).
- Validar fechas reales con `isValidDate()` de `server/db.js`; nunca duplicar una validación que solo revise el formato.
- Backend Cloudflare en JavaScript moderno. Mantener las rutas pequeñas y mover helpers reutilizables a `server/db.js` o módulos cercanos.
- No usar Express ni `better-sqlite3` en el runtime objetivo. La base de datos se consulta con el binding D1 `env.DB`.

## Reglas de API

- Base local de API: `http://localhost:8787/api` cuando corre Wrangler. En frontend usar rutas relativas `/api/*` y proxy de Vite en desarrollo.
- REST estándar: `GET/POST /api/snapshots`, `PUT/DELETE /api/snapshots/:id`, etc.
- Módulos no financieros también siguen REST: `/api/music/songs`, `/api/knowledge/items`, `/api/habits`, `/api/events`, `/api/vehicles`, `/api/notifications`, `/api/salud`, etc.
- Respuestas JSON planas: `{ data: ... }` en éxito, `{ error: "mensaje" }` con status 4xx/5xx en fallo.
- **Los campos calculados (ganancia, rentabilidad, saldo_total_inicial) se calculan SOLO en el backend** y se devuelven en las respuestas. El frontend nunca los recalcula.
- En Salud, el IMC y su categoría se calculan SOLO en el backend y se devuelven en `/api/salud`; el frontend solo los presenta.
- En Hábitos, progreso, rachas, heatmap, conteos del día e integraciones se calculan SOLO en el backend y se devuelven en `/api/habits`; el frontend solo los presenta.
- En Vehículos, estado de documentos y días restantes se calculan SOLO en el backend; PDFs se guardan en R2 (`FILES`) y la UI nunca guarda archivos en D1.
- En Notificaciones, las reglas, deduplicación, prioridad/sonido por regla, franjas múltiples de hábitos por días, avisos programados de vehículos, silencio, pausa y envío Pushover se ejecutan SOLO en backend/cron; el frontend solo invoca `/run`, muestra la bandeja y administra settings por módulo. `fecha` en `/api/notifications` y `/api/notifications/run` queda reservado para smoke/diagnostico, no para UI normal.
- Producción debe estar protegida por Cloudflare Access para el dominio completo y `/api/*`; nunca agregar un bypass sin una autenticación alternativa revisada.
- Hábitos es de usuario único (`Nibor`): no reintroducir login, sesiones, tabla `users` ni credenciales desde la app PHP vieja.
- Un `snapshot` con `saldo_final = NULL` es un mes pendiente: la API lo excluye de totales y rentabilidades (no lo trata como 0).
- Todas las consultas D1 deben usar statements preparados (`env.DB.prepare(...).bind(...)`) salvo migraciones.
- Las migraciones viven en `migrations/` y se ejecutan con Wrangler. No cambiar esquema o rutas sin anotarlo en `PLAN.md`, `ESTADO.md` y el archivo de tareas del agente.

## Reglas de UI

- Layout: sidebar fija a la izquierda (íconos + nombre de sección), contenido a la derecha, ancho máx `max-w-7xl`.
- Paleta: fondo neutro (`zinc`), acento `emerald` para positivo, `rose` para negativo, color propio por plataforma (Binance `#F0B90B`, Nubank `#820AD1`, Colfondos `#E4002B`, Happi — definir).
- Soporte dark mode con la estrategia `class` de Tailwind desde el inicio (aunque el toggle llegue en Fase 6).
- Toda tabla o gráfica con datos vacíos muestra un estado vacío amable ("Aún no has registrado este mes"), nunca NaN, `#DIV/0!` ni tablas rotas.

## Flujo de tareas

- Tu lista está en `TAREAS_CODEX.md` o `TAREAS_CLAUDE.md`. Trabaja las tareas EN ORDEN.
- Al terminar una: márcala `[x]` y, si tomaste una decisión no obvia, anótala en una línea debajo.
- Después de completar una fase o detectar un bloqueo, actualiza `ESTADO.md` para que ambos agentes vean el estado global.
- Si estás bloqueado, escribe el bloqueo en la sección "Bloqueos" de tu archivo y pasa a la siguiente tarea no bloqueada.
- No cambies el esquema de la DB ni las rutas de la API sin anotarlo en tu archivo de tareas y en `PLAN.md`.
- `npm run smoke` usa D1/R2 temporales y es la verificación segura por defecto. `npm run smoke:local` puede tocar la D1 local y solo se usa de forma explícita.
