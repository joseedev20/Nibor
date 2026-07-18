# Plan Maestro — Nibor.com

> Plataforma personal para centralizar la vida del usuario: finanzas, música, metas,
> conocimiento, hábitos, salud, calendario, proyectos y asistente IA.
> El módulo Finanzas reemplaza el Excel actual que se llena a fin de mes.

## 1. Stack elegido (decisión final)

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | Vue 3 (Composition API) + Vite | Sintaxis clara, fácil de mantener, arranque instantáneo |
| Estilos | Tailwind CSS v4 | Diseño moderno y consistente sin CSS a mano |
| Gráficas | Apache ECharts (vue-echarts) | Las gráficas más pulidas del ecosistema: áreas, donas, barras, animaciones |
| Estado | Pinia | Store oficial de Vue, simple |
| Router | Vue Router | Navegación entre secciones |
| Backend | Cloudflare Workers + Hono | API REST ligera compatible con Cloudflare, sin servidor propio |
| Base de datos | Cloudflare D1 | SQL con semántica SQLite, backups/Time Travel y despliegue directo en Cloudflare |
| Moneda | COP, formato `es-CO` | `$ 4.048.013,73` |

**Comando único de arranque local:** `npm run dev` (levanta Worker local con Wrangler + frontend Vite con proxy a `/api`).

**Decisión Cloudflare/D1 (2026-07-04):**
- D1 será la fuente de verdad de los datos financieros en la versión Cloudflare.
- El esquema se mantiene con SQL compatible con SQLite para que las fórmulas y consultas sigan simples.
- No se usará `better-sqlite3` ni Express en producción; la API se implementa como Worker con binding `env.DB`.
- Si aparece un archivo local `data/finanzas.db` como export/import temporal, se trata como dato sensible: nunca borrarlo ni recrearlo sin migración explícita.

**Decisión de seguridad (2026-07-12):**
- La aplicación completa y `/api/*` serán privadas mediante Cloudflare Access antes del primer deploy.
- Se autorizan solo `Joseedev20@gmail.com` y `joseeborja20@hotmail.com`, inicialmente con One-time PIN.
- `workers.dev` y Preview URLs permanecen desactivadas; el deploy exige confirmación explícita de que Access ya está configurado.
- El feed iCalendar usa una URL con token secreto rotatorio almacenado como `CALENDAR_FEED_TOKEN`; solo `/api/events/calendar.ics` puede omitir el login de Access y el Worker rechaza solicitudes sin el token correcto.

## 2. Secciones de la app

Nibor.com es una app madre. Finanzas queda como el primer módulo productivo; los nuevos módulos deben convivir dentro del mismo layout, API y base D1 salvo que exista una razón fuerte para separar.

1. **Dashboard (Resumen)** — lo primero que ves al abrir:
   - Patrimonio total y variación vs mes anterior
   - Tarjetas por plataforma (Binance, Colfondos, Nubank, Happi) con saldo, ganancia del mes y rentabilidad
   - Gráfica de evolución del patrimonio (área apilada por plataforma)
   - Gráfica de ganancia/pérdida mensual (barras +/-)
   - Balance del mes: ingresos vs gastos, tasa de ahorro
2. **Inversiones** — el reemplazo directo del Excel:
   - Tabla mensual por plataforma: saldo inicial (auto = saldo final del mes anterior), aporte, retiros, saldo final
   - Ganancia y rentabilidad % SIEMPRE calculadas, nunca digitadas
   - Meses sin llenar = estado "pendiente" (NO cero — el Excel actual muestra -100% en julio por esto)
   - Vista "Todas" separa Total, Inversiones y Fondos de ahorro usando agregados calculados por backend
3. **Metas**:
   - Metas reutilizables (moto nueva, viaje, vivienda, fondo de emergencia) con monto objetivo
   - Distribución por plataforma: el usuario puede asignar valor COP o porcentaje de la meta por Colfondos, Nubank, etc.
   - Progreso calculado en backend: disponible para la meta, faltante, porcentaje, valor asignado y parte sin fuente asignada
