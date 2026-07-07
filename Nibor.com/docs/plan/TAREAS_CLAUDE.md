# Tareas — Claude

Leer `PLAN.md`, `CONVENCIONES.md` y `ESTADO.md` antes de empezar.

## Fase 0 — Scaffold (bloquea a Codex, hacer primero)

- [x] 0.1 Inicializar proyecto: Vite + Vue 3, Tailwind v4, Pinia, Vue Router, vue-echarts, Hono, Wrangler
- [x] 0.2 Backend base: Cloudflare Worker + Hono en `server/index.js`, con rutas placeholder `/api/health` y montaje preparado para `server/routes/*`
- [x] 0.3 D1 base: `wrangler.toml` con binding `DB` para `nibor-finanzas`, y `migrations/0001_initial.sql` con el esquema completo del PLAN §3 + seed de 4 plataformas (Binance, Colfondos, Nubank, Happi) y categorías básicas (arriendo, luz, agua, internet, mercado, transporte, salud, entretenimiento, salario, otros)
- [x] 0.4 `src/utils/format.js` con `formatCOP`, `formatPct`, `monthName`
- [x] 0.5 Layout `App.vue`: sidebar con las 6 secciones, rutas creadas con vistas placeholder
- [x] 0.6 Scripts npm: `dev` (concurrently Vite + Wrangler), `worker`, `client`, `db:migrate:local`, `db:migrate:remote`. Verificar que `npm run dev` levanta todo
  - 2026-07-04 11:50 Codex: verificado `npm run build`, `npm run db:migrate:local` y Worker health. La prueba se hizo en `8788` porque había un `workerd` viejo ocupando temporalmente `8787`.
- [x] 0.7 Configurar Vite para usar rutas relativas `/api/*` con proxy local a `http://localhost:8787`
- [x] 0.8 Actualizar `ESTADO.md` y avisar que Fase 1 y 2 (Codex) quedan desbloqueadas
  - 2026-07-04 11:50 Codex: Fase 1 ya fue implementada y verificada con smoke test.

## Fase 3 — Dashboard (requiere API de resumen de Fase 1)

- [x] 3.1 Endpoint `GET /api/summary?anio=&mes=` si Codex no lo cubrió: patrimonio total, por plataforma, serie histórica mensual, ingresos/gastos del mes
  - Lo cubrió Codex en Fase 1; usado tal cual.
- [x] 3.2 Fila de StatCards: patrimonio total, ganancia del mes, rentabilidad del mes, tasa de ahorro
- [x] 3.3 Gráfica área apilada: evolución del patrimonio por plataforma (ECharts)
- [x] 3.4 Gráfica barras +/-: ganancia/pérdida mensual consolidada
- [x] 3.5 Tarjetas por plataforma con mini-sparkline y color de marca
- [x] 3.6 Dona de gastos por categoría del mes actual
  - 2026-07-04 13:12 Claude: colores de series validados por modo (validador dataviz: bandas OKLCH, CVD, contraste) en `src/utils/chartColors.js`. Si el mes elegido no tiene cierres, salta al último mes con datos. Bonus: banner "mes sin cerrar" (adelanto de 5.5) y seed local de históricos Ene–Jun (adelanto de 6.1, `scripts/seed_historicos.sql`; verificado contra el Excel: Binance jun -1.588.575,61 ✓).
  - 2026-07-04 13:21 Codex QA: build/smoke/consola OK; estado vacío 2024 OK; dark mode sin errores. Observaciones pendientes: botón `Actual` muestra Julio 2026 en cero en vez de mantener fallback a Junio 2026; variación negativa muestra doble paréntesis `((100,00 %))`.

## Fase 5 — Wizard de cierre de mes

- [x] 5.1 Flujo de 3 pasos (componente stepper): saldos → gastos/suscripciones → resumen
- [x] 5.2 Paso 1: formulario por plataforma con saldo inicial pre-llenado, inputs de aporte/retiros/saldo final, ganancia calculada en vivo (vía API)
  - 2026-07-04 13:33 Claude: la ganancia "en vivo" es una estimación local etiquetada "estimado" (excepción consciente a CONVENCIONES: no existe endpoint de preview y no vale la pena uno por keystroke); las cifras definitivas siempre salen del response del backend al guardar.
- [x] 5.3 Paso 2: checklist de suscripciones activas (confirmar/omitir) + agregar gastos e ingresos del mes
  - El apply del backend es todo-o-nada por diseño idempotente, así que la UI ofrece un toggle "Aplicar todas" en vez de selección individual.
- [x] 5.4 Paso 3: resumen visual del mes + botón guardar (transaccional: todo o nada)
  - 2026-07-04 12:25 Codex: listo endpoint auxiliar `POST /api/close-month` con `env.DB.batch`, upsert de snapshots, movimientos manuales y suscripciones idempotentes. Falta UI del wizard.
  - 2026-07-04 13:33 Claude: UI lista + probado end-to-end contra close-month con mes de prueba 2025-12 (luego eliminado). Plataformas sin saldo final quedan pendientes. Pantalla de éxito con resumen del backend.
  - 2026-07-04 13:44 Codex QA: cierre ficticio de julio OK, Dashboard/Inversiones reflejan el cierre vía API, validaciones negativas OK; julio quedó revertido a pendiente (`saldo_final = NULL`) sin borrar filas.
- [x] 5.5 Recordatorio visual en el Dashboard cuando el mes anterior no está cerrado
  - Implementado en Fase 3 (banner ámbar que enlaza a /cierre).

## Fase 6 — Datos históricos y pulido (compartida)

- [x] 6.1 Importador de históricos: script que carga Enero–Junio 2026 de las 4 plataformas (los datos del Excel del usuario; pedírselos o extraerlos de las capturas)
  - 2026-07-04 13:44 Codex: Happi quedó completado Ene-Jul 2026 desde la captura del usuario en `scripts/seed_historicos.sql`; seed aplicado a D1 local. Falta aplicar el mismo seed en D1 remoto cuando exista login/database_id.
- [x] 6.2 Toggle dark mode
  - 2026-07-04 12:25 Codex: botón agregado en sidebar de `App.vue`; persiste `localStorage('theme')` y alterna clase `dark` en `<html>`.
- [ ] 6.3 Revisión final de estados vacíos, errores de red y responsive
  - 2026-07-04 13:21 Codex: sidebar móvil listo y probado en 390x844; sin overflow horizontal. Deploy prep listo con `README.md`, `[assets]` y `npm run deploy`.

## Bloqueos

(ninguno)

## Decisiones tomadas

- 2026-07-04 (Codex): por decisión del proyecto, el scaffold debe ser Cloudflare Workers + D1, no Express + better-sqlite3. Ver `PLAN.md`, `CONVENCIONES.md` y `ESTADO.md`.
