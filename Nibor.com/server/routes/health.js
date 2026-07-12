import { Hono } from 'hono'
import {
  all,
  booleanToInt,
  fail,
  first,
  isValidDate,
  isValidDateTime,
  isValidTime,
  ok,
  readJson,
  run,
  toInteger,
  toNullableNumber,
  toNumber,
} from '../db.js'

const health = new Hono()

const CONDITION_TYPES = new Set(['general', 'cardiovascular', 'vision', 'respiratorio', 'otro'])
const CONDITION_STATUSES = new Set(['activo', 'controlado', 'resuelto'])
const APPOINTMENT_STATUSES = new Set(['programada', 'asistida', 'cancelada'])
const SEX_VALUES = new Set(['masculino', 'femenino', 'otro'])

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function nowLocalDateTime() {
  return new Date().toISOString().slice(0, 16)
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanNullableText(value) {
  const text = cleanText(value)
  return text || null
}

function round(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

export function computeBmi(pesoKg, estaturaCm) {
  const weight = Number(pesoKg)
  const height = Number(estaturaCm)
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null
  const meters = height / 100
  return round(weight / (meters * meters), 1)
}

export function bmiCategory(bmi) {
  if (bmi === null || bmi === undefined || !Number.isFinite(Number(bmi))) {
    return { id: null, label: 'Sin IMC', tone: 'zinc' }
  }
  const value = Number(bmi)
  if (value < 18.5) return { id: 'bajo_peso', label: 'Bajo peso', tone: 'sky' }
  if (value < 25) return { id: 'saludable', label: 'Peso saludable', tone: 'emerald' }
  if (value < 30) return { id: 'sobrepeso', label: 'Sobrepeso', tone: 'amber' }
  if (value < 35) return { id: 'obesidad_1', label: 'Obesidad clase 1', tone: 'rose' }
  if (value < 40) return { id: 'obesidad_2', label: 'Obesidad clase 2', tone: 'rose' }
  return { id: 'obesidad_3', label: 'Obesidad clase 3', tone: 'rose' }
}

function enrichMeasurement(row, fallbackHeight = null) {
  const estatura_cm = row.estatura_cm ?? fallbackHeight
  const imc = computeBmi(row.peso_kg, estatura_cm)
  return {
    ...row,
    estatura_cm,
    imc,
    categoria_imc: bmiCategory(imc),
  }
}

function validateHeight(value, label = 'La estatura') {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(Number(value)) || Number(value) < 80 || Number(value) > 250) {
    return `${label} debe estar entre 80 y 250 cm`
  }
  return null
}

function validateNotes(notes, max = 800) {
  if (notes && notes.length > max) return `Las notas no pueden superar ${max} caracteres`
  return null
}

function normalizeProfile(body, current = {}) {
  return {
    estatura_cm: body.estatura_cm === undefined ? current.estatura_cm ?? null : toNullableNumber(body.estatura_cm),
    fecha_nacimiento: body.fecha_nacimiento === undefined ? current.fecha_nacimiento ?? null : cleanNullableText(body.fecha_nacimiento),
    sexo: body.sexo === undefined ? current.sexo ?? null : cleanNullableText(body.sexo),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateProfile(profile) {
  const heightError = validateHeight(profile.estatura_cm)
  if (heightError) return heightError
  if (profile.fecha_nacimiento !== null && !isValidDate(profile.fecha_nacimiento)) return 'La fecha de nacimiento debe tener formato YYYY-MM-DD'
  if (profile.sexo !== null && !SEX_VALUES.has(profile.sexo)) return 'El sexo debe ser masculino, femenino u otro'
  return validateNotes(profile.notas)
}

async function getProfile(db) {
  return first(db, 'SELECT id, estatura_cm, fecha_nacimiento, sexo, notas, updated_at FROM health_profile WHERE id = 1')
}

function normalizeMeasurement(body, current = {}) {
  return {
    fecha: body.fecha === undefined ? current.fecha ?? todayIso() : cleanText(body.fecha),
    peso_kg: body.peso_kg === undefined ? Number(current.peso_kg ?? 0) : toNumber(body.peso_kg),
    estatura_cm: body.estatura_cm === undefined ? current.estatura_cm ?? null : toNullableNumber(body.estatura_cm),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateMeasurement(measurement) {
  if (!isValidDate(measurement.fecha)) return 'La fecha debe tener formato YYYY-MM-DD'
  if (!Number.isFinite(measurement.peso_kg) || measurement.peso_kg <= 0 || measurement.peso_kg > 350) {
    return 'El peso debe estar entre 0 y 350 kg'
  }
  const heightError = validateHeight(measurement.estatura_cm)
  if (heightError) return heightError
  return validateNotes(measurement.notas)
}

async function getMeasurementById(db, id) {
  return first(
    db,
    `SELECT id, fecha, peso_kg, estatura_cm, notas, created_at, updated_at
     FROM health_measurements
     WHERE id = ?`,
    id,
  )
}

function normalizeCondition(body, current = {}) {
  return {
    nombre: body.nombre === undefined ? current.nombre : cleanText(body.nombre),
    tipo: body.tipo === undefined ? current.tipo ?? 'general' : cleanText(body.tipo),
    estado: body.estado === undefined ? current.estado ?? 'activo' : cleanText(body.estado),
    fecha_diagnostico: body.fecha_diagnostico === undefined ? current.fecha_diagnostico ?? null : cleanNullableText(body.fecha_diagnostico),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateCondition(condition) {
  if (!condition.nombre) return 'El nombre de la condicion es obligatorio'
  if (!CONDITION_TYPES.has(condition.tipo)) return 'El tipo de condicion no es valido'
  if (!CONDITION_STATUSES.has(condition.estado)) return 'El estado debe ser activo, controlado o resuelto'
  if (condition.fecha_diagnostico !== null && !isValidDate(condition.fecha_diagnostico)) {
    return 'La fecha de diagnostico debe tener formato YYYY-MM-DD'
  }
  return validateNotes(condition.notas)
}

async function getConditionById(db, id) {
  return first(
    db,
    `SELECT id, nombre, tipo, estado, fecha_diagnostico, notas, created_at, updated_at
     FROM health_conditions
     WHERE id = ?`,
    id,
  )
}

function normalizeMedication(body, current = {}) {
  return {
    condition_id: body.condition_id === undefined ? current.condition_id ?? null : toInteger(body.condition_id, null),
    nombre: body.nombre === undefined ? current.nombre : cleanText(body.nombre),
    dosis: body.dosis === undefined ? current.dosis ?? null : cleanNullableText(body.dosis),
    frecuencia: body.frecuencia === undefined ? current.frecuencia ?? 'Diaria' : cleanText(body.frecuencia),
    hora: body.hora === undefined ? current.hora ?? null : cleanNullableText(body.hora),
    activa: body.activa === undefined ? current.activa ?? 1 : booleanToInt(body.activa, current.activa ?? 1),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

async function validateMedication(db, medication) {
  if (!medication.nombre) return 'El nombre del medicamento es obligatorio'
  if (!medication.frecuencia) return 'La frecuencia es obligatoria'
  if (medication.condition_id !== null) {
    const condition = await first(db, 'SELECT id FROM health_conditions WHERE id = ?', medication.condition_id)
    if (!condition) return 'La condicion asociada no existe'
  }
  if (medication.hora !== null && !isValidTime(medication.hora)) return 'La hora debe tener formato HH:mm'
  return validateNotes(medication.notas)
}

async function getMedicationById(db, id) {
  return first(
    db,
    `SELECT m.id, m.condition_id, c.nombre AS condicion_nombre, m.nombre, m.dosis, m.frecuencia, m.hora, m.activa, m.notas, m.created_at, m.updated_at
     FROM health_medications m
     LEFT JOIN health_conditions c ON c.id = m.condition_id
     WHERE m.id = ?`,
    id,
  )
}

function normalizeAppointment(body, current = {}) {
  return {
    fecha_hora: body.fecha_hora === undefined ? current.fecha_hora ?? nowLocalDateTime() : cleanText(body.fecha_hora),
    especialidad: body.especialidad === undefined ? current.especialidad : cleanText(body.especialidad),
    profesional: body.profesional === undefined ? current.profesional ?? null : cleanNullableText(body.profesional),
    lugar: body.lugar === undefined ? current.lugar ?? null : cleanNullableText(body.lugar),
    motivo: body.motivo === undefined ? current.motivo ?? null : cleanNullableText(body.motivo),
    estado: body.estado === undefined ? current.estado ?? 'programada' : cleanText(body.estado),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateAppointment(appointment) {
  if (!isValidDateTime(appointment.fecha_hora)) return 'La fecha y hora deben tener formato YYYY-MM-DDTHH:mm'
  if (!appointment.especialidad) return 'La especialidad es obligatoria'
  if (!APPOINTMENT_STATUSES.has(appointment.estado)) return 'El estado debe ser programada, asistida o cancelada'
  return validateNotes(appointment.notas)
}

async function getAppointmentById(db, id) {
  return first(
    db,
    `SELECT id, fecha_hora, especialidad, profesional, lugar, motivo, estado, notas, created_at, updated_at
     FROM health_appointments
     WHERE id = ?`,
    id,
  )
}

function normalizeVision(body, current = {}) {
  return {
    fecha: body.fecha === undefined ? current.fecha ?? todayIso() : cleanText(body.fecha),
    ojo_derecho_esfera: body.ojo_derecho_esfera === undefined ? current.ojo_derecho_esfera ?? null : toNullableNumber(body.ojo_derecho_esfera),
    ojo_derecho_cilindro: body.ojo_derecho_cilindro === undefined ? current.ojo_derecho_cilindro ?? null : toNullableNumber(body.ojo_derecho_cilindro),
    ojo_derecho_eje: body.ojo_derecho_eje === undefined ? current.ojo_derecho_eje ?? null : toInteger(body.ojo_derecho_eje, null),
    ojo_izquierdo_esfera: body.ojo_izquierdo_esfera === undefined ? current.ojo_izquierdo_esfera ?? null : toNullableNumber(body.ojo_izquierdo_esfera),
    ojo_izquierdo_cilindro: body.ojo_izquierdo_cilindro === undefined ? current.ojo_izquierdo_cilindro ?? null : toNullableNumber(body.ojo_izquierdo_cilindro),
    ojo_izquierdo_eje: body.ojo_izquierdo_eje === undefined ? current.ojo_izquierdo_eje ?? null : toInteger(body.ojo_izquierdo_eje, null),
    notas: body.notas === undefined ? current.notas ?? null : cleanNullableText(body.notas),
  }
}

function validateVision(vision) {
  if (!isValidDate(vision.fecha)) return 'La fecha debe tener formato YYYY-MM-DD'
  for (const key of ['ojo_derecho_esfera', 'ojo_derecho_cilindro', 'ojo_izquierdo_esfera', 'ojo_izquierdo_cilindro']) {
    if (vision[key] !== null && !Number.isFinite(Number(vision[key]))) return 'Los valores de formula visual deben ser numericos'
  }
  for (const key of ['ojo_derecho_eje', 'ojo_izquierdo_eje']) {
    if (vision[key] !== null && (!Number.isInteger(vision[key]) || vision[key] < 0 || vision[key] > 180)) {
      return 'El eje debe estar entre 0 y 180'
    }
  }
  return validateNotes(vision.notas)
}

async function getVisionById(db, id) {
  return first(
    db,
    `SELECT id, fecha, ojo_derecho_esfera, ojo_derecho_cilindro, ojo_derecho_eje,
            ojo_izquierdo_esfera, ojo_izquierdo_cilindro, ojo_izquierdo_eje, notas, created_at, updated_at
     FROM health_vision_prescriptions
     WHERE id = ?`,
    id,
  )
}

async function buildHealthData(db) {
  const profile = await getProfile(db)
  const measurementsRaw = await all(
    db,
    `SELECT id, fecha, peso_kg, estatura_cm, notas, created_at, updated_at
     FROM health_measurements
     ORDER BY fecha DESC, id DESC`,
  )
  const measurements = measurementsRaw.map((row) => enrichMeasurement(row, profile?.estatura_cm ?? null))
  const conditions = await all(
    db,
    `SELECT id, nombre, tipo, estado, fecha_diagnostico, notas, created_at, updated_at
     FROM health_conditions
     ORDER BY CASE estado WHEN 'activo' THEN 1 WHEN 'controlado' THEN 2 ELSE 3 END, tipo ASC, nombre ASC`,
  )
  const medications = await all(
    db,
    `SELECT m.id, m.condition_id, c.nombre AS condicion_nombre, m.nombre, m.dosis, m.frecuencia, m.hora, m.activa, m.notas, m.created_at, m.updated_at
     FROM health_medications m
     LEFT JOIN health_conditions c ON c.id = m.condition_id
     ORDER BY m.activa DESC, m.hora ASC, m.nombre ASC`,
  )
  const appointments = await all(
    db,
    `SELECT id, fecha_hora, especialidad, profesional, lugar, motivo, estado, notas, created_at, updated_at
     FROM health_appointments
     ORDER BY fecha_hora ASC`,
  )
  const vision = await all(
    db,
    `SELECT id, fecha, ojo_derecho_esfera, ojo_derecho_cilindro, ojo_derecho_eje,
            ojo_izquierdo_esfera, ojo_izquierdo_cilindro, ojo_izquierdo_eje, notas, created_at, updated_at
     FROM health_vision_prescriptions
     ORDER BY fecha DESC, id DESC`,
  )

  const latestMeasurement = measurements[0] ?? null
  const scheduledAppointments = appointments.filter((item) => item.estado === 'programada')
  const activeConditions = conditions.filter((item) => item.estado !== 'resuelto')
  const activeMedications = medications.filter((item) => Number(item.activa) === 1)

  return {
    profile,
    measurements,
    conditions,
    medications,
    appointments,
    vision,
    summary: {
      peso_actual: latestMeasurement?.peso_kg ?? null,
      estatura_cm: latestMeasurement?.estatura_cm ?? profile?.estatura_cm ?? null,
      imc_actual: latestMeasurement?.imc ?? null,
      categoria_imc: latestMeasurement?.categoria_imc ?? bmiCategory(null),
      condiciones_activas: activeConditions.length,
      medicamentos_activos: activeMedications.length,
      citas_programadas: scheduledAppointments.length,
      proxima_cita: scheduledAppointments[0] ?? null,
      condiciones_vision: conditions.filter((item) => item.tipo === 'vision' && item.estado !== 'resuelto').length,
      series: measurements
        .slice()
        .reverse()
        .map((item) => ({
          fecha: item.fecha,
          peso_kg: item.peso_kg,
          imc: item.imc,
          categoria_imc: item.categoria_imc,
        })),
    },
  }
}

health.get('/', async (c) => ok(c, await buildHealthData(c.env.DB)))

health.put('/profile', async (c) => {
  const current = await getProfile(c.env.DB)
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const profile = normalizeProfile(body, current ?? {})
  const error = validateProfile(profile)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `INSERT INTO health_profile (id, estatura_cm, fecha_nacimiento, sexo, notas, updated_at)
     VALUES (1, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       estatura_cm = excluded.estatura_cm,
       fecha_nacimiento = excluded.fecha_nacimiento,
       sexo = excluded.sexo,
       notas = excluded.notas,
       updated_at = datetime('now')`,
    profile.estatura_cm,
    profile.fecha_nacimiento,
    profile.sexo,
    profile.notas,
  )

  return ok(c, await getProfile(c.env.DB))
})

health.post('/measurements', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const measurement = normalizeMeasurement(body)
  const error = validateMeasurement(measurement)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO health_measurements (fecha, peso_kg, estatura_cm, notas)
     VALUES (?, ?, ?, ?)`,
    measurement.fecha,
    measurement.peso_kg,
    measurement.estatura_cm,
    measurement.notas,
  )
  const profile = await getProfile(c.env.DB)
  return ok(c, enrichMeasurement(await getMeasurementById(c.env.DB, meta.last_row_id), profile?.estatura_cm ?? null), 201)
})

health.put('/measurements/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getMeasurementById(c.env.DB, id)
  if (!current) return fail(c, 'Medida no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const measurement = normalizeMeasurement(body, current)
  const error = validateMeasurement(measurement)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE health_measurements
     SET fecha = ?, peso_kg = ?, estatura_cm = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    measurement.fecha,
    measurement.peso_kg,
    measurement.estatura_cm,
    measurement.notas,
    id,
  )
  const profile = await getProfile(c.env.DB)
  return ok(c, enrichMeasurement(await getMeasurementById(c.env.DB, id), profile?.estatura_cm ?? null))
})

health.delete('/measurements/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM health_measurements WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Medida no encontrada', 404)
  return ok(c, { id })
})

health.post('/conditions', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const condition = normalizeCondition(body)
  const error = validateCondition(condition)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO health_conditions (nombre, tipo, estado, fecha_diagnostico, notas)
     VALUES (?, ?, ?, ?, ?)`,
    condition.nombre,
    condition.tipo,
    condition.estado,
    condition.fecha_diagnostico,
    condition.notas,
  )
  return ok(c, await getConditionById(c.env.DB, meta.last_row_id), 201)
})

health.put('/conditions/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getConditionById(c.env.DB, id)
  if (!current) return fail(c, 'Condicion no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const condition = normalizeCondition(body, current)
  const error = validateCondition(condition)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE health_conditions
     SET nombre = ?, tipo = ?, estado = ?, fecha_diagnostico = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    condition.nombre,
    condition.tipo,
    condition.estado,
    condition.fecha_diagnostico,
    condition.notas,
    id,
  )
  return ok(c, await getConditionById(c.env.DB, id))
})

health.delete('/conditions/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM health_conditions WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Condicion no encontrada', 404)
  return ok(c, { id })
})

health.post('/medications', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const medication = normalizeMedication(body)
  const error = await validateMedication(c.env.DB, medication)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO health_medications (condition_id, nombre, dosis, frecuencia, hora, activa, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    medication.condition_id,
    medication.nombre,
    medication.dosis,
    medication.frecuencia,
    medication.hora,
    medication.activa,
    medication.notas,
  )
  return ok(c, await getMedicationById(c.env.DB, meta.last_row_id), 201)
})

health.put('/medications/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getMedicationById(c.env.DB, id)
  if (!current) return fail(c, 'Medicamento no encontrado', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const medication = normalizeMedication(body, current)
  const error = await validateMedication(c.env.DB, medication)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE health_medications
     SET condition_id = ?, nombre = ?, dosis = ?, frecuencia = ?, hora = ?, activa = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    medication.condition_id,
    medication.nombre,
    medication.dosis,
    medication.frecuencia,
    medication.hora,
    medication.activa,
    medication.notas,
    id,
  )
  return ok(c, await getMedicationById(c.env.DB, id))
})

health.delete('/medications/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM health_medications WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Medicamento no encontrado', 404)
  return ok(c, { id })
})

health.post('/appointments', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const appointment = normalizeAppointment(body)
  const error = validateAppointment(appointment)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO health_appointments (fecha_hora, especialidad, profesional, lugar, motivo, estado, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    appointment.fecha_hora,
    appointment.especialidad,
    appointment.profesional,
    appointment.lugar,
    appointment.motivo,
    appointment.estado,
    appointment.notas,
  )
  return ok(c, await getAppointmentById(c.env.DB, meta.last_row_id), 201)
})