4. **Gastos e Ingresos**:
   - Registro de movimientos con categoría (arriendo, luz, agua, mercado, transporte…)
   - Ingresos (salario, otros)
   - Vista mensual: total ingresos, total gastos, desglose por categoría (dona)
5. **Suscripciones** — recurrentes:
   - Lista: nombre, monto, día de cobro, categoría, activa/inactiva
   - Total mensual comprometido; se copian solas al gasto de cada mes
   - Ingresos fijos guiados: presets para salario y arriendo recibido cuando aún no hay recurrentes de ingreso
   - Gastos fijos en COP o USD: para USD se guarda el valor original, TRM USD/COP, margen opcional del banco y estimación COP
6. **Cierre de mes (wizard)** — la funcionalidad estrella:
   - Un flujo guiado de 3 pasos que se hace en ~2 minutos a fin de mes:
     1. Saldo final por plataforma; aportes/retiros ya vienen registrados desde `+ Aporte / retiro`
     2. Confirmar suscripciones del mes + agregar gastos variables
     3. Resumen del mes generado → guardar
7. **Configuración** — plataformas (agregar/editar/color), categorías, importar datos históricos.
8. **Nibor Música**:
   - Catálogo de canciones propias de rap
   - Estados de producción: idea, en proceso, terminada sin publicar (`lista`) y publicada
   - Artista fijo: Nibor; la UI no pide artista, BPM ni tonalidad
   - Metadata útil: estilo rap, fecha de publicación, enlace y notas
   - Gráficas de pipeline musical: publicadas, en proceso y terminadas sin publicar
   - Primer MVP en `/musica`, con API `/api/music/songs`
9. **Nibor Conocimiento**:
   - Control amplio de aprendizaje: libros, cursos, idiomas, artículos, videos y temas
   - Estados: pendiente, en progreso, pausado, completado y repasar
   - Progreso 0-100 por recurso, con idioma controlado (español/inglés), año estructurado, autor/fuente, fechas, enlace y notas
   - Primer MVP en `/conocimiento`, con API `/api/knowledge/items`
10. **Préstamos**:
   - Registro de plata prestada a personas: persona, monto, fecha de préstamo, fecha de devolución, estado y notas
   - Estados: pendiente y devuelto; la UI permite marcar devuelto cuando ya regresaron la plata
   - Resumen calculado en backend: plata pendiente, devuelta y total histórico prestado
   - Primer MVP en `/prestamos`, con API `/api/loans`
11. **Nibor Salud**:
   - Control personal de salud: medidas corporales, condiciones, medicamentos, citas médicas y visión
   - Gráfica de peso e IMC; el IMC y su categoría se calculan en backend como referencia adulta
   - Condiciones y medicamentos activos, incluyendo horario de toma; citas médicas programadas/asistidas/canceladas
   - Registro visual para miopía/astigmatismo y fórmulas por ojo
   - Primer MVP en `/salud`, con API `/api/salud`
12. **Nibor Hábitos**:
   - Seguimiento diario de hábitos personales, reemplazando la app vieja PHP/MySQL sin migrar login
   - Tarjetas de hábitos de hoy, marcar cumplimiento, posponer, ordenar y administrar frecuencia por día/días de semana
   - Progreso calculado en backend: rachas, heatmap, porcentajes semanal/mensual/trimestral/semestral/anual
   - Integración por eventos con Salud y Conocimiento: Losartán, ejercicio, higiene, lectura e inglés
   - Primer MVP en `/habitos`, con API `/api/habits` e importador desde `habitos old`
13. **Eventos**:
   - Calendario personal con eventos de todo el día o con hora/duración
   - Feed iCalendar estable para suscripción en iPhone mediante `/api/events/calendar.ics`
   - UID estable, `SEQUENCE` por edición y horario America/Bogota convertido a UTC
   - Primer MVP en `/eventos`, con API `/api/events`
