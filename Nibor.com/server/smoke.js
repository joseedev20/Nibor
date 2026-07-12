const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8787/api'
const smokeYear = 2099
const notificationSmokeDate = '2000-01-03'
const notificationSmokeRunId = Date.now()
const now = new Date()
const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(json)}`)
  }

  return json.data
}

function post(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) })
}

function put(path, body) {
  return request(path, { method: 'PUT', body: JSON.stringify(body) })
}

function del(path) {
  return request(path, { method: 'DELETE' })
}

async function expectFailure(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}
  if (response.ok) throw new Error(`${options.method ?? 'GET'} ${path} debio fallar`)
  return json
}

async function cleanupSmokeData(platformId) {
  const habits = await request('/habits?include_inactive=1')
  for (const habit of habits.habits.filter((entry) => String(entry.name).startsWith('Smoke '))) {
    await del(`/habits/${habit.id}`)
  }

  const healthData = await request('/salud')
  for (const medication of healthData.medications.filter((entry) => String(entry.nombre).startsWith('Smoke '))) {
    await del(`/salud/medications/${medication.id}`)
  }
  for (const appointment of healthData.appointments.filter((entry) => String(entry.especialidad).startsWith('Smoke '))) {
    await del(`/salud/appointments/${appointment.id}`)
  }
  for (const vision of healthData.vision.filter((entry) => String(entry.notas ?? '').startsWith('Smoke '))) {
    await del(`/salud/vision/${vision.id}`)
  }
  for (const condition of healthData.conditions.filter((entry) => String(entry.nombre).startsWith('Smoke '))) {
    await del(`/salud/conditions/${condition.id}`)
  }
  for (const measurement of healthData.measurements.filter((entry) => String(entry.notas ?? '').startsWith('Smoke '))) {
    await del(`/salud/measurements/${measurement.id}`)
  }

  const loans = await request('/loans')
  for (const loan of loans.loans.filter((entry) => String(entry.persona).startsWith('Smoke '))) {
    await del(`/loans/${loan.id}`)
  }

  const knowledge = await request('/knowledge/items')
  for (const item of knowledge.items.filter((entry) => String(entry.titulo).startsWith('Smoke '))) {
    await del(`/knowledge/items/${item.id}`)
  }

  const music = await request('/music/songs')
  for (const song of music.songs.filter((item) => String(item.titulo).startsWith('Smoke '))) {
    await del(`/music/songs/${song.id}`)
  }

  const events = await request('/events')
  for (const event of events.filter((item) => String(item.titulo).startsWith('Smoke '))) {
    await del(`/events/${event.id}`)
  }

  const movements = await request(`/movements?anio=${smokeYear}`)
  for (const movement of movements) {
    await del(`/movements/${movement.id}`)
  }

  const vehicles = await request('/vehicles')
  for (const vehicle of vehicles.filter((item) => String(item.nombre).startsWith('Smoke '))) {
    await del(`/vehicles/${vehicle.id}`)
  }

  const goals = await request('/goals')
  for (const goal of goals.goals.filter((item) => String(item.nombre).startsWith('Smoke '))) {
    await del(`/goals/${goal.id}`)
  }

  const subscriptions = await request('/subscriptions')
  for (const subscription of subscriptions.filter((item) => String(item.nombre).startsWith('Smoke '))) {
    await del(`/subscriptions/${subscription.id}`)
  }

  const cards = await request('/cards')
  for (const card of cards.filter((item) => String(item.nombre).startsWith('Smoke '))) {
    await del(`/cards/${card.id}`)
  }

  const snapshots = await request(`/snapshots?anio=${smokeYear}`)
  const platform = snapshots.platforms.find((item) => item.id === platformId)
  if (!platform) return

  for (const snapshot of platform.snapshots.filter((item) => item.id && [1, 2, 3].includes(item.mes))) {
    await del(`/snapshots/${snapshot.id}`)
  }
}

async function run() {
  console.log(`Smoke base URL: ${baseUrl}`)

  const health = await request('/health')
  console.log('health:', health.status)

  const platforms = await request('/platforms')
  if (!platforms.length) throw new Error('No hay plataformas seed')
  if (!platforms.some((item) => item.nombre === 'Viajes' && item.tipo === 'inversion')) {
    throw new Error('No existe la plataforma de ahorro Viajes')
  }
  const platform = platforms[0]

  const categories = await request('/categories')
  const expenseCategory = categories.find((category) => category.tipo === 'gasto')
  const incomeCategory = categories.find((category) => category.tipo === 'ingreso')
  if (!expenseCategory || !incomeCategory) throw new Error('No hay categorías seed suficientes')

  const impossibleMovementDate = await expectFailure('/movements', {
    method: 'POST',
    body: JSON.stringify({
      fecha: `${smokeYear}-02-30`,
      tipo: 'gasto',
      categoria_id: expenseCategory.id,
      descripcion: 'Smoke fecha imposible',
      monto: 1,
    }),
  })
  if (!String(impossibleMovementDate.error ?? '').includes('fecha')) {
    throw new Error('Movimientos no rechazaron una fecha imposible')
  }

  const impossibleAppointmentDate = await expectFailure('/salud/appointments', {
    method: 'POST',
    body: JSON.stringify({
      fecha_hora: `${smokeYear}-02-30T24:00`,
      especialidad: 'Smoke fecha imposible',
      estado: 'programada',
    }),
  })
  if (!String(impossibleAppointmentDate.error ?? '').includes('fecha')) {
    throw new Error('Salud no rechazo una fecha/hora imposible')
  }

  await cleanupSmokeData(platform.id)

  const january = await post('/snapshots', {
    platform_id: platform.id,
    anio: smokeYear,
    mes: 1,
    saldo_inicial: 1000,
    aporte: 100,
    retiros: 0,
    saldo_final: 1200,
  })
  if (january.ganancia !== 100) throw new Error(`Ganancia enero inesperada: ${january.ganancia}`)

  const february = await post('/snapshots', {
    platform_id: platform.id,
    anio: smokeYear,
    mes: 2,
    aporte: 0,
    retiros: 0,
    saldo_final: 1300,
  })
  if (february.saldo_inicial !== 1200) throw new Error(`Saldo inicial febrero inesperado: ${february.saldo_inicial}`)

  const editedFebruary = await put(`/snapshots/${february.id}`, { saldo_final: 1325 })
  if (editedFebruary.ganancia !== 125) throw new Error(`Ganancia febrero editada inesperada: ${editedFebruary.ganancia}`)

  const expense = await post('/movements', {
    fecha: `${smokeYear}-01-15`,
    tipo: 'gasto',
    categoria_id: expenseCategory.id,
    descripcion: 'Smoke gasto',
    monto: 250,
  })

  const income = await post('/movements', {
    fecha: `${smokeYear}-01-16`,
    tipo: 'ingreso',
    categoria_id: incomeCategory.id,
    descripcion: 'Smoke ingreso',
    monto: 1000,
  })

  const invalidCard = await expectFailure('/cards', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Smoke 123456',
      color: '#2563eb',
    }),
  })
  if (!invalidCard.error) throw new Error('Validacion de tarjeta sensible no devolvio error')

  const card = await post('/cards', {
    nombre: 'Smoke tarjeta prueba',
    color: '#2563eb',
    activa: true,
  })
  if (!card.id) throw new Error('No se creo tarjeta smoke')

  const editedCard = await put(`/cards/${card.id}`, { nombre: `${card.nombre} editada`, color: '#059669' })
  if (editedCard.color !== '#059669') throw new Error(`Color de tarjeta inesperado: ${editedCard.color}`)

  const subscription = await post('/subscriptions', {
    nombre: `Smoke suscripcion ${Date.now()}`,
    monto: 99,
    dia_cobro: 28,
    categoria_id: expenseCategory.id,
    activa: true,
    tipo: 'gasto',
    card_id: card.id,
  })

  const cards = await request('/cards')
  const cardSummary = cards.find((item) => item.id === card.id)
  if (!cardSummary || cardSummary.suscripciones < 1) throw new Error('Tarjeta smoke no contabilizo fijo asociado')
  if (cardSummary.total_mensual < 99) throw new Error(`Total mensual de tarjeta inesperado: ${cardSummary?.total_mensual}`)

  const incomeSubscription = await post('/subscriptions', {
    nombre: `Smoke ingreso fijo ${Date.now()}`,
    monto: 500,
    dia_cobro: 5,
    categoria_id: incomeCategory.id,
    activa: true,
    tipo: 'ingreso',
  })

  const usdSubscription = await post('/subscriptions', {
    nombre: `Smoke USD ${Date.now()}`,
    moneda: 'USD',
    monto_original: 20,
    tasa_cambio: 4000,
    margen_tasa_pct: 2,
    dia_cobro: 16,
    categoria_id: expenseCategory.id,
    activa: false,
    tipo: 'gasto',
  })
  if (usdSubscription.monto !== 81600) throw new Error(`Estimado USD inesperado: ${usdSubscription.monto}`)
  if (usdSubscription.moneda !== 'USD') throw new Error('Suscripcion USD no guardo moneda')

  const applied = await post(`/subscriptions/apply?anio=${smokeYear}&mes=1`, {})
  const summary = await request(`/summary?anio=${smokeYear}&mes=1`)
  if (!applied.created.some((item) => item.subscription_id === incomeSubscription.id)) {
    throw new Error('No se aplico el ingreso fijo smoke')
  }
  if (summary.movimientos.total_ingresos < 1500) throw new Error('Resumen no incluyo ingresos recurrentes smoke')
  if (summary.movimientos.tasa_ahorro === null) throw new Error('Resumen no calculo tasa de ahorro con ingresos recurrentes')

  const closed = await post('/close-month', {
    anio: smokeYear,
    mes: 3,
    snapshots: [
      {
        platform_id: platform.id,
        aporte: 25,
        retiros: 5,
        saldo_final: 1400,
      },
    ],
    movimientos: [
      {
        fecha: `${smokeYear}-03-05`,
        tipo: 'ingreso',
        categoria_id: incomeCategory.id,
        descripcion: 'Smoke cierre ingreso',
        monto: 300,
      },
    ],
    aplicar_suscripciones: true,
  })

  if (closed.ganancia_mes !== 55) throw new Error(`Ganancia cierre inesperada: ${closed.ganancia_mes}`)
  if (closed.movimientos.total_ingresos < 300) throw new Error('Cierre no incluyó movimientos manuales')

  const goal = await post('/goals', {
    nombre: `Smoke meta ${Date.now()}`,
    monto_objetivo: 1000,
    activa: true,
    allocations: [
      { platform_id: platform.id, monto_asignado: 1000 },
    ],
  })
  if (goal.progreso !== 1) throw new Error(`Progreso de meta inesperado: ${goal.progreso}`)
  if (goal.monto_faltante !== 0) throw new Error(`Faltante de meta inesperado: ${goal.monto_faltante}`)

  const percentGoal = await post('/goals', {
    nombre: `Smoke meta porcentaje ${Date.now()}`,
    monto_objetivo: 1000,
    activa: true,
    allocations: [
      { platform_id: platform.id, porcentaje: 50 },
    ],
  })
  if (percentGoal.monto_asignado !== 500) throw new Error(`Monto asignado por porcentaje inesperado: ${percentGoal.monto_asignado}`)
  if (percentGoal.porcentaje_asignado !== 50) throw new Error(`Porcentaje asignado inesperado: ${percentGoal.porcentaje_asignado}`)
  if (percentGoal.progreso !== 0.5) throw new Error(`Progreso por porcentaje inesperado: ${percentGoal.progreso}`)

  const song = await post('/music/songs', {
    titulo: `Smoke cancion ${Date.now()}`,
    estado: 'proceso',
    genero: 'Rap',
    notas: 'Idea inicial smoke',
  })
  if (song.estado !== 'proceso') throw new Error(`Estado de cancion inesperado: ${song.estado}`)
  if (song.artista !== 'Nibor') throw new Error(`Artista de cancion inesperado: ${song.artista}`)
  if (song.genero !== 'Rap') throw new Error(`Genero de cancion inesperado: ${song.genero}`)

  const editedSong = await put(`/music/songs/${song.id}`, {
    estado: 'publicada',
    fecha_publicacion: `${smokeYear}-04-01`,
    enlace: 'https://example.com/smoke',
  })
  if (editedSong.estado !== 'publicada') throw new Error(`Edicion de cancion inesperada: ${editedSong.estado}`)

  const music = await request('/music/songs')
  if (music.counts.publicada < 1) throw new Error('Conteo de canciones publicadas no incluyo smoke')

  const knowledgeItem = await post('/knowledge/items', {
    titulo: `Smoke libro ${Date.now()}`,
    tipo: 'libro',
    estado: 'progreso',
    idioma: 'ingles',
    area: 'Inglés',
    anio: smokeYear,
    autor: 'Nibor',
    progreso: 35,
    fecha_inicio: `${smokeYear}-04-01`,
    notas: 'Lectura inicial smoke',
  })
  if (knowledgeItem.estado !== 'progreso') throw new Error(`Estado de conocimiento inesperado: ${knowledgeItem.estado}`)
  if (knowledgeItem.idioma !== 'ingles') throw new Error(`Idioma de conocimiento inesperado: ${knowledgeItem.idioma}`)
  if (knowledgeItem.anio !== smokeYear) throw new Error(`Anio de conocimiento inesperado: ${knowledgeItem.anio}`)
  if (knowledgeItem.progreso !== 35) throw new Error(`Progreso de conocimiento inesperado: ${knowledgeItem.progreso}`)

  const invalidKnowledgeLanguage = await expectFailure('/knowledge/items', {
    method: 'POST',
    body: JSON.stringify({
      titulo: `Smoke idioma invalido ${Date.now()}`,
      tipo: 'libro',
      estado: 'pendiente',
      idioma: 'frances',
      progreso: 0,
    }),
  })
  if (!String(invalidKnowledgeLanguage.error ?? '').includes('idioma')) {
    throw new Error('Validacion de idioma de conocimiento no devolvio el error esperado')
  }

  const invalidKnowledgeYear = await expectFailure('/knowledge/items', {
    method: 'POST',
    body: JSON.stringify({
      titulo: `Smoke anio invalido ${Date.now()}`,
      tipo: 'libro',
      estado: 'pendiente',
      idioma: 'espanol',
      anio: 1800,
      progreso: 0,
    }),
  })
  if (!String(invalidKnowledgeYear.error ?? '').includes('anio')) {
    throw new Error('Validacion de anio de conocimiento no devolvio el error esperado')
  }

  const editedKnowledgeItem = await put(`/knowledge/items/${knowledgeItem.id}`, {
    estado: 'completado',
    fecha_fin: `${smokeYear}-04-20`,
    enlace: 'https://example.com/knowledge',
  })
  if (editedKnowledgeItem.estado !== 'completado') throw new Error(`Edicion de conocimiento inesperada: ${editedKnowledgeItem.estado}`)
  if (editedKnowledgeItem.progreso !== 100) throw new Error(`Progreso completado inesperado: ${editedKnowledgeItem.progreso}`)

  const knowledge = await request('/knowledge/items')
  if (knowledge.counts.by_estado.completado < 1) throw new Error('Conteo de conocimiento completado no incluyo smoke')
  if (knowledge.counts.by_idioma.ingles < 1) throw new Error('Conteo de conocimiento en ingles no incluyo smoke')
  if (knowledge.counts.by_anio[smokeYear] < 1) throw new Error('Conteo de conocimiento por anio no incluyo smoke')

  const knowledgeByYear = await request(`/knowledge/items?anio=${smokeYear}`)
  if (!knowledgeByYear.items.some((item) => item.id === knowledgeItem.id)) throw new Error('Filtro de conocimiento por anio no incluyo smoke')

  const habitsBeforeSmoke = await request('/habits?include_inactive=1')
  if (!Array.isArray(habitsBeforeSmoke.habits) || !habitsBeforeSmoke.summary) {
    throw new Error('Contrato base de habitos no devolvio lista y resumen')
  }
  if (
    Number(habitsBeforeSmoke.summary.imported_habits ?? 0) < 0
    || Number(habitsBeforeSmoke.summary.imported_events ?? 0) < 0
  ) {
    throw new Error('Resumen de importacion de habitos devolvio conteos invalidos')
  }

  const smokeHabit = await post('/habits', {
    name: `Smoke habito salud ${Date.now()}`,
    target_per_day: 2,
    color: '#10b981',
    start_date: '2000-01-01',
    days: [],
    links: [
      { module: 'salud', behavior: 'exercise_done', target_label: 'Smoke ejercicio' },
    ],
  })
  if (!smokeHabit.id || smokeHabit.target_per_day !== 2) throw new Error('No se creo habito smoke de salud')

  const smokeKnowledgeHabit = await post('/habits', {
    name: `Smoke habito lectura ${Date.now()}`,
    target_per_day: 1,
    color: '#2563eb',
    start_date: '2000-01-01',
    days: [],
    links: [
      { module: 'knowledge', behavior: 'reading_done', target_label: 'Smoke lectura' },
    ],
  })
  if (!smokeKnowledgeHabit.links.some((link) => link.module === 'knowledge')) {
    throw new Error('No se creo link de conocimiento en habito smoke')
  }

  const firstCheck = await post(`/habits/${smokeHabit.id}/check`, {
    event_time: `${smokeYear}-07-01 08:00:00`,
  })
  if (firstCheck.met !== false || firstCheck.done_today !== 1 || firstCheck.deferred !== true) {
    throw new Error('Primer check de habito smoke no pospuso correctamente')
  }

  const todayAfterFirstCheck = await request(`/habits/today?date=${smokeYear}-07-01`)
  const pendingSmoke = todayAfterFirstCheck.habits.find((habit) => habit.id === smokeHabit.id)
  if (!pendingSmoke || pendingSmoke.remaining_today !== 1) {
    throw new Error('Habito smoke no siguio pendiente despues del primer check')
  }

  const secondCheck = await post(`/habits/${smokeHabit.id}/check`, {
    event_time: `${smokeYear}-07-01 09:00:00`,
  })
  if (secondCheck.met !== true || secondCheck.done_today !== 2) {
    throw new Error('Segundo check de habito smoke no completo la meta diaria')
  }

  const knowledgeCheck = await post(`/habits/${smokeKnowledgeHabit.id}/check`, {
    event_time: `${smokeYear}-07-01 10:00:00`,
  })
  if (knowledgeCheck.met !== true) throw new Error('Check de habito de conocimiento no completo')

  const todayAfterSecondCheck = await request(`/habits/today?date=${smokeYear}-07-01`)
  if (todayAfterSecondCheck.habits.some((habit) => habit.id === smokeHabit.id)) {
    throw new Error('Habito smoke completo siguio apareciendo en hoy')
  }

  const deferred = await post(`/habits/${smokeKnowledgeHabit.id}/defer`, { date: `${smokeYear}-07-02` })
  if (deferred.defer_rank < 1) throw new Error('Defer de habito smoke no devolvio rank')

  const reordered = await post('/habits/reorder', { order: [smokeKnowledgeHabit.id, smokeHabit.id] })
  if (reordered.order[0] !== smokeKnowledgeHabit.id) throw new Error('Reordenamiento de habitos no respeto el payload')

  const progress = await request(`/habits/progress?date=${smokeYear}-07-01`)
  const progressSmoke = progress.items.find((habit) => habit.id === smokeHabit.id)
  if (!progressSmoke || progressSmoke.done_today !== 2 || progressSmoke.heatmap.length !== 182) {
    throw new Error('Progreso de habito smoke no incluyo conteos/heatmap')
  }
  if (progress.daily.length !== 182 || progress.weekly_series.length !== 12) {
    throw new Error('Progreso global de habitos no incluyo series diaria/semanal')
  }

  const healthHabitActivity = await request(`/habits/activity?module=salud&behavior=exercise_done&from=${smokeYear}-07-01&to=${smokeYear}-07-01`)
  if (!healthHabitActivity.events.some((event) => event.habit_id === smokeHabit.id)) {
    throw new Error('Actividad de salud no incluyo habito smoke')
  }

  const knowledgeHabitActivity = await request(`/habits/activity?module=knowledge&behavior=reading_done&from=${smokeYear}-07-01&to=${smokeYear}-07-01`)
  if (!knowledgeHabitActivity.events.some((event) => event.habit_id === smokeKnowledgeHabit.id)) {
    throw new Error('Actividad de conocimiento no incluyo habito smoke')
  }

  const loan = await post('/loans', {
    persona: `Smoke prestamo ${Date.now()}`,
    monto: 123456,
    fecha_prestamo: `${smokeYear}-05-01`,
    notas: 'Prestamo smoke',
  })
  if (loan.estado !== 'pendiente') throw new Error(`Estado de prestamo inesperado: ${loan.estado}`)
  if (loan.monto !== 123456) throw new Error(`Monto de prestamo inesperado: ${loan.monto}`)

  const loans = await request('/loans')
  if (!loans.loans.some((item) => item.id === loan.id)) throw new Error('Listado de prestamos no incluyo smoke')
  if (loans.summary.total_pendiente < 123456) throw new Error(`Total pendiente de prestamos inesperado: ${loans.summary.total_pendiente}`)

  const returnedLoan = await post(`/loans/${loan.id}/return`, { fecha_devolucion: `${smokeYear}-05-03` })
  if (returnedLoan.estado !== 'devuelto') throw new Error(`Estado devuelto inesperado: ${returnedLoan.estado}`)
  if (returnedLoan.fecha_devolucion !== `${smokeYear}-05-03`) {
    throw new Error(`Fecha de devolucion inesperada: ${returnedLoan.fecha_devolucion}`)
  }

  const invalidLoan = await expectFailure('/loans', {
    method: 'POST',
    body: JSON.stringify({
      persona: `Smoke prestamo invalido ${Date.now()}`,
      monto: 1000,
      fecha_prestamo: `${smokeYear}-05-05`,
      fecha_devolucion: `${smokeYear}-05-01`,
      estado: 'devuelto',
    }),
  })
  if (!String(invalidLoan.error ?? '').includes('anterior')) {
    throw new Error('Validacion de fecha de prestamo no devolvio el error esperado')
  }

  const measurement = await post('/salud/measurements', {
    fecha: `${smokeYear}-06-01`,
    peso_kg: 80,
    estatura_cm: 180,
    notas: 'Smoke medida',
  })
  if (measurement.imc !== 24.7) throw new Error(`IMC inesperado: ${measurement.imc}`)
  if (measurement.categoria_imc?.id !== 'saludable') throw new Error(`Categoria IMC inesperada: ${measurement.categoria_imc?.id}`)

  const condition = await post('/salud/conditions', {
    nombre: `Smoke condicion ${Date.now()}`,
    tipo: 'cardiovascular',
    estado: 'activo',
    notas: 'Smoke condicion',
  })
  if (condition.tipo !== 'cardiovascular') throw new Error(`Tipo de condicion inesperado: ${condition.tipo}`)

  const medication = await post('/salud/medications', {
    condition_id: condition.id,
    nombre: `Smoke medicamento ${Date.now()}`,
    dosis: '10 mg',
    frecuencia: 'Diaria',
    hora: '09:00',
    activa: true,
  })
  if (medication.condicion_nombre !== condition.nombre) throw new Error('Medicamento smoke no quedo asociado a la condicion')

  const appointment = await post('/salud/appointments', {
    fecha_hora: `${smokeYear}-06-03T08:30`,
    especialidad: `Smoke medicina ${Date.now()}`,
    profesional: 'Smoke doctor',
    estado: 'programada',
  })
  if (appointment.estado !== 'programada') throw new Error(`Estado de cita inesperado: ${appointment.estado}`)

  const vision = await post('/salud/vision', {
    fecha: `${smokeYear}-06-02`,
    ojo_derecho_esfera: -1.25,
    ojo_derecho_cilindro: -0.5,
    ojo_derecho_eje: 90,
    ojo_izquierdo_esfera: -1,
    ojo_izquierdo_cilindro: -0.25,
    ojo_izquierdo_eje: 80,
    notas: 'Smoke formula visual',
  })
  if (vision.ojo_derecho_eje !== 90) throw new Error(`Eje de vision inesperado: ${vision.ojo_derecho_eje}`)

  const healthSummary = await request('/salud')
  if (healthSummary.summary.imc_actual !== 24.7) throw new Error(`Resumen salud no incluyo IMC smoke: ${healthSummary.summary.imc_actual}`)
  if (healthSummary.summary.medicamentos_activos < 1) throw new Error('Resumen salud no conto medicamento smoke')
  if (healthSummary.summary.citas_programadas < 1) throw new Error('Resumen salud no conto cita smoke')
  if (!healthSummary.summary.series.some((item) => item.fecha === `${smokeYear}-06-01`)) throw new Error('Serie de salud no incluyo medida smoke')

  const invalidMeasurement = await expectFailure('/salud/measurements', {
    method: 'POST',
    body: JSON.stringify({
      fecha: `${smokeYear}-06-01`,
      peso_kg: 80,
      estatura_cm: 300,
      notas: 'Smoke medida invalida',
    }),
  })
  if (!String(invalidMeasurement.error ?? '').includes('estatura')) {
    throw new Error('Validacion de estatura en salud no devolvio el error esperado')
  }

  const event = await post('/events', {
    titulo: `Smoke evento ${Date.now()}`,
    descripcion: 'Evento smoke',
    fecha: `${smokeYear}-08-01`,
    hora: '09:00',
    duracion_min: 45,
    lugar: 'Smoke lugar',
    recordatorio_min: 15,
  })
  if (!event.id || !event.uid) throw new Error('No se creo evento smoke con UID')

  const editedEvent = await put(`/events/${event.id}`, {
    titulo: `${event.titulo} editado`,
    fecha: `${smokeYear}-08-02`,
    hora: null,
    duracion_min: 60,
    recordatorio_min: null,
  })
  if (editedEvent.uid !== event.uid) throw new Error('UID de evento no se mantuvo estable al editar')
  if (editedEvent.hora !== null) throw new Error('Evento todo el dia no guardo hora null')

  const invalidEvent = await expectFailure('/events', {
    method: 'POST',
    body: JSON.stringify({
      titulo: `Smoke evento invalido ${Date.now()}`,
      fecha: `${smokeYear}-13-99`,
    }),
  })
  if (!String(invalidEvent.error ?? '').includes('fecha real')) {
    throw new Error('Validacion de fecha real en eventos no devolvio error esperado')
  }

  const icsResponse = await fetch(`${baseUrl}/events/calendar.ics`)
  const icsText = await icsResponse.text()
  if (!icsResponse.ok || !icsText.includes('BEGIN:VCALENDAR') || !icsText.includes(editedEvent.uid)) {
    throw new Error('Feed ICS no incluyo calendario/evento smoke')
  }

  const notificationEvent = await post('/events', {
    titulo: `Smoke notificacion ${Date.now()}`,
    fecha: notificationSmokeDate,
  })
  if (!notificationEvent.id) throw new Error('No se creo evento smoke para notificaciones')

  const vehicle = await post('/vehicles', {
    nombre: `Smoke vehiculo ${Date.now()}`,
    tipo: 'carro',
    placa: 'SMK123',
    color: '#2563eb',
  })
  if (!vehicle.id || vehicle.items.length < 2) throw new Error('Vehiculo smoke no creo items por defecto')

  const vehicleItem = vehicle.items.find((item) => item.nombre.includes('SOAT')) ?? vehicle.items[0]
  const editedItem = await put(`/vehicles/items/${vehicleItem.id}`, {
    nombre: vehicleItem.nombre,
    vence: `${smokeYear}-07-15`,
    notas: 'Smoke documento',
  })
  if (editedItem.estado !== 'vigente') throw new Error(`Estado de documento vehicular inesperado: ${editedItem.estado}`)

  const dueItem = await post(`/vehicles/${vehicle.id}/items`, {
    nombre: 'Smoke vencimiento hoy',
    vence: todayIso,
    notas: 'Smoke notificacion vehiculo',
  })
  if (dueItem.estado !== 'por_vencer' || dueItem.dias_restantes !== 0) {
    throw new Error('Documento vehicular para notificacion no quedo venciendo hoy')
  }

  const notificationDueItem = await post(`/vehicles/${vehicle.id}/items`, {
    nombre: 'Smoke vencimiento notificacion',
    vence: notificationSmokeDate,
    notas: 'Smoke notificacion vehiculo aislada',
  })
  if (!notificationDueItem.id) throw new Error('No se creo documento vehicular smoke para notificaciones')

  const nonPdfUpload = await expectFailure(`/vehicles/items/${vehicleItem.id}/file`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'no pdf',
  })
  if (!String(nonPdfUpload.error ?? '').includes('PDF')) throw new Error('Validacion de PDF vehicular no fallo como esperaba')

  const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10])
  const uploadResponse = await fetch(`${baseUrl}/vehicles/items/${vehicleItem.id}/file`, {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-file-name': encodeURIComponent('smoke.pdf'),
    },
    body: pdfBytes,
  })
  const uploadJson = await uploadResponse.json()
  if (!uploadResponse.ok) throw new Error(`Upload PDF vehicular fallo: ${JSON.stringify(uploadJson)}`)
  if (uploadJson.data.file_name !== 'smoke.pdf') throw new Error('PDF vehicular no guardo el nombre esperado')

  const downloadResponse = await fetch(`${baseUrl}/vehicles/items/${vehicleItem.id}/file`)
  const downloaded = await downloadResponse.arrayBuffer()
  if (!downloadResponse.ok || downloaded.byteLength !== pdfBytes.byteLength) {
    throw new Error('Descarga PDF vehicular no hizo roundtrip binario')
  }

  await del(`/vehicles/items/${vehicleItem.id}/file`)

  const vehicleExpense = await post(`/vehicles/${vehicle.id}/gastos`, {
    concepto: 'Smoke mantenimiento',
    monto: 321000,
    fecha: `${smokeYear}-07-20`,
  })
  if (vehicleExpense.vehicle_id !== vehicle.id) throw new Error('Gasto vehicular no quedo enlazado al vehiculo')

  const blockedVehicleDelete = await expectFailure(`/vehicles/${vehicle.id}`, { method: 'DELETE' })
  if (!String(blockedVehicleDelete.error ?? '').includes('gastos')) {
    throw new Error('Borrado de vehiculo con gastos no quedo bloqueado')
  }

  const originalNotificationSettings = await request('/notifications/settings')
  let notificationSettingsRestored = false
  try {
    const smokeSettings = await put('/notifications/settings', {
      ...originalNotificationSettings,
      push_habilitado: '0',
      pushover_user: '',
      pushover_token: '',
      regla_suscripciones: '0',
      regla_habitos: '1',
      regla_vehiculos: '1',
      regla_eventos: '1',
      vehiculos_umbrales: '180,90,30,15,8,3,0',
      eventos_dias_antes: '0',
      habitos_hora: '0',
      habitos_inicio: '0',
      habitos_fin: '23',
      habitos_cada_min: '60',
      habitos_franjas: JSON.stringify([
        { id: `smoke-manual-${notificationSmokeRunId}`, days: [0, 1, 2, 3, 4, 5, 6], start: '23:00', end: '23:59' },
        { id: 'smoke-manana', days: [1, 2, 3, 4, 5], start: '06:00', end: '07:00' },
        { id: 'smoke-tarde', days: [1, 2, 3, 4, 5], start: '16:00', end: '23:59' },
        { id: 'smoke-finde', days: [6, 0], start: '00:00', end: '23:59' },
        { id: 'smoke-todos', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
      ]),
      push_suscripciones: '0',
      push_habitos: '0',
      push_vehiculos: '0',
      push_eventos: '0',
      prioridad_suscripciones: '0',
      prioridad_habitos: '-1',
      prioridad_vehiculos: '1',
      prioridad_eventos: '0',
      sonido_suscripciones: '',
      sonido_habitos: 'none',
      sonido_vehiculos: 'bike',
      sonido_eventos: 'pushover',
      silencio_inicio: '22',
      silencio_fin: '7',
      pausado_hasta: '',
      resumen_diario: '0',
      vencida_recordar_cada: '3',
    })
    if (
      smokeSettings.push_habilitado !== '0'
      || smokeSettings.regla_eventos !== '1'
      || smokeSettings.push_vehiculos !== '0'
      || smokeSettings.prioridad_vehiculos !== '1'
      || smokeSettings.sonido_vehiculos !== 'bike'
      || smokeSettings.silencio_inicio !== '22'
      || smokeSettings.habitos_inicio !== '0'
      || smokeSettings.habitos_fin !== '23'
      || smokeSettings.habitos_cada_min !== '60'
      || !String(smokeSettings.habitos_franjas ?? '').includes('smoke-manana')
      || !String(smokeSettings.habitos_franjas ?? '').includes('23:59')
      || smokeSettings.vehiculos_umbrales !== '180,90,30,15,8,3,0'
    ) {
      throw new Error('Settings de notificaciones no guardaron valores smoke')
    }

    const invalidNotificationSetting = await expectFailure('/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify({ clave_invalida: '1' }),
    })
    if (!String(invalidNotificationSetting.error ?? '').includes('Clave desconocida')) {
      throw new Error('Settings de notificaciones no rechazaron clave desconocida')
    }

    const testPushFailure = await expectFailure('/notifications/test-push', { method: 'POST' })
    if (!String(testPushFailure.error ?? '').includes('Configura primero')) {
      throw new Error('test-push sin llaves no devolvio el error esperado')
    }

    const notificationRun = await post('/notifications/run', { fecha: notificationSmokeDate, hora: 23, minuto: 22 })
    if (
      !Number.isInteger(notificationRun.nuevas)
      || !Number.isInteger(notificationRun.push_enviadas)
      || !Number.isInteger(notificationRun.push_retenidas)
      || typeof notificationRun.en_silencio !== 'boolean'
      || typeof notificationRun.pausado !== 'boolean'
    ) {
      throw new Error('Run de notificaciones no devolvio resumen esperado')
    }
    if (notificationRun.en_silencio !== true || notificationRun.pausado !== false) {
      throw new Error('Run de notificaciones no respeto silencio/pausa smoke')
    }
    if (notificationRun.nuevas < 3) {
      throw new Error('Run de notificaciones no creo avisos smoke dentro del intervalo manual')
    }

    const pausedSettings = await put('/notifications/settings', {
      ...smokeSettings,
      pausado_hasta: '2099-12-31T23:59',
    })
    if (pausedSettings.pausado_hasta !== '2099-12-31T23:59') {
      throw new Error('Settings de notificaciones no guardaron pausa smoke')
    }
    const pausedRun = await post('/notifications/run', { fecha: notificationSmokeDate, hora: 10, minuto: 0 })
    if (pausedRun.pausado !== true || !Number.isInteger(pausedRun.push_retenidas)) {
      throw new Error('Run de notificaciones no devolvio pausa/retencion smoke')
    }
    await put('/notifications/settings', smokeSettings)

    const notificationList = await request(`/notifications?fecha=${notificationSmokeDate}&limit=200`)
    if (!notificationList.notificaciones.some((item) => String(item.titulo).includes(notificationEvent.titulo))) {
      throw new Error('Notificaciones no incluyeron evento smoke de hoy')
    }
    if (!notificationList.notificaciones.some((item) => item.tipo === 'vehiculo' && String(item.titulo).includes('Smoke'))) {
      throw new Error('Notificaciones no incluyeron vencimiento vehicular smoke')
    }
    if (!notificationList.notificaciones.some((item) => item.tipo === 'habitos' && String(item.mensaje ?? '').includes(smokeHabit.name))) {
      throw new Error('Notificaciones no incluyeron habito smoke en revision manual dentro del intervalo')
    }

    const smokeUnreadNotifications = notificationList.notificaciones.filter((item) => (
      Number(item.leida) === 0
      && (
        String(item.titulo).includes(notificationEvent.titulo)
        || String(item.titulo).includes('Smoke')
        || String(item.mensaje ?? '').includes('Smoke')
      )
    ))
    for (const smokeUnreadNotification of smokeUnreadNotifications) {
      const readNotification = await post(`/notifications/${smokeUnreadNotification.id}/read`, {})
      if (readNotification.id !== smokeUnreadNotification.id) throw new Error('Marcar notificacion leida no devolvio ID esperado')
    }

    await put('/notifications/settings', originalNotificationSettings)
    notificationSettingsRestored = true
  } finally {
    if (!notificationSettingsRestored) {
      await put('/notifications/settings', originalNotificationSettings)
    }
  }

  await cleanupSmokeData(platform.id)

  console.log('Endpoints OK: platforms, categories, cards, snapshots, movements, subscriptions/apply, summary, close-month, goals, music, knowledge, habits, loans, salud, events, vehicles, notifications')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
