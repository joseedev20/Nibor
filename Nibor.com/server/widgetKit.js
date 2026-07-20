// Utilidades compartidas por la API de widgets (server/routes/widget.js).
// CONTRATO DE ROBUSTEZ: toda rama que pasa por `guarded()` devuelve SIEMPRE
// un JSON válido { success, data: { text, … }, error?, meta: { requestId,
// generatedAt } }, con content-type/no-store/X-Request-Id explícitos.
// Nunca un body vacío: los errores internos se capturan y responden con
// envelope. Ver server/routes/widget.js para el uso completo.

const DB_TIMEOUT_MS = 10000

export function requestIdFrom(c) {
  return c.req.header('cf-ray') ?? crypto.randomUUID()
}

export function widgetJson(payload, status, requestId) {
  const body = JSON.stringify({
    ...payload,
    meta: { requestId, generatedAt: new Date().toISOString(), ...(payload.meta ?? {}) },
  })
  return {
    body,
    response: new Response(body, {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-request-id': requestId,
      },
    }),
  }
}

// Log estructurado por solicitud (visible con `wrangler tail`).
export function logWidget(entry) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }))
}

export function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT:${label} superó ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function withDbTimeout(promise, label) {
  return withTimeout(promise, DB_TIMEOUT_MS, label)
}

// Ejecuta un handler garantizando respuesta JSON y log aunque explote.
export async function guarded(c, route, handler) {
  const requestId = requestIdFrom(c)
  const started = Date.now()
  const log = { requestId, route, method: c.req.method }
  try {
    const { status, payload, extraLog } = await handler(requestId, log)
    const { body, response } = widgetJson(payload, status, requestId)
    logWidget({ ...log, ...(extraLog ?? {}), status, durationMs: Date.now() - started, bodyLength: body.length })
    return response
  } catch (error) {
    const isTimeout = String(error?.message ?? '').startsWith('TIMEOUT:')
    const status = isTimeout ? 504 : 500
    const { body, response } = widgetJson({
      success: false,
      data: { text: 'No fue posible completar la solicitud' },
      error: { code: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR' },
    }, status, requestId)
    logWidget({
      ...log,
      status,
      durationMs: Date.now() - started,
      bodyLength: body.length,
      error: String(error?.message ?? error),
      stack: String(error?.stack ?? '').slice(0, 600),
    })
    return response
  }
}

// Token inválido/ausente → 404 con JSON (sin revelar que la ruta existe).
export function tokenFailure() {
  return { status: 404, payload: { success: false, data: { text: 'No encontrado' }, error: { code: 'NOT_FOUND' } }, extraLog: { auth: 'fail' } }
}

export function isValidWidgetToken(c) {
  const expected = String(c.env.WIDGET_TOKEN ?? '').trim()
  return Boolean(expected) && String(c.req.query('token') ?? '') === expected
}
