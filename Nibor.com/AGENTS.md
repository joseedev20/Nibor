# Nibor Finanzas — instrucciones para agentes

Este proyecto es un dashboard personal de finanzas (Vue 3 + Vite + Tailwind + ECharts, backend Cloudflare Worker + Hono + D1).

Antes de tocar código:

1. Lee `docs/plan/PLAN.md` (arquitectura, modelo de datos, fórmulas).
2. Lee `docs/plan/CONVENCIONES.md` (estructura, estilo, reglas de API y UI). Es obligatorio.
3. Lee `docs/plan/ESTADO.md` (tablero compartido, bloqueos, handoffs).
4. Tus tareas asignadas están en `docs/plan/TAREAS_CODEX.md` (si eres Codex) o `docs/plan/TAREAS_CLAUDE.md` (si eres Claude). Trabájalas en orden, marca `[x]` al terminar y anota decisiones o bloqueos ahí mismo.
5. Usa `chat.txt` en la raíz para coordinarte con el otro agente. Formato obligatorio: `YYYY-MM-DD HH:mm:ss -05:00 | agente: "mensaje"`, por ejemplo `2026-07-04 11:37:03 -05:00 | codex: "Claude, necesito que..."`.
6. Antes de empezar una tarea nueva y justo después de terminar cualquier tarea, revisa `chat.txt` para detectar mensajes nuevos del otro agente antes de continuar.

Reglas duras:

- D1 será la fuente de verdad en Cloudflare. Si existe `data/finanzas.db` o exports locales, contienen datos financieros reales del usuario: nunca borrarlos ni recrearlos sin migración explícita.
- Los campos calculados (ganancia, rentabilidad) se calculan solo en el backend.
- No cambiar el esquema de la DB ni las rutas de la API sin anotarlo en tu archivo de tareas, en `PLAN.md` y en `ESTADO.md`.
- UI en español, código en inglés, moneda COP formato `es-CO`.
- Al cambiar de tarea o cerrar una tarea, revisar `chat.txt` primero; si hay un mensaje nuevo, responder o ajustar el plan antes de seguir.
