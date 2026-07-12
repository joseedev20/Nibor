# Tareas — Codex

Leer `PLAN.md`, `CONVENCIONES.md` y `ESTADO.md` (en esta misma carpeta) ANTES de empezar.
No arrancar hasta que la Fase 0 esté marcada como completa en `TAREAS_CLAUDE.md`.
Trabajar las tareas en orden. Al terminar cada una: marcarla `[x]` y anotar decisiones no obvias debajo.

## Fase 1 — API REST sobre D1 (server/routes/)

- [x] 1.1 `platforms.js`: GET lista, POST crear, PUT editar (nombre, color, orden, activa) usando `env.DB`
- [x] 1.2 `snapshots.js`:
  - GET `?anio=2026` → snapshots del año agrupados por plataforma, con campos calculados (ganancia, rentabilidad, saldo_total_inicial) según fórmulas del PLAN §3
  - POST / PUT: al crear un snapshot, pre-llenar `saldo_inicial` con el `saldo_final` del mes anterior de esa plataforma si existe
  - Validaciones: no duplicar (platform_id, anio, mes); montos ≥ 0 salvo saldo_final que puede ser NULL (mes pendiente)
- [x] 1.3 `movements.js`: CRUD de gastos/ingresos con filtros `?anio=&mes=&tipo=&categoria_id=`
- [x] 1.4 `subscriptions.js`: CRUD + endpoint `POST /api/subscriptions/apply?anio=&mes=` que genera los movimientos del mes desde las suscripciones activas (idempotente: no duplica si ya se aplicó)
- [x] 1.5 `summary.js`: GET `/api/summary?anio=&mes=` → patrimonio total, desglose por plataforma, serie histórica mensual (para gráficas), total ingresos/gastos del mes, tasa de ahorro
- [x] 1.6 Probar todos los endpoints con datos de ejemplo (puede ser un script `server/smoke.js`) y anotar aquí cómo correrlo
  - 2026-07-04 11:50 Codex: `npm run smoke` prueba health, platforms, categories, snapshots, movements, subscriptions/apply y summary. Si `8787` está ocupado, correr con `$env:SMOKE_BASE_URL='http://127.0.0.1:8788/api'; npm run smoke` mientras Wrangler esté en ese puerto.

Notas técnicas para Fase 1:
- Usar statements preparados D1 (`env.DB.prepare(...).bind(...)`).
- Mantener respuestas `{ data: ... }` / `{ error: "mensaje" }`.
- Los cálculos financieros viven en backend/Worker, nunca en Vue.
- Si hace falta ajustar índices o constraints de D1, anotarlo en `PLAN.md`, `ESTADO.md` y esta sección.

## Fase 2 — Módulo Inversiones (src/views/InversionesView.vue)