14. **Vehículos**:
   - Control de carro/moto, documentos, SOAT, técnico mecánica, vencimientos y PDFs adjuntos
   - Estados de documentos calculados en backend: vigente, por vencer, vencida y por configurar
   - PDFs guardados en Cloudflare R2 con binding `FILES`; gastos integrados como `movements`
   - Cada vehículo incluye Tarjeta de propiedad como documento permanente; la licencia de conducción es independiente del vehículo, admite un PDF único y varias categorías (A1/A2/B1/B2/B3/C1/C2/C3) con vencimientos distintos
   - Primer MVP en `/vehiculos`, con API `/api/vehicles`
15. **Notificaciones**:
   - Centro in-app de notificaciones para suscripciones, hábitos, vehículos y eventos
   - Campana global con badge de no leídas; vista `/notificaciones` para bandeja y configuración general
   - Configuración contextual desde cada módulo con botón de campana: Suscripciones, Hábitos, Vehículos y Eventos
   - Push opcional al celular vía Pushover usando `pushover_user` y `pushover_token`
   - Entrega configurable por regla: push sí/no, prioridad silenciosa/normal/alta, sonido Pushover, silencio horario, pausa temporal y resumen diario
   - Hábitos permite múltiples franjas de recordatorios por días de semana, y Vehículos permite avisos programados tipo 180/90/30/15/8/3/0 días antes
   - Motor idempotente ejecutable por cron Cloudflare y por `POST /api/notifications/run`
16. **Familiar**:
   - Directorio privado y dinámico con nombre, parentesco, tipo y número de documento visibles y notas opcionales
   - Un PDF opcional por familiar, guardado en R2 privado y disponible para ver o descargar dentro de Cloudflare Access
   - Primer MVP en `/familiar`, con API `/api/family`
17. **Casa** (v2: la propiedad es el centro):
   - Varias propiedades con estado (`en_arriendo`, `propia`, `vendida`); una vendida conserva historial y documentos pero sale del registro mensual
   - Movimientos por propiedad sincronizados con Finanzas: `movements.home_property_id` para puntuales (imprevistos, ingresos extra) y `subscriptions.home_property_id` para vincular fijos (ej. arriendo recibido), que arrastran su histórico aplicado sin duplicar nada
   - Documentos PDF privados por propiedad (contratos, escrituras) en R2
   - Control mensual del pago de administración por propiedad
   - Cada cuenta mensual admite conceptos dinámicos con saldo anterior, cuota del mes y nuevo saldo; el descuento guarda porcentaje, valor, fecha límite y total descontado sin asumir que aplica a todos los conceptos
   - Historial por año con fechas de emisión/descuento/vencimiento/pago, valor pagado, mora y estado calculado en backend (`pendiente`, `pagado_con_descuento`, `pagado_sin_descuento`, `en_mora`)
   - Resumen backend de meses pagados/pendientes, con/sin descuento, en mora, descuentos ganados, moras y total pagado del año
   - Un solo PDF privado opcional por mensualidad (el usuario une cuenta de cobro + comprobante de pago en un archivo), guardado en R2 y disponible dentro de Cloudflare Access
   - MVP en `/casa`, con API `/api/home`
18. **Bansky (mascotas)**:
   - Perfil de la mascota (nombre, especie, raza, sexo, nacimiento con edad calculada en backend, color, microchip, notas)
   - Vacunas y aplicaciones con próxima dosis y estado backend (`al_dia`, `proxima` ≤30 días, `vencida`, `aplicada`)
   - Gastos integrados a `movements` en ambos sentidos: los creados desde el módulo llevan `pet_id` y categoría `Mascotas` 🐾, y los registrados en Gastos con esa categoría también cuentan para la mascota
   - MVP en `/bansky`, con API `/api/pets`
