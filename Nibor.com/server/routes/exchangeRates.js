import { Hono } from 'hono'
import { fail, fetchUsdCopRate, ok } from '../db.js'

const exchangeRates = new Hono()

exchangeRates.get('/usd-cop', async (c) => {
  try {
    return ok(c, await fetchUsdCopRate())
  } catch (err) {
    return fail(c, err.message ?? 'No se pudo consultar la TRM', 502)
  }
})

export default exchangeRates
