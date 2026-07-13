# Estado compartido — Nibor.com

Actualizado: 2026-07-12 15:10 -05:00

## Decisión activa

- Stack objetivo: Vue 3 + Vite + Tailwind + ECharts en frontend; Cloudflare Worker + Hono en backend; Cloudflare D1 como base de datos.
- Visión de producto: Nibor.com es una app madre para vida personal. Finanzas es el primer módulo; Música, Conocimiento, Hábitos, Salud, Calendario y Proyectos deben entrar como módulos del mismo ecosistema.
- Binding D1 esperado: `env.DB`.
- Nombre sugerido de base D1: `nibor-finanzas`.
- API local esperada: `http://localhost:8787/api`.
- Frontend debe llamar rutas relativas `/api/*`.

## Cómo marcar avance

- Cada agente marca sus checkboxes en `TAREAS_CODEX.md` o `TAREAS_CLAUDE.md`.
- Al completar una fase, cambiar su estado en este archivo a `Completada`.
- Si una fase queda esperando a otro agente, marcarla `Bloqueada` y anotar el bloqueo abajo.
- Si se cambia esquema D1, rutas API o comando de arranque, actualizar también `PLAN.md` y `CONVENCIONES.md`.
- Para conversación informal entre agentes, usar `chat.txt` en la raíz con formato `YYYY-MM-DD HH:mm:ss -05:00 | agente: "mensaje"`.
- `chat.txt` sirve para preguntas, handoffs y coordinación rápida; este archivo sigue siendo el tablero formal.
- Antes de empezar una tarea nueva y justo después de terminar cualquier tarea, cada agente debe revisar `chat.txt` para detectar mensajes nuevos del otro agente.

## Tablero de fases

| Fase | Responsable | Estado | Siguiente paso |
|---|---|---|---|
| 0 — Scaffold Cloudflare | Claude | Completada | Scaffold verificado por Codex con build, migración local y health |
| 1 — API REST D1 | Codex | Completada | Endpoints probados con `npm run smoke` |
| 2 — Inversiones | Codex | Completada | Tabla anual, edición por modal, totales backend y vista consolidada listas |
| 3 — Dashboard | Claude | Completada | Observaciones de QA corregidas (botón Actual con fallback, Math.abs en variación) |
| 4 — Gastos/Suscripciones | Codex | Completada | Gastos, movimientos, suscripciones y categorías listas |
| 5 — Cierre de mes | Claude | Completada | QA Codex OK: cierre ficticio de julio, validaciones negativas y reversión a pendiente |
| 6 — Históricos y pulido | Claude + Codex | Completado | 6.1 local, 6.2 dark y 6.3 revisión final completos; D1/R2/Access y el despliegue en `niborapp.com` están verificados |
| 7 — Nibor Música | Codex | Completada | MVP de canciones: tabla D1, API `/api/music/songs`, vista `/musica`, menú y smoke |
| 8 — Nibor Conocimiento | Codex | Completada | MVP de aprendizaje con idioma y año controlados: tabla D1, API `/api/knowledge/items`, vista `/conocimiento`, menú y smoke |
| 9 — Préstamos y ahorro Viajes | Codex | Completada | Plataforma `Viajes` creada por migración como `inversion`; préstamos con tabla D1, API `/api/loans`, vista `/prestamos`, menú y smoke |
| 10 — Nibor Salud | Codex | Completada | MVP de salud con medidas, IMC backend, condiciones, medicamentos, citas, visión, vista `/salud`, API `/api/salud` y smoke |
| 11 — Nibor Hábitos | Codex | Completada | MVP de hábitos con migración `0015_habits.sql`, API `/api/habits`, importador old idempotente, vista `/habitos`, integraciones Salud/Conocimiento y smoke |
| 12 — Eventos | Claude | Completada | Calendario personal con migración `0016_events.sql`, API `/api/events`, feed `/api/events/calendar.ics`, vista `/eventos` y smoke Codex |
| 13 — Vehículos | Claude | Completada | Vehículos con migración `0017`, API `/api/vehicles`, PDFs en R2, vista `/vehiculos`, gastos integrados y smoke Codex |
| 14 — Notificaciones | Claude + Codex | Completada | Backend/cron/Pushover v2 por Claude; configuración contextual por módulo, campana, `/notificaciones`, smoke y docs por Codex |
| 15 — Familiar | Codex | Completada | Directorio privado, identificación visible, visor/descarga PDF en R2, responsive y smoke |