19. **Recordatorios**:
   - Tareas por recordar con frecuencia configurable: una sola vez o cada N días (diario, cada 2 días, semanal, quincenal, mensual, personalizado), con hora opcional
   - Integrados al centro de notificaciones como regla `recordatorios` (in-app + push por Pushover con prioridad/sonido configurables): avisan el día programado y repiten varias veces al día (`recordatorios_repetir_horas`, default cada 4 h, fuera del horario de silencio) mientras no se marquen hechos, incluso en días siguientes si quedan vencidos
   - Marcar "hecho" programa la siguiente vez si hay frecuencia, o completa el recordatorio si era único; también se pueden pausar/reanudar
   - MVP en `/recordatorios`, con API `/api/reminders`

## 3. Modelo de datos (D1 / SQLite semantics)

```sql
platforms        (id, nombre, color, orden, activa, tipo 'inversion'|'fondo')
                 -- tipo agregado en migración 0003: 'fondo' = ahorro obligatorio
                 -- (cesantías, pensión); suma al patrimonio pero se muestra aparte
snapshots        (id, platform_id, anio, mes, saldo_inicial, aporte, retiros, saldo_final)
                 -- UNIQUE(platform_id, anio, mes). saldo_final NULL = mes pendiente
categories       (id, nombre, tipo 'gasto'|'ingreso', icono, color)
movements        (id, fecha, tipo 'gasto'|'ingreso', categoria_id, descripcion, monto, subscription_id NULL, vehicle_id NULL, pet_id NULL)
                 -- vehicle_id agregado en migración 0017 para gastos de vehículos integrados a finanzas
                 -- pet_id agregado en migración 0027 para gastos de mascotas integrados a finanzas
subscriptions    (id, nombre, monto, moneda, monto_original, tasa_cambio, margen_tasa_pct, tasa_cambio_fecha, dia_cobro, categoria_id, activa, tipo 'gasto'|'ingreso', automatica, card_id)
                 -- tipo agregado en migración 0002: recurrentes de ingreso (salario, arriendo recibido)
                 -- moneda/cambio agregados en migración 0006: monto queda como COP estimado
                 -- USD usa monto_original * TRM * (1 + margen_tasa_pct/100); al aplicar se usa TRM vigente si está disponible
                 -- automatica agregado en migración 0009: 1 = débito automático, 0 = pago manual con recordatorio
                 -- card_id agregado en migración 0010: enlaza un fijo de gasto con una tarjeta identificada por nombre
cards            (id, nombre, color, activa)
                 -- solo nombres identificadores; nunca números, vencimientos, CVV ni datos sensibles
goals            (id, nombre, monto_objetivo, activa, created_at)
goal_allocations (id, goal_id, platform_id, porcentaje, monto_asignado)
                 -- la UI permite digitar porcentaje o valor COP; backend guarda ambos normalizados
                 -- monto_asignado = valor COP esperado desde esa plataforma
                 -- porcentaje = proporción equivalente sobre monto_objetivo
music_songs      (id, titulo, artista, estado, genero, bpm, tonalidad, fecha_publicacion, enlace, notas, created_at, updated_at)
                 -- estado: 'idea'|'proceso'|'lista'|'publicada'
                 -- 'lista' se muestra en UI como terminada sin publicar
                 -- artista se normaliza a 'Nibor'; bpm y tonalidad quedan heredados del esquema pero no se usan en la UI
                 -- agregado en migración 0007_music.sql para Nibor Música
knowledge_items  (id, titulo, tipo, estado, idioma, anio, area, autor, progreso, fecha_inicio, fecha_fin, enlace, notas, created_at, updated_at)
                 -- tipo: 'libro'|'curso'|'idioma'|'articulo'|'video'|'tema'|'otro'
                 -- estado: 'pendiente'|'progreso'|'pausado'|'completado'|'repasar'
                 -- idioma: 'espanol'|'ingles' agregado en migración 0011_knowledge_language.sql
                 -- anio agregado en migración 0012_knowledge_year.sql para métricas por año
                 -- agregado en migración 0008_knowledge.sql para Nibor Conocimiento
loans            (id, persona, monto, fecha_prestamo, fecha_devolucion, estado, notas, created_at, updated_at)
                 -- estado: 'pendiente'|'devuelto'
                 -- agregado en migración 0013_loans_and_travel_platform.sql para plata prestada a personas
health_profile   (id, estatura_cm, fecha_nacimiento, sexo, notas, updated_at)
health_measurements (id, fecha, peso_kg, estatura_cm, notas, created_at, updated_at)
health_conditions (id, nombre, tipo, estado, fecha_diagnostico, notas, created_at, updated_at)
health_medications (id, condition_id, nombre, dosis, frecuencia, hora, activa, notas, created_at, updated_at)
health_appointments (id, fecha_hora, especialidad, profesional, lugar, motivo, estado, notas, created_at, updated_at)
health_vision_prescriptions (id, fecha, ojo_derecho_esfera, ojo_derecho_cilindro, ojo_derecho_eje, ojo_izquierdo_esfera, ojo_izquierdo_cilindro, ojo_izquierdo_eje, notas, created_at, updated_at)
                 -- agregado en migración 0014_health.sql para Nibor Salud
habits           (id, old_id, name, description, emoji, color, sort_index, target_per_day, is_active, start_date, end_date, created_at, updated_at)
habit_schedule   (habit_id, day_of_week)
habit_events     (id, old_event_id, habit_id, event_time, source, note, created_at)
habit_defer      (habit_id, day_date, defer_rank, updated_at)
habit_links      (id, habit_id, module, behavior, target_id, target_label, created_at, updated_at)
                 -- agregado en migración 0015_habits.sql para Nibor Hábitos; old_id/old_event_id hacen idempotente la migración desde la app vieja
events           (id, titulo, descripcion, fecha, hora, duracion_min, lugar, recordatorio_min, uid, created_at, updated_at)
                 -- agregado en migración 0016_events.sql; uid UNIQUE estable para feeds iCalendar
vehicles         (id, nombre, tipo, placa, color, activa, created_at, updated_at)
vehicle_items    (id, vehicle_id, nombre, vence, notas, file_key, file_name, file_size, created_at, updated_at)
                 -- agregado en migración 0017; archivos PDF viven en R2 con binding FILES
driver_licenses  (id, file_key, file_name, file_size, notas, created_at, updated_at)
driver_license_categories (id, license_id, categoria, vence, notas, created_at, updated_at)
                 -- agregado en migración 0023; un PDF de licencia y vencimiento independiente por categoría
notifications    (id, tipo, titulo, mensaje, fecha, dedupe_key, leida, push_enviada, prioridad, sonido, created_at)
notification_settings (clave, valor, updated_at)
family_members   (id, nombre, parentesco, tipo_documento, numero_documento, telefono, direccion, notas, file_key, file_name, file_size, created_at, updated_at)
                 -- agregado en migración 0022; datos sensibles en D1 y PDF privado en R2, nunca en seeds/migraciones
                 -- telefono/direccion opcionales agregados en migración 0026
                 -- agregado en migración 0018 y ampliado en 0019/0020/0021; settings incluye push/prioridad/sonido por regla, silencio, pausa, resumen diario, franjas de hábitos por días y programación de vehículos
home_properties  (id, nombre, estado 'en_arriendo'|'propia'|'vendida', notas, activa, created_at, updated_at)
                 -- estado agregado en migración 0032; movements.home_property_id y
                 -- subscriptions.home_property_id vinculan finanzas a la propiedad
home_property_documents (id, property_id, nombre, file_key, file_name, file_size)
                 -- agregado en migración 0032: PDFs privados en R2 (`casa/{id}/docs/…`)
home_administration_periods (id, property_id, anio, mes, fecha_emision, numero_cuenta, fecha_limite_descuento, fecha_vencimiento, descuento_pct, descuento_valor, total_con_descuento, fecha_pago, valor_pagado, mora_cobrada, notas, file_key, file_name, file_size, created_at, updated_at)
                 -- UNIQUE(property_id, anio, mes); un solo PDF por mes (cuenta + comprobante unidos) en R2
reminders        (id, titulo, notas, frecuencia_dias NULL=único, repetir_horas NULL=general, proxima_fecha, hora, activo, completado_en)
                 -- agregado en migración 0028 para Nibor Recordatorios; los avisos los genera
                 -- la regla 'recordatorios' del motor varias veces al día con dedupe
                 -- `rec:{id}:{fecha}:{franja}` (franja = repetir_horas propio del recordatorio,
                 -- migración 0030, o el general recordatorios_repetir_horas, seed 0029)
pets             (id, nombre, especie 'perro'|'gato'|'otro', raza, sexo, fecha_nacimiento, color, microchip, notas, activa)
pet_vaccines     (id, pet_id, nombre, fecha, proxima_dosis, veterinaria, notas)
pet_documents    (id, pet_id, nombre, file_key, file_name, file_size)
                 -- agregado en migración 0027 para Nibor Bansky; movements.pet_id enlaza gastos
                 -- y la categoría seed 'Mascotas' 🐾 sincroniza los registrados desde Gastos
                 -- pet_documents agregado en migración 0031: PDFs privados en R2 (`pets/{id}/docs/…`)
home_administration_items (id, period_id, concepto, saldo_anterior, cuota_mes, nuevo_saldo, aplica_descuento, orden)
                 -- agregado en migración 0024 para Nibor Casa; totales y estado se calculan SOLO en backend
                 -- aplica_descuento agregado en migración 0025: el % de descuento del periodo
                 -- solo se deriva de la cuota del mes de los conceptos marcados (ej. Administración
                 -- y Retroactivo sí, Parqueadero no); valor/total digitados manualmente siempre mandan
```