- [x] 2.1 Selector de año + tabs por plataforma (con su color de marca)
- [x] 2.2 Tabla mensual estilo Excel: Mes | Saldo inicial | Aporte | Retiros | Saldo final | Ganancia | Rentabilidad % — ganancia/rentabilidad vienen de la API, en verde/rojo, negativos con paréntesis
- [x] 2.3 Edición inline o modal por fila; meses futuros/pendientes en gris con estado "pendiente" (nunca 0 ni #DIV/0!)
- [x] 2.4 Fila TOTAL del año: aportes totales, retiros totales, ganancia acumulada, rentabilidad acumulada
- [x] 2.5 Vista consolidada "Todas": tabla con el total de las 4 plataformas por mes
  - 2026-07-04 11:54 Codex: `/api/snapshots` devuelve `total` por plataforma y `consolidated`, para que Vue no recalcule ganancia/rentabilidad. `InversionesView.vue` solo presenta esos valores y guarda cambios vía POST/PUT.

## Fase 4 — Gastos, Ingresos y Suscripciones

- [x] 4.1 `GastosView.vue`: selector de mes, lista de movimientos del mes con categoría e ícono, totales de ingresos/gastos/balance arriba
- [x] 4.2 Formulario agregar/editar movimiento (modal): tipo, categoría, descripción, monto, fecha
- [x] 4.3 Desglose por categoría del mes (barras horizontales con % del total)
- [x] 4.4 `SuscripcionesView.vue`: lista con nombre, monto, día de cobro, categoría, toggle activa; total mensual comprometido arriba
- [x] 4.5 Botón "Aplicar suscripciones a este mes" (usa el endpoint 1.4)
- [x] 4.6 CRUD de categorías dentro de `ConfigView.vue`
  - 2026-07-04 12:00 Codex: vistas conectadas a API D1. `GastosView` usa `/api/movements` y `/api/summary`; `SuscripcionesView` usa `/api/subscriptions/apply`; `ConfigView` administra `/api/categories`.

## Apoyos a Claude

- [x] 2026-07-04 12:25 Fase 6.2: toggle dark mode en `App.vue`, persistiendo `localStorage('theme')` y clase `dark` en `<html>`.
- [x] 2026-07-04 12:25 Fase 5 soporte backend: `POST /api/close-month` transaccional con `env.DB.batch`, upsert de snapshots, movimientos manuales y suscripciones idempotentes. Smoke actualizado para cubrirlo.
- [x] 2026-07-04 13:21 Deploy Cloudflare: `[assets]` en `wrangler.toml`, `npm run deploy`, scripts `db:seed:*`, `README.md` con pasos de primer despliegue. `npx wrangler deploy --dry-run` OK.
- [x] 2026-07-04 13:21 Responsive móvil: sidebar colapsable en `App.vue`, probado en viewport 390x844 sin overflow horizontal.
- [x] 2026-07-04 13:21 QA Dashboard: build/smoke/consola/estado vacío/dark/responsive revisados. Pendientes reportados a Claude en `chat.txt`: doble paréntesis en porcentaje negativo y fallback de botón `Actual`.
- [x] 2026-07-04 13:44 Seed Happi: completado Ene-Jul 2026 desde captura del usuario en `scripts/seed_historicos.sql`, aplicado a D1 local; julio queda pendiente con `saldo_final = NULL`.
- [x] 2026-07-04 13:44 QA Wizard Fase 5: cierre ficticio de julio OK, validaciones negativas OK, Dashboard/Inversiones reflejan cierre vía API; luego se revirtió julio a pendiente sin borrar filas.
- [x] 2026-07-04 16:44 Vista Todas por tipo: `/api/snapshots` agrega `consolidated_by_tipo` calculado en backend; `InversionesView` alterna Total, Inversiones y Fondos de ahorro sin recalcular cifras en Vue.
- [x] 2026-07-04 16:54 Ingresos fijos guiados: `SuscripcionesView` muestra presets Salario/Arriendo cuando no hay recurrentes de ingreso; `DashboardView` enlaza a esa configuración si falta tasa de ahorro; smoke verifica ingreso recurrente aplicado y tasa de ahorro.
- [x] 2026-07-04 18:27 Módulo Metas: migración `0004_goals.sql`, API `/api/goals`, vista `/metas`, navegación lateral y smoke de creación/progreso/limpieza. El progreso se calcula en backend usando posiciones actuales y fuentes asignadas por plataforma.
- [x] 2026-07-04 19:27 Ajuste Metas por decisión del usuario: las fuentes se asignan por valor COP (`monto_asignado`) y el porcentaje queda derivado como referencia. Migración `0005_goal_allocations_amount.sql`, UI y smoke actualizados.
- [x] 2026-07-04 19:41 Ajuste Dashboard: la tarjeta `Inversiones (hoy)` muestra saldo actual con tono neutral; el rojo queda reservado para pérdidas reales como `Ganancia del mes` o plataformas con ganancia negativa.
- [x] 2026-07-04 20:04 Ajuste Dashboard: `Patrimonio actual` también queda con tono neutral por ser saldo; verde/rojo se reserva para desempeño, variaciones y pérdidas/ganancias.
- [x] 2026-07-04 20:11 Ajuste Metas: el modal permite elegir entre asignar fuentes por `Valor` o por `Porcentaje`; smoke cubre ambos payloads (`monto_asignado` y `porcentaje`).
- [x] 2026-07-04 20:22 Suscripciones USD/TRM: migración `0006_subscriptions_currency.sql`, API `GET /api/exchange-rates/usd-cop`, UI para `COP`/`USD`, TRM, margen de banco y estimado mensual; `subscriptions/apply` y `close-month` usan TRM vigente con fallback a tasa guardada. Build, smoke y navegador OK.
- [x] 2026-07-04 20:28 Ajuste Suscripciones: tarjeta `Diferencia fija / mes` muestra ingresos fijos activos menos gastos fijos activos; el conteo de gastos ahora solo cuenta recurrentes de gasto. Build y smoke OK.
- [x] 2026-07-04 20:33 Ajuste Dashboard: los sparklines de plataformas usan color por desempeño (`verde` positivo, `rojo` negativo, neutral sin cambio) en vez del color de marca. Build y smoke OK.
- [x] 2026-07-04 20:37 Ajuste Inversiones: consolidado `Todas > Fondos` ahora muestra saldos parciales existentes de filas pendientes (ej. julio fondos), sin calcular ganancia/rentabilidad ni marcarlos como cerrados. Build, smoke y API OK.
- [x] 2026-07-04 20:42 Ajuste Gastos e Ingresos: la vista detecta fijos activos, muestra totales estimados de ingresos/gastos/diferencia fija y permite aplicar los fijos al mes desde ahí. Build y smoke OK.
- [x] 2026-07-04 21:08 Nibor Música MVP: migración `0007_music.sql`, API `/api/music/songs`, vista `/musica`, navegación lateral y smoke. La app queda orientada como `Nibor.com` app madre, no solo Finanzas.
- [x] 2026-07-04 21:33 Nibor Conocimiento MVP: migración `0008_knowledge.sql`, API `/api/knowledge/items`, vista `/conocimiento`, navegación lateral y smoke. El módulo cubre libros, cursos, idiomas, artículos, videos y temas con estado y progreso.
- [x] 2026-07-04 21:50 Mejora Nibor Música: la vista queda enfocada en rap, `lista` se muestra como "Terminada sin publicar", se agregan gráficas ECharts de publicadas/en proceso/terminadas sin publicar y backend usa `Rap` como género por defecto si falta. Build, smoke y `/musica` OK.
- [x] 2026-07-05 10:01 Simplificación Nibor Música: se removieron artista, BPM y tonalidad del formulario/listado; artista se guarda siempre como `Nibor` y BPM/tonalidad se guardan `null` desde UI/backend. Build, smoke y `/musica` OK.
- [x] 2026-07-05 10:05 Apoyo a Claude en Tarjetas: `ConfigView` agrega sección `Tarjetas` con CRUD sobre `/api/cards`, aviso de no guardar números y totales por tarjeta; `server/smoke.js` cubre validación sensible, creación, edición, asociación a fijo y limpieza. `db:migrate:local` sin pendientes, build/smoke y `/config` OK.
- [x] 2026-07-05 10:24 Ajuste Nibor Conocimiento: `Área o ruta` deja de ser texto libre para idioma; migración `0011_knowledge_language.sql` agrega `knowledge_items.idioma` (`espanol`/`ingles`), la UI muestra selector/filtro/tarjetas por Español e Inglés y `server/smoke.js` valida idioma.
- [x] 2026-07-05 10:32 Ajuste Nibor Conocimiento: el año deja de guardarse dentro de `notas`; migración `0012_knowledge_year.sql` agrega `knowledge_items.anio`, migra `Año registrado: YYYY`, limpia notas, agrega filtro/tarjeta/selector por año y smoke valida año/filtro.
- [x] 2026-07-05 11:10 Ajuste Cierre de mes: paso `Saldos` ahora solo permite digitar `Saldo final`; saldo inicial, aportes y retiros se muestran como resumen de solo lectura porque aportes/retiros se registran desde `+ Aporte / retiro` en Inversiones.
- [x] 2026-07-06 20:05 Takeover Viajes/Préstamos: migración `0013_loans_and_travel_platform.sql` crea plataforma `Viajes` como `inversion` y tabla `loans`; API `/api/loans`, vista `/prestamos`, menú lateral y smoke. Decisión: Viajes no es meta, queda como plataforma tipo inversión para registrar aportes, saldos y rentabilidad igual que Nubank.
- [x] 2026-07-06 20:28 Nibor Salud MVP: migración `0014_health.sql` crea perfil, medidas, condiciones, medicamentos, citas y visión; API `/api/salud` calcula IMC/categoría en backend; vista `/salud`, menú lateral y smoke. Decisión: no guardar datos personales de salud en migraciones; se cargaron en D1 local por API hipertensión, miopía, astigmatismo y Losartán 50 mg diario a las 09:00.
- [x] 2026-07-06 21:14 Nibor Hábitos MVP: migración `0015_habits.sql`, API `/api/habits`, importador `scripts/import_habits_old.mjs`, vista `/habitos`, menú lateral y paneles en `/salud` + `/conocimiento`. Decisiones: `habit_events` es fuente de verdad; progreso, rachas, heatmap, conteos e integraciones se calculan en backend; solo se migró `username = nibor` / `user_id = 6`; no se migró login, emails, hashes, sesiones ni PHP viejo. Importación local idempotente confirmada con 5 hábitos y 910 eventos. Build, smoke y navegador (`/habitos`, `/salud`, `/conocimiento`) OK. Pendiente remoto: `npm run db:migrate:remote` y `npm run habits:import:remote`.
- [x] 2026-07-08 18:51 Notificaciones UI + smoke/docs: campana global en `App.vue` con badge y refresh cada ~5 min, nueva vista `/notificaciones` con bandeja, marcar leída/todas, settings de reglas/Pushover y prueba push; `server/smoke.js` ahora cubre Eventos, Vehículos y Notificaciones, y ajusta heatmap de hábitos a 182 días. README documenta R2 (`nibor-files`) y Pushover. Build, migración local y smoke OK.
- [x] 2026-07-08 19:38 Notificaciones v2 por handoff de Claude: `NotificacionesView` rediseña Configuración con tarjetas por regla, push/prioridad/sonido, Entrega con silencio/pausa/resumen/vencidas y Pushover; `server/smoke.js` valida el contrato nuevo de `/settings` y `/run`.
- [x] 2026-07-08 20:49 Notificaciones v3 por pedido del usuario: configuración contextual por módulo con `NotificationModuleSettings.vue` y botón de campana en Hábitos, Vehículos, Eventos y Suscripciones; migración `0020_notification_module_settings.sql`; backend de Hábitos usa franja/repetición con `hora`+`minuto`; Vehículos usa preset 180/90/30/15/8/3/0; cron cada 15 minutos.
- [x] 2026-07-08 21:00 Notificaciones de Hábitos v4: migración `0021_habit_notification_windows.sql`, `habitos_franjas` JSON con múltiples franjas por días; modal permite agregar/quitar franjas, seleccionar días L-M-X-J-V-S-D, usar horas `HH:mm` como `23:59` y aplicar preset L-V 06:00-07:00 + 16:00-23:59 y S-D 00:00-23:59. Backend dedupe por franja/slot.
- [x] 2026-07-09 19:25 Diagnostico de notificaciones: la D1 local tenia avisos del 2026-07-08, pero `server/smoke.js` usaba `/notifications/read-all` y podia marcar como leidas notificaciones reales. Se cambio el smoke para no llamar `read-all`, marcar solo avisos `Smoke`, usar fecha aislada con `/notifications/run { fecha }` y filtros `GET /api/notifications?fecha=`.
- [x] 2026-07-09 19:35 Fix notificaciones nuevas: `habitSlot` ya no exige que `Revisar ahora` caiga en el minuto exacto del intervalo; cualquier minuto dentro de la franja usa el slot vigente y mantiene dedupe por inicio de slot. `server/smoke.js` cubre revision manual dentro del intervalo y restaura settings con `try/finally`.

## Bloqueos

(anotar aquí si algo te impide avanzar; luego continúa con la siguiente tarea no bloqueada)
- 2026-07-04: Fase 1 bloqueada hasta que Claude complete Fase 0. El repositorio aún no tiene `package.json`, `src/`, `server/`, `migrations/` ni `wrangler.toml`.
  - 2026-07-04 11:50 Codex: desbloqueado técnicamente. Claude dejó scaffold; Codex verificó `npm run build`, migración local y Worker health en `8788` por conflicto temporal de puerto.
  - 2026-07-12: Cloudflare Access ya está configurado para `niborapp.com` con los dos correos autorizados. Falta probarlo contra el Worker ya desplegado.

## Seguridad, QA y pruebas — 2026-07-12

- [x] Proteger el flujo de despliegue: `workers_dev = false`, Preview URLs desactivadas y `npm run deploy` bloqueado hasta confirmar `NIBOR_ACCESS_CONFIRMED=1` después de configurar Access.
- [x] Documentar Cloudflare Access como login de producción para todo `nibor.com` y `/api/*`, con One-time PIN y un único correo permitido; agregar cierre de sesión en producción.
- [ ] Probar la política real de Cloudflare Access contra `niborapp.com` ya desplegado, con ambos correos autorizados y uno no autorizado; ver `docs/CLOUDFLARE_ACCESS.md`.
- [x] Cerrar Fase 6.3: estados vacíos, errores de red, responsive y ruta 404 verificados; aviso offline agregado.
- [x] Validar fechas reales centralmente en `server/db.js`, incluyendo fecha, hora y fecha-hora; Salud/Eventos/Vehículos reutilizan los helpers.
- [x] Agregar `npm test` y `npm run smoke` aislado sobre D1/R2 temporales. El smoke dejó de depender de los 5 hábitos/910 eventos personales y cubre fechas imposibles.

## Decisiones tomadas

- 2026-07-04: Codex recomienda y adopta Cloudflare D1 para este proyecto. La API se implementará como Cloudflare Worker/Hono sobre binding `env.DB`; no Express/better-sqlite3 en el runtime objetivo.
- 2026-07-04 11:50: Se agregó endpoint `/api/categories` aunque el CRUD UI aparece en Fase 4, porque el store y movimientos/suscripciones necesitan el catálogo desde Fase 1.