## Bloqueos activos

- Access ya tiene dos correos exactos autorizados y OTP por correo; `workers.dev`/Preview URLs siguen desactivados. El Worker se despliega desde Git en `niborapp.com`.

## Handoff actual

- Codex implementó Fase 1, Fase 2 y Fase 4.
- Codex completó apoyo a Claude: toggle dark mode y endpoint transaccional `POST /api/close-month`.
- Codex completó deploy prep: `[assets]` en `wrangler.toml`, `npm run deploy`, scripts de seed remoto/local y `README.md`.
- Codex completó responsive móvil del sidebar en `App.vue`.
- QA Dashboard: build/smoke/consola OK; observaciones corregidas por Claude.
- Codex cargó Happi Ene-Jul 2026 en `scripts/seed_historicos.sql` y lo aplicó a D1 local; julio queda pendiente con `saldo_final = NULL`.
- QA Wizard Fase 5: cierre ficticio de julio OK, Dashboard/Inversiones vía API reflejan el cierre, validaciones negativas OK, julio revertido a pendiente sin borrar filas.
- 2026-07-12: D1 remota `nibor-finanzas` creada y migrada; R2 privado `nibor-files` creado; 6.452 filas de la D1 local se migraron y los conteos clave coinciden. `wrangler.toml` usa el ID remoto real. Falta commit/push, conectar Workers Builds y asociar el dominio al Worker.
- Codex actualizó `/api/snapshots` con `consolidated_by_tipo` y `InversionesView` permite alternar Total, Inversiones y Fondos de ahorro dentro de la pestaña "Todas".
- Codex agregó presets guiados de ingresos fijos en `SuscripcionesView` (Salario y Arriendo apartamento) y aviso en Dashboard cuando no hay ingresos fijos para calcular tasa de ahorro.
- Codex agregó módulo Metas: migraciones `0004_goals.sql` y `0005_goal_allocations_amount.sql`, API `/api/goals`, vista `MetasView`, ruta `/metas` y navegación lateral. La UI permite asignar fuentes por valor COP o por porcentaje; el backend normaliza y guarda `monto_asignado` + `porcentaje`.
- Codex agregó soporte para suscripciones en USD: migración `0006_subscriptions_currency.sql`, endpoint `GET /api/exchange-rates/usd-cop`, UI para TRM + margen de banco y aplicación mensual usando TRM vigente con fallback a la tasa guardada.
- Claude agregó pagos automáticos/manuales, recordatorios, histórico de fijos y tarjetas: migraciones `0009_subscriptions_automatica.sql` y `0010_cards.sql`, rutas `/api/subscriptions/reminders`, `/api/subscriptions/history` y `/api/cards`.
- Codex completó el apoyo pedido por Claude: sección `Tarjetas` en `ConfigView` con CRUD por `/api/cards`, aviso para no guardar números y cobertura de cards en `server/smoke.js`.
- Codex inició Nibor Música como segundo módulo de Nibor.com: migración `0007_music.sql`, API `/api/music/songs`, vista `MusicaView`, ruta `/musica`, navegación lateral y smoke. Estados soportados: idea, proceso, lista, publicada.
- Codex mejoró Nibor Música para el contexto real del usuario: catálogo de rap, `lista` se presenta como "Terminada sin publicar", nuevas gráficas ECharts para publicadas/en proceso/terminadas sin publicar y default de género `Rap` al crear canciones sin género.
- Codex simplificó Nibor Música: la UI ya no muestra campos de artista, BPM ni tonalidad; el backend normaliza artista a `Nibor` y guarda BPM/tonalidad como `null` en altas/ediciones nuevas.
- Codex inició Nibor Conocimiento como módulo amplio de aprendizaje: migración `0008_knowledge.sql`, API `/api/knowledge/items`, vista `ConocimientoView`, ruta `/conocimiento`, navegación lateral y smoke. Tipos: libro, curso, idioma, articulo, video, tema, otro. Estados: pendiente, progreso, pausado, completado, repasar.
- Codex ajustó Nibor Conocimiento para que el idioma sea controlado (`espanol`/`ingles`) en vez de texto libre: migración `0011_knowledge_language.sql`, filtro por idioma, tarjetas de Español/Inglés y smoke actualizado.
- Codex movió el año registrado de `notas` a `knowledge_items.anio`: migración `0012_knowledge_year.sql`, filtro/chips por año, tarjeta "Este año", selector de año en el modal y smoke actualizado.
- Codex ajusto el paso `Saldos` de Cierre de mes: solo se digita `saldo_final`; `saldo_inicial`, `aporte` y `retiros` se muestran de solo lectura porque aportes/retiros se registran desde `+ Aporte / retiro` en Inversiones.
- Codex completó el takeover de la asignación que Claude no alcanzó a cerrar: migración `0013_loans_and_travel_platform.sql` crea plataforma `Viajes` como `inversion`, tabla `loans`, API `/api/loans`, vista `/prestamos`, navegación lateral y smoke.
- Codex agregó Nibor Salud: migración `0014_health.sql` con perfil, medidas, condiciones, medicamentos, citas y fórmulas visuales; API `/api/salud` con IMC/categoría calculados en backend; vista `/salud`, menú lateral, smoke y datos locales iniciales del usuario (hipertensión, miopía, astigmatismo y Losartán 50 mg diario 09:00).
- Codex agregó Nibor Hábitos: migración `0015_habits.sql` con `habits`, `habit_schedule`, `habit_events`, `habit_defer` y `habit_links`; API `/api/habits`; importador `scripts/import_habits_old.mjs` desde `habitos old` solo para `username = nibor` / `user_id = 6`; vista `/habitos`; paneles compactos en `/salud` y `/conocimiento`; smoke y navegador OK. Local quedó con 5 hábitos y 910 eventos históricos importados. Pendiente remoto: ejecutar `npm run db:migrate:remote` y `npm run habits:import:remote` cuando Cloudflare D1 esté listo.
- Claude completó Eventos: migración `0016_events.sql`, API `/api/events`, feed iCalendar `/api/events/calendar.ics`, vista `/eventos`, nav/router y validación de fecha real. Codex amplió `server/smoke.js` para cubrir CRUD, UID estable e ICS.
- Claude completó Vehículos: migración `0017`, API `/api/vehicles`, R2 `FILES` para PDFs, vista `/vehiculos`, gastos integrados en `movements.vehicle_id` y nav/router. Codex amplió `server/smoke.js` para cubrir documentos, estados, PDF roundtrip, gasto integrado y bloqueo de borrado con gastos.
- Claude completó backend de Notificaciones: migraciones `0018_notifications.sql` y `0019_notification_prefs.sql`, API `/api/notifications`, motor `runChecks`, cron en `wrangler.toml` y Pushover. Codex completó frontend: campana global en `App.vue`, ruta/vista `/notificaciones`, bandeja, marcar leída/todas, configuración v2 con push/prioridad/sonido por regla, silencio, pausa, resumen diario, prueba push, smoke y README.
- Codex agregó Notificaciones v3 por pedido del usuario: migración `0020_notification_module_settings.sql`, botón de campana/configuración contextual en `/habitos`, `/vehiculos`, `/eventos` y `/suscripciones`; modal reutilizable `NotificationModuleSettings.vue`; hábitos con franja y repetición; vehículos con preset 180/90/30/15/8/3/0; cron Cloudflare cada 15 minutos para que las franjas funcionen.
- Codex agregó Notificaciones v4 para Hábitos: migración `0021_habit_notification_windows.sql`, `habitos_franjas` como JSON en `notification_settings`, múltiples franjas por días con preset L-V mañana/tarde y S-D todo el día; backend filtra por día/hora/minuto y mantiene dedupe por franja.
- Codex diagnostico el reporte del 2026-07-08: la D1 local si tenia notificaciones de ese dia, pero el smoke podia marcar notificaciones reales como leidas con `/notifications/read-all`. Quedo corregido para usar fecha aislada en `/api/notifications/run`, filtro `GET /api/notifications?fecha=` y marcado individual solo de avisos `Smoke`.
- Codex corrigio la causa de "0 nuevas" en revisiones manuales: las notificaciones de habitos ya se generan en cualquier minuto dentro de la franja activa, no solo exactamente en el inicio del slot; el dedupe sigue usando el inicio del slot. El smoke ahora prueba ese caso y restaura settings con `try/finally`.
- Verificación recomendada: `npm run smoke` usa un Worker y D1/R2 temporales. Para diagnóstico explícito contra un Worker ya levantado, usar `npm run smoke:local` y definir `SMOKE_BASE_URL` si corre en otro puerto.
- Seguridad de producción configurada: Cloudflare Access protege `niborapp.com` y `/api/*` para los dos correos autorizados; `workers_dev`/Preview URLs están desactivadas, producción muestra `Cerrar sesión` y `npm run deploy` exige `NIBOR_ACCESS_CONFIRMED=1`. En `[assets]`, `run_worker_first = ["/api/*"]` garantiza que las APIs no caigan en el fallback SPA.
- Producción se despliega únicamente desde `Documents\Git\Nibor\Nibor.com`. La copia obsoleta del Escritorio usa el nombre `nibor-finanzas-local` para impedir que un deploy accidental vuelva a reemplazar `niborapp.com`.
- Fase 6.3 cerrada: rutas, 404, estados vacíos y responsive 390x844 verificados sin errores de consola ni overflow; `App.vue` incluye aviso offline/reintento.
- Validación temporal endurecida: `isValidDate`, `isValidTime` e `isValidDateTime` rechazan fechas/horas imposibles en todos los módulos que reutilizan `server/db.js`.
- Pruebas seguras: `npm test` cubre helpers y fórmulas; `npm run smoke` ahora crea/elimina D1 y R2 temporales y nunca usa datos personales. Para apuntar de forma explícita a un Worker levantado existe `npm run smoke:local`.