**Fórmulas (calculadas en el backend, una sola fuente de verdad):**
- `saldo_total_inicial = saldo_inicial + aporte`
- `ganancia = saldo_final + retiros − saldo_total_inicial`
- `rentabilidad = ganancia / saldo_total_inicial` (si saldo_total_inicial > 0)
- `saldo_inicial` del mes N = `saldo_final` del mes N−1 (auto, editable la primera vez)
- `imc = peso_kg / (estatura_m * estatura_m)`; categoría adulta calculada en backend: bajo peso, peso saludable, sobrepeso u obesidad por clase
- Todas las fechas de entrada deben existir realmente en calendario; no basta con coincidir con el formato `YYYY-MM-DD`.

**Agregados de API:**
- `GET /api/snapshots?anio=` devuelve `consolidated` y `consolidated_by_tipo` (`inversion`, `fondo`) para que la UI no recalcule totales ni rentabilidades.
- `GET /api/goals` devuelve metas enriquecidas con `monto_asignado`, `porcentaje_asignado`, `monto_actual`, `monto_faltante`, `progreso`, `monto_sin_asignar` y detalle por plataforma.
- `GET /api/exchange-rates/usd-cop` consulta la TRM vigente para estimar suscripciones en USD; si falla al aplicar recurrentes, se usa la tasa guardada en la suscripción.
- `GET /api/subscriptions/reminders?anio=&mes=` devuelve pagos manuales activos sin movimiento aplicado en el mes.
- `GET /api/subscriptions/history?anio=` devuelve histórico anual de fijos construido desde `movements.subscription_id` y un `resumen` backend con total de ingresos, gastos y balance del año.
- `GET/POST/PUT/DELETE /api/cards` administra tarjetas por nombre/color y bloquea nombres con números largos.
- `GET/POST/PUT/DELETE /api/music/songs` administra el catálogo de canciones de Nibor Música y devuelve conteos por estado.
- `GET/POST/PUT/DELETE /api/knowledge/items` administra recursos de aprendizaje y devuelve conteos por estado, tipo, idioma y año; `GET` acepta filtros `idioma=espanol|ingles` y `anio=YYYY`.
- `GET/POST/PUT/DELETE /api/loans` administra préstamos personales y devuelve resumen calculado; `POST /api/loans/:id/return` marca un préstamo como devuelto.
- `GET /api/salud` devuelve perfil, medidas, condiciones, medicamentos, citas, visión y resumen calculado; subrutas REST: `/profile`, `/measurements`, `/conditions`, `/medications`, `/appointments`, `/vision`.
- `GET/POST/PUT/DELETE /api/habits` administra hábitos; subrutas: `/today`, `/:id/check`, `/:id/defer`, `/reorder`, `/progress`, `/activity?module=salud|knowledge`. La migración vieja se ejecuta con `npm run habits:import:local`.
- `GET/POST/PUT/DELETE /api/events` administra eventos; `GET /api/events/calendar-url` entrega la URL privada al usuario autenticado y `GET /api/events/calendar.ics?token=` expone el feed iCalendar solo con el token secreto correcto.
- `GET/POST/PUT/DELETE /api/vehicles` administra vehículos; subrutas para documentos, PDF en R2 y gastos: `/items`, `/items/:id/file`, `/:id/gastos`. `/license`, `/license/categories` y `/license/file` administran la licencia de conducción y sus categorías con vencimientos independientes.
- `/api/widget` es la API para widgets externos (Widgy, Shortcuts) protegida por el secreto `WIDGET_TOKEN` (?token=; sin token → 404): `GET /habits` devuelve hábitos pendientes de hoy con `text` preformateado, `resumen` y `pendientes`; `GET /url` (detrás de Access) entrega la URL con token al usuario autenticado. En Access solo la ruta exacta `/api/widget/habits` tiene bypass.
- `GET /api/notifications` lista notificaciones y `no_leidas`; acepta `fecha=YYYY-MM-DD` para un día exacto o `desde=YYYY-MM-DD` para un rango reciente. Subrutas: `/run`, `/:id/read`, `/read-all`, `/settings`, `/test-push`. `POST /api/notifications/run` acepta `hora`/`minuto`/`fecha` opcionales para smoke y devuelve `push_enviadas`, `push_retenidas`, `en_silencio` y `pausado`.
- `GET/POST/PUT/DELETE /api/family` administra familiares; `POST/GET/DELETE /api/family/:id/file` guarda, muestra/descarga y elimina el PDF privado en R2.
- `/api/reminders` administra Recordatorios: `GET/POST/PUT/DELETE /` con estado backend (`hoy`, `vencido`, `programado`, `pausado`, `completado`) y `POST /:id/complete` (con frecuencia reprograma `proxima_fecha`; único queda completado). La regla `recordatorios` del motor de notificaciones usa las claves `regla/push/prioridad/sonido_recordatorios`.
- `/api/pets` administra Nibor Bansky: `GET/POST/PUT/DELETE /` para mascotas (delete bloqueado con gastos; limpia R2 en cascada), `GET /:id` con vacunas (estado backend), documentos y gastos sincronizados (`pet_id` O categoría `Mascotas`) + resumen total/año/mes, `POST /:id/vaccines`, `PUT/DELETE /vaccines/:id`, `POST /:id/gastos` que inserta movements normales visibles en Gastos, `PUT /gastos/:movementId` que edita fecha/monto/concepto conservando pet_id/categoría (y el prefijo del nombre), y documentos PDF en R2: `POST /:id/documents` (binario + `x-file-name`), `GET /documents/:id/file` (inline/download, `no-store`), `PUT /documents/:id` (renombrar) y `DELETE /documents/:id`.
- `/api/home` administra Nibor Casa: `GET/POST/PUT/DELETE /properties` (con `estado`; delete bloqueado con historial o movimientos vinculados, limpia R2 y desvincula fijos en cascada), `GET /properties/:id` (documentos + fijos + movimientos sincronizados con `resumen` backend de ingresos/gastos/balance), `PUT /properties/:id/subscriptions` (vincular fijos), `POST /properties/:id/movements` (movement normal vinculado, visible en Gastos), documentos PDF de propiedad (`POST /properties/:id/documents`, `GET /documents/:id/file`, `PUT/DELETE /documents/:id`), `GET /periods?property_id=&anio=&estado=` (periodos enriquecidos con totales/estado + `resumen` + `anios`), `GET /periods/template` (sugiere el mes siguiente arrastrando conceptos, saldo anterior —0 si el último mes quedó pagado—, descuento %/valor y fechas límite/vencimiento corridas al mismo día del mes), `POST/PUT/DELETE /periods/:id`, `PUT/DELETE /periods/:id/payment` para el pago separado y `POST/GET/DELETE /periods/:id/file` para el PDF único del mes en R2 con `no-store`. El backend deriva `descuento_valor_calculado` y `total_con_descuento_calculado` cuando solo hay porcentaje; los valores digitados manualmente siempre tienen prioridad.

