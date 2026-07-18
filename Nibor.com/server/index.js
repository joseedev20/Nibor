import { Hono } from 'hono'
import cards from './routes/cards.js'
import categories from './routes/categories.js'
import closeMonth from './routes/closeMonth.js'
import events from './routes/events.js'
import exchangeRates from './routes/exchangeRates.js'
import family from './routes/family.js'
import goals from './routes/goals.js'
import habits from './routes/habits.js'
import health from './routes/health.js'
import homeModule from './routes/home.js'
import knowledge from './routes/knowledge.js'
import loans from './routes/loans.js'
import movements from './routes/movements.js'
import music from './routes/music.js'
import notifications, { runChecks } from './routes/notifications.js'
import pets from './routes/pets.js'
import widget from './routes/widget.js'
import platforms from './routes/platforms.js'
import reminders from './routes/reminders.js'
import snapshots from './routes/snapshots.js'
import subscriptions from './routes/subscriptions.js'
import summary from './routes/summary.js'
import vehicles from './routes/vehicles.js'

// API de Nibor.com — corre como Cloudflare Worker.
// D1 disponible en cada handler como c.env.DB (binding definido en wrangler.toml).
const app = new Hono().basePath('/api')

app.get('/health', (c) => c.json({ data: { status: 'ok', ts: new Date().toISOString() } }))

app.route('/platforms', platforms)
app.route('/categories', categories)
app.route('/cards', cards)
app.route('/exchange-rates', exchangeRates)
app.route('/events', events)
app.route('/family', family)
app.route('/snapshots', snapshots)
app.route('/movements', movements)
app.route('/subscriptions', subscriptions)
app.route('/goals', goals)
app.route('/habits', habits)
app.route('/home', homeModule)
app.route('/salud', health)
app.route('/knowledge', knowledge)
app.route('/loans', loans)
app.route('/vehicles', vehicles)
app.route('/music', music)
app.route('/notifications', notifications)
app.route('/pets', pets)
app.route('/reminders', reminders)
app.route('/widget', widget)
app.route('/summary', summary)
app.route('/close-month', closeMonth)

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message ?? 'Error interno' }, 500)
})

// fetch = API normal; scheduled = cron de Cloudflare (notificaciones + Pushover)
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env).catch((err) => console.error('cron notificaciones:', err)))
  },
}