## Notas de arquitectura

- D1 usa SQL compatible con SQLite, así que el modelo de datos del plan se conserva.
- Los cálculos `saldo_total_inicial`, `ganancia` y `rentabilidad` son responsabilidad exclusiva del backend.
- `saldo_final = NULL` significa mes pendiente y nunca debe contarse como cero.
- Si se usa `data/finanzas.db` como export/import temporal, contiene datos sensibles: no borrarlo ni recrearlo sin migración explícita.
- `cards` guarda solo nombres identificadores y colores; no guardar números reales de tarjeta ni datos sensibles.
- `music_songs` guarda datos creativos del usuario para Nibor Música; no pertenece al cálculo financiero.
- `knowledge_items` guarda recursos de aprendizaje del usuario para Nibor Conocimiento; `idioma` es controlado (`espanol`/`ingles`) y `anio` es estructurado para métricas separadas. No pertenece al cálculo financiero.
- `loans` guarda préstamos personales del usuario; el resumen de pendiente/devuelto se calcula en backend y no afecta patrimonio ni rentabilidad.
- `health_*` guarda datos sensibles de salud del usuario. No se deben poner datos personales de salud en migraciones; cargar/editar por API o UI. El IMC es una referencia adulta calculada en backend, no un diagnóstico médico.
- `habit_events` es la fuente de verdad para hábitos y para las proyecciones hacia Salud/Conocimiento. No migrar login, usuarios, emails, hashes, sesiones ni credenciales de la app PHP vieja; el sistema nuevo asume usuario único Nibor.
- `events` alimenta el módulo Eventos y el feed ICS. El UID debe permanecer estable al editar para que calendarios suscritos actualicen correctamente.
- `vehicles` y `vehicle_items` guardan metadatos; los PDFs viven en R2 (`FILES`, bucket `nibor-files`). En remoto hay que crear el bucket con `npx wrangler r2 bucket create nibor-files` antes del deploy.
- `notifications` usa `dedupe_key` para no duplicar reglas del cron. Pushover requiere `pushover_user` y `pushover_token` guardados en settings; sin llaves, solo funciona la bandeja in-app. La tabla guarda prioridad y sonido por notificación; `notification_settings` guarda la entrega por regla, silencio, pausa, resumen diario, franjas múltiples de hábitos, programación de vehículos y repetición de vencidas.
- `family_members` guarda información identificatoria sensible; sus PDFs viven en R2 privado (`FILES`). Nunca incluir familiares, números de documento ni PDFs reales en migraciones, seeds, fixtures, logs o smoke.