## 4. Fases de trabajo

| Fase | Contenido | Responsable |
|---|---|---|
| 0 | Scaffold: Vite+Vue+Tailwind, Cloudflare Worker/Hono, D1, migración inicial, layout base con sidebar | Claude |
| 1 | API REST completa sobre D1 (plataformas, snapshots, movimientos, suscripciones, resumen) | Codex |
| 2 | Módulo Inversiones (tablas mensuales, edición inline) | Codex |
| 3 | Dashboard con gráficas ECharts | Claude |
| 4 | Gastos, Ingresos y Suscripciones (CRUD + vistas) | Codex |
| 5 | Wizard de cierre de mes | Claude |
| 6 | Importador de datos históricos del Excel + pulido (dark mode, vacíos, errores) | Claude + Codex |
| 7 | Nibor Música MVP: catálogo de canciones y estados de producción | Codex |
| 8 | Nibor Conocimiento MVP: libros, cursos, idiomas y progreso de aprendizaje | Codex |
| 9 | Préstamos personales y ahorro Viajes | Codex |
| 10 | Nibor Salud MVP: medidas, IMC, condiciones, medicamentos, citas y visión | Codex |
| 11 | Nibor Hábitos MVP: seguimiento diario, progreso, integraciones e importador old | Codex |
| 12 | Eventos MVP: calendario personal e iCalendar | Claude |
| 13 | Vehículos MVP: documentos, R2 y gastos integrados | Claude |
| 14 | Notificaciones: backend/cron por Claude, campana/vista/config/smoke/docs por Codex | Claude + Codex |
| 15 | Familiar MVP: directorio, documentos visibles y PDFs privados en R2 | Codex |
| 16 | Casa MVP: administración mensual por conceptos, pagos, descuento/mora y PDF privado en R2 | Codex (plan) + Claude (implementación) |
| 17 | Bansky MVP: perfil de mascota, vacunas y gastos sincronizados con movements | Claude |
| 18 | Recordatorios: tareas con frecuencia configurable integradas al centro de notificaciones | Claude |

Detalle de tareas: `TAREAS_CLAUDE.md` y `TAREAS_CODEX.md` en esta carpeta.
Reglas compartidas: `CONVENCIONES.md`. **Ambos agentes deben leer CONVENCIONES.md antes de escribir código.**
Estado compartido de avance: `ESTADO.md`.

## 5. Flujo de trabajo entre agentes

- Cada tarea es un checkbox en su archivo `TAREAS_*.md`. Al terminar una tarea, el agente la marca `[x]` y anota debajo cualquier decisión relevante.
- Además, cada agente actualiza `ESTADO.md` cuando completa una fase, queda bloqueado o cambia el siguiente paso.
- Claude hace la Fase 0 primero (Codex no arranca hasta que exista el scaffold).
- Si una tarea de Codex está bloqueada por algo de Claude (o viceversa), se anota en la sección "Bloqueos" del archivo de tareas.
- El usuario revisa la app con `npm run dev` al final de cada fase.