health.put('/appointments/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getAppointmentById(c.env.DB, id)
  if (!current) return fail(c, 'Cita no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const appointment = normalizeAppointment(body, current)
  const error = validateAppointment(appointment)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE health_appointments
     SET fecha_hora = ?, especialidad = ?, profesional = ?, lugar = ?, motivo = ?, estado = ?, notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    appointment.fecha_hora,
    appointment.especialidad,
    appointment.profesional,
    appointment.lugar,
    appointment.motivo,
    appointment.estado,
    appointment.notas,
    id,
  )
  return ok(c, await getAppointmentById(c.env.DB, id))
})

health.delete('/appointments/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM health_appointments WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Cita no encontrada', 404)
  return ok(c, { id })
})

health.post('/vision', async (c) => {
  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const vision = normalizeVision(body)
  const error = validateVision(vision)
  if (error) return fail(c, error)

  const meta = await run(
    c.env.DB,
    `INSERT INTO health_vision_prescriptions (
       fecha, ojo_derecho_esfera, ojo_derecho_cilindro, ojo_derecho_eje,
       ojo_izquierdo_esfera, ojo_izquierdo_cilindro, ojo_izquierdo_eje, notas
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    vision.fecha,
    vision.ojo_derecho_esfera,
    vision.ojo_derecho_cilindro,
    vision.ojo_derecho_eje,
    vision.ojo_izquierdo_esfera,
    vision.ojo_izquierdo_cilindro,
    vision.ojo_izquierdo_eje,
    vision.notas,
  )
  return ok(c, await getVisionById(c.env.DB, meta.last_row_id), 201)
})

health.put('/vision/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const current = await getVisionById(c.env.DB, id)
  if (!current) return fail(c, 'Formula visual no encontrada', 404)

  const body = await readJson(c)
  if (!body) return fail(c, 'Body JSON invalido')

  const vision = normalizeVision(body, current)
  const error = validateVision(vision)
  if (error) return fail(c, error)

  await run(
    c.env.DB,
    `UPDATE health_vision_prescriptions
     SET fecha = ?, ojo_derecho_esfera = ?, ojo_derecho_cilindro = ?, ojo_derecho_eje = ?,
         ojo_izquierdo_esfera = ?, ojo_izquierdo_cilindro = ?, ojo_izquierdo_eje = ?,
         notas = ?, updated_at = datetime('now')
     WHERE id = ?`,
    vision.fecha,
    vision.ojo_derecho_esfera,
    vision.ojo_derecho_cilindro,
    vision.ojo_derecho_eje,
    vision.ojo_izquierdo_esfera,
    vision.ojo_izquierdo_cilindro,
    vision.ojo_izquierdo_eje,
    vision.notas,
    id,
  )
  return ok(c, await getVisionById(c.env.DB, id))
})

health.delete('/vision/:id', async (c) => {
  const id = toInteger(c.req.param('id'))
  if (!Number.isInteger(id)) return fail(c, 'ID invalido')

  const meta = await run(c.env.DB, 'DELETE FROM health_vision_prescriptions WHERE id = ?', id)
  if (!meta.changes) return fail(c, 'Formula visual no encontrada', 404)
  return ok(c, { id })
})

export default health
