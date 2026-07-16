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
  - 2026-07-12: Cloudflare Access ya está configurado para `niborapp.com` con los dos correos autorizados y OTP por correo. Acceso autorizado comprobado; sin sesión queda bloqueado.

## Seguridad, QA y pruebas — 2026-07-12

- [x] Proteger el flujo de despliegue: `workers_dev = false`, Preview URLs desactivadas y `npm run deploy` bloqueado hasta confirmar `NIBOR_ACCESS_CONFIRMED=1` después de configurar Access.
- [x] Documentar Cloudflare Access como login de producción para todo `nibor.com` y `/api/*`, con One-time PIN y un único correo permitido; agregar cierre de sesión en producción.
- [x] Probar la política real de Cloudflare Access contra `niborapp.com`: el OTP por correo permite el acceso autorizado y sin sesión queda bloqueado; ver `docs/CLOUDFLARE_ACCESS.md`.
- [x] Cerrar Fase 6.3: estados vacíos, errores de red, responsive y ruta 404 verificados; aviso offline agregado.
- [x] Validar fechas reales centralmente en `server/db.js`, incluyendo fecha, hora y fecha-hora; Salud/Eventos/Vehículos reutilizan los helpers.
- [x] Agregar `npm test` y `npm run smoke` aislado sobre D1/R2 temporales. El smoke dejó de depender de los 5 hábitos/910 eventos personales y cubre fechas imposibles.

## Módulo Casa — administración y comprobantes (implementado por Claude)

- [x] 16.1 Definir y documentar el modelo: una propiedad configurable y un registro único por mes de administración, preparado para admitir más propiedades en el futuro.
- [x] 16.2 Crear migración D1 para `home_properties`, `home_administration_periods` y `home_administration_items`, sin incluir dirección, nombres, códigos, valores ni documentos reales en seeds o pruebas.
  - Migración `0024_home.sql`; UNIQUE (property_id, anio, mes) garantiza un registro por mes.
- [x] 16.3 Guardar por periodo la información de la cuenta de cobro: año/mes, fecha de emisión, número de cuenta, fecha límite de descuento, fecha de vencimiento opcional, porcentaje/valor de descuento, total con descuento y notas.
  - Saldo anterior/cuotas/nuevo saldo totales NO se guardan: se calculan en backend sumando los conceptos.
- [x] 16.4 Guardar conceptos dinámicos por periodo con `saldo_anterior`, `cuota_mes` y `nuevo_saldo`; el descuento se guarda tal como viene en la cuenta (valor/total), nunca recalculado como porcentaje del total.
- [x] 16.5 Guardar el pago por separado (`fecha_pago`, `valor_pagado`, `mora_cobrada` vía `PUT/DELETE /periods/:id/payment`); estado backend: `pendiente`, `pagado_con_descuento`, `pagado_sin_descuento`, `en_mora`. La mora de un mes sin pagar solo se infiere por `fecha_vencimiento`; un pago queda `en_mora` solo si hubo mora cobrada.
- [x] 16.6 Implementar API REST `/api/home`: propiedades CRUD, periodos/conceptos/pagos, historial filtrable por año/estado y resumen backend (pagados, pendientes, con/sin descuento, en mora, descuentos ganados, moras y total pagado).
- [x] 16.7 PDF privado en R2 por periodo: **decisión del usuario 2026-07-15 — UN solo PDF por mes** (él une cuenta de cobro + comprobante en un archivo). Solo PDF válido, reemplazar/eliminar, visor inline y descarga con `Cache-Control: no-store`. Clave R2: `casa/{period_id}/...`.
- [x] 16.8 `CasaView.vue`, ruta `/casa` y entrada `Casa` en el menú lateral con estado vacío amable y diseño responsive/dark.
- [x] 16.9 Cabecera de resumen (total pagado, descuentos ganados, moras) y filtros por año/estado; el historial muestra conceptos con totales, descuento/fecha límite, vencimiento, pago, mora, estado y acciones del PDF.
- [x] 16.10 Modal para registrar/editar la cuenta mensual con conceptos dinámicos (+/−), modal aparte para el pago y adjuntar el PDF desde la tarjeta del mes; totales backend y validaciones claras.
- [x] 16.11 Smoke aislado: CRUD, duplicado 409, fecha imposible, totales backend, estados (pendiente → con descuento → en mora → pendiente), resumen, filtro por estado, PDF roundtrip inline con no-store y limpieza. `npm test`, build y smoke OK.
- [x] 16.12 Aplicar la migración remota, desplegar desde `Documents\\Git\\Nibor\\Nibor.com` y verificar `/casa` en escritorio y móvil sin overflow ni errores.
  - Migración 0024 aplicada en D1 remota; deploy `64ffdf04` desde el repo Git; `/casa` y `/api/*` responden detrás de Access. Verificación visual final en navegador queda a cargo del usuario al iniciar sesión.

Decisiones iniciales para el handoff:

- El MVP no creará movimientos automáticos en Gastos e Ingresos para evitar duplicar la administración que ya pueda existir como gasto fijo; esa integración se evaluará aparte.
- La imagen de referencia es una `Cuenta de cobro`, no la evidencia bancaria del pago. El archivo es opcional y privado; D1 guarda únicamente metadatos y R2 guarda el PDF.
- Cambio de alcance confirmado por el usuario (2026-07-15): un único PDF por periodo en vez de dos; los datos del pago siguen separados en D1 porque de ahí salen los estados.
- Una mensualidad conserva sus propios valores y fecha límite, para que cambios futuros en la tarifa o en el descuento no alteren el historial anterior.
- La cuenta de referencia contiene datos personales; solo se documenta su estructura. Nombres, dirección, identificación tributaria, código de inmueble y valores reales no se copian al repositorio ni al chat.
- Los datos reales se cargarán exclusivamente desde la UI; nunca en migraciones, fixtures, logs o smoke.

## Decisiones tomadas

- [x] 2026-07-12 15:05 Familiar MVP: migración `0022_family.sql`, API `/api/family`, PDFs privados en R2, vista `/familiar`, navegación y smoke. Decisión: mostrar el número completo porque el usuario lo necesita a mano; no incluir ningún dato familiar real en migraciones ni pruebas. D1 remota migrada; `npm test`, build, smoke aislado y responsive 390 px OK.
- [x] 2026-07-12 15:18 Familiar: botón para copiar el número de documento con confirmación visual `Copiado` y manejo de error del portapapeles.
- [x] 2026-07-12 21:17 Recuperación producción: una ejecución de Codex desplegó desde la copia obsoleta no-Git `Escritorio\Nibor.com` y reemplazó Familiar. Se restauró producción desde el repo Git (versión `0391e98f`) y la copia local se aisló como Worker `nibor-finanzas-local` para que no pueda volver a sobrescribir `niborapp.com`.
- [x] 2026-07-13 Vehículos: restaurar en el repositorio Git principal los anillos de días restantes de SOAT y técnico-mecánica; implementación CSS responsive, sin cambios de esquema ni API.
- [x] 2026-07-13 Eventos móvil real: feed ICS protegido con token secreto rotatorio, URL entregada desde la sesión autenticada, aplicación Access `Calendario móvil Nibor` con bypass limitado a `/api/events/calendar.ics`, despliegue y responsive móvil verificados.
- [x] 2026-07-15 Eventos: mover la configuración de suscripción móvil a un modal abierto desde un botón junto a la campana, dejando visible por defecto solo la lista de eventos. Verificado con pruebas, build y navegador en escritorio/móvil (sin overflow ni errores de consola); desplegado como `b4fa02c2-4dd5-452a-874c-0b44513d7a0d`.
- [x] 2026-07-15 Vehículos: agregar Tarjeta de propiedad a vehículos existentes/nuevos y una sección de Licencia de conducción con PDF único, categorías dinámicas y vencimiento independiente por categoría; D1/API/UI/notificaciones/smoke publicados como `3ec35f45-3428-4dec-ab63-2885a67cd8db`. Verificado en escritorio y móvil sin overflow ni errores de consola.
- [x] 2026-07-15 Suscripciones: agregar filtro Todos/Ingresos/Gastos al Histórico de fijos, manteniendo el año y sin cambios de API o D1. Publicado como `be1ca2be-5b0a-4ba5-8f95-496b5ed0267a`; verificado con datos reales en escritorio/móvil, sin overflow ni errores de consola.
- [x] 2026-07-15 Suscripciones: agregar al pie del Histórico de fijos el resumen anual del filtro; el backend devuelve ingresos, gastos y balance para no calcular cifras financieras en Vue. Publicado como `dd97dbd1-0418-4363-a42c-be7877474670` y verificado con datos reales en escritorio/móvil.
- [x] 2026-07-15 Notificaciones: limitar la bandeja a hoy y ayer, mostrar inicialmente las 5 más recientes y revelar bloques de 5 con `Mostrar más`. API, test, build, smoke aislado y navegador escritorio/móvil OK; publicado como `d595f491-6178-4599-b0ea-155bc5926f5d`.
- [x] 2026-07-15 Notificaciones: ocultar la configuración general y Pushover en un modal abierto desde un icono de engranaje junto al título, siguiendo el patrón de Eventos. Test, build y navegador escritorio/móvil OK; publicado como `a3f51148-4f99-4787-896b-13d23314b502`.

- 2026-07-04: Codex recomienda y adopta Cloudflare D1 para este proyecto. La API se implementará como Cloudflare Worker/Hono sobre binding `env.DB`; no Express/better-sqlite3 en el runtime objetivo.
- 2026-07-04 11:50: Se agregó endpoint `/api/categories` aunque el CRUD UI aparece en Fase 4, porque el store y movimientos/suscripciones necesitan el catálogo desde Fase 1.
