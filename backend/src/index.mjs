import express from 'express'
import { fileURLToPath } from 'url'
import '../../dotenv.mjs'
import user from './models/user.mjs'
import series from './models/series.mjs'
import seriesItem from './models/series_item.mjs'
import refresher from './refresher.mjs'
import Auth from './auth.mjs'
import * as crunchyroll from './crunchyroll.mjs'

const app = express()
const PORT = process.env.PORT
const auth = new Auth({ secret: process.env.SECRET })

app.use(express.json())
app.set('views', './')
app.set('view engine', 'pug')

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body
  res.json(await user.signup(username, password))
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  const { error, success } = await user.login(username, password)
  if (error) return res.status(401).json({ error })
  if (success) {
    const token = auth.generateToken({ username })
    return res.json({ success, token })
  }
})

export const verifyToken = (req, res, next) => {
  const tokenHeader = req.headers.authorization
  if (!tokenHeader) return res.status(401).json({ error: 'No token provided' })
  const [, token] = tokenHeader.split(' ')
  const success = auth.verifyToken(token)
  if (!success) return res.status(403).json({ error: 'Invalid token' })
  res.newToken = auth.refreshToken(token)
  next()
}

export const getUser = (req, res, next) => {
  const token = res.newToken
  const { meta: { username } } = auth.parseToken(token)
  res.username = username
  next()
}

// Resuelve user_id desde res.username (el token solo lleva username).
// Cuelga res.userId para que los handlers filtren siempre por user_id.
export const resolveUserId = async (req, res, next) => {
  const { error, data } = await user.getBy('username', res.username)
  if (error) return res.status(500).json({ error: 'Error resolving user' })
  if (!data) return res.status(401).json({ error: 'User not found' })
  res.userId = data.id
  next()
}

const VALID_TYPES = ['manga', 'anime']
const URL_FIELDS = ['url', 'cover_url', 'imdb_url']
const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\/.+/.test(v)

// Devuelve array de mensajes de error. `partial=true` permite omitir campos (PUT).
const validateSeries = (body, partial = false) => {
  const errors = []
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k)

  if (!partial || has('type')) {
    if (!VALID_TYPES.includes(body.type)) errors.push('type must be "manga" or "anime"')
  }
  if (!partial || has('name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) errors.push('name is required')
  }
  for (const f of URL_FIELDS) {
    if (has(f) && body[f] !== '' && body[f] != null) {
      if (!isHttpUrl(body[f])) errors.push(`${f} must be an http(s) URL`)
    }
  }
  if (has('current_chapter')) {
    const n = Number(body.current_chapter)
    if (!Number.isFinite(n) || n < 0) errors.push('current_chapter must be >= 0')
  }
  return errors
}

app.get('/api/', (_req, res) => {
  res.json({ message: 'Manga Café API' })
})

app.get('/api/me', [verifyToken, getUser], (_req, res) => {
  res.json({ username: res.username, token: res.newToken })
})

// --- CRUD de series (Épica 3) ---
// Todas filtran por res.userId (aislamiento multiusuario).

app.get('/api/series', [verifyToken, getUser, resolveUserId], async (_req, res) => {
  const { error, data } = await series.listByUser(res.userId)
  if (error) return res.status(500).json({ error: 'Error fetching series' })
  res.json({ data, token: res.newToken })
})

app.post('/api/series', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const errors = validateSeries(req.body)
  if (errors.length) return res.status(400).json({ error: errors.join('; ') })
  const payload = {
    type: req.body.type,
    name: req.body.name.trim(),
    url: req.body.url || null,
    cover_url: req.body.cover_url || null,
    current_chapter: req.body.current_chapter || 0,
    imdb_url: req.body.imdb_url || null
  }
  const { error, id } = await series.create(res.userId, payload)
  if (error) return res.status(500).json({ error })
  res.json({ success: true, id, token: res.newToken })
})

app.get('/api/series/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { error, data } = await series.getById(req.params.id, res.userId)
  if (error) return res.status(500).json({ error })
  if (!data) return res.status(404).json({ error: 'Series not found' })
  res.json({ data, token: res.newToken })
})

app.put('/api/series/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const errors = validateSeries(req.body, true)
  if (errors.length) return res.status(400).json({ error: errors.join('; ') })
  const { error } = await series.update(req.params.id, res.userId, req.body)
  if (error) return res.status(404).json({ error: 'Series not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

app.delete('/api/series/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { error } = await series.remove(req.params.id, res.userId)
  if (error) return res.status(404).json({ error: 'Series not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

// --- IMDB scraper (Épica 4) ---
// On-demand para el usuario actual: refresca todas SUS series con imdb_url.
app.post('/api/refresh', [verifyToken, getUser, resolveUserId], async (_req, res) => {
  const result = await refresher.refreshByUser(res.userId)
  res.json({ ...result, token: res.newToken })
})

// Refresca una sola serie (debe pertenecer al usuario).
app.post('/api/series/:id/refresh', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const result = await refresher.refreshSeries(data)
  if (result.error) return res.json({ success: false, error: result.error, token: res.newToken })
  res.json({ success: true, ...result, token: res.newToken })
})

// --- Dashboard (Épica 5) ---
// Lee el estado actual (no bloquea con refresh). El scheduler actualiza en background.
app.get('/api/dashboard', [verifyToken, getUser, resolveUserId], async (_req, res) => {
  const { error, data } = await seriesItem.dashboardByUser(res.userId)
  if (error) return res.status(500).json({ error: 'Error fetching dashboard' })
  const items = (data || []).map(s => ({
    id: s.id,
    type: s.type,
    name: s.name,
    url: s.url,
    cover_url: s.cover_url,
    current_chapter: s.current_chapter,
    imdb_url: s.imdb_url,
    last_error: s.last_error,
    last_checked_at: s.last_checked_at,
    pending: s.pending,
    hasUpdates: s.pending > 0,
    last_item_title: s.last_item_title,
    last_item_date: s.last_item_date,
    last_item_link: s.last_item_link
  }))
  const totalPending = items.reduce((acc, s) => acc + s.pending, 0)
  const withUpdates = items.filter(s => s.hasUpdates).length
  res.json({
    data: items,
    summary: { totalPending, withUpdates, total: items.length },
    token: res.newToken
  })
})

// --- Detalle de serie (Épica 6) ---
// Feed de items de una serie (ordenados por pub_date DESC), con flag seen.
app.get('/api/series/:id/feed', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const onlyPending = req.query.pending === '1'
  const { error, data: items } = await seriesItem.listBySeries(req.params.id, { onlyPending })
  if (error) return res.status(500).json({ error })
  res.json({ data: items, token: res.newToken })
})

// Marca un item como visto (valida ownership del item vía su serie).
app.post('/api/series/:id/items/:itemId/seen', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const result = await seriesItem.markSeen(req.params.itemId, res.userId)
  if (result.error) return res.status(404).json({ error: 'Item not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

// Desmarca un item (visto -> pendiente). Ownership check igual que markSeen.
app.delete('/api/series/:id/items/:itemId/seen', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const result = await seriesItem.markUnseen(req.params.itemId, res.userId)
  if (result.error) return res.status(404).json({ error: 'Item not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

// Marca todos los items pendientes de una serie como vistos.
app.post('/api/series/:id/seen-all', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const result = await seriesItem.markAllSeen(req.params.id, res.userId)
  if (result.error) return res.status(500).json({ error: result.error })
  res.json({ success: true, updated: result.updated, token: res.newToken })
})

// --- Crunchyroll (sync externo, on-demand) ---
// El usuario pasa sus credenciales de Crunchyroll; no se persisten.
// Devuelve su watchlist normalizada (serie + último episodio visto / estado).
app.post('/api/crunchyroll/sync', [verifyToken, getUser], async (req, res) => {
  const { email, password } = req.body || {}
  const result = await crunchyroll.getWatchlist(email, password)
  if (result.error) return res.status(502).json({ error: result.error })
  res.json({ data: result.data, token: res.newToken })
})

export { app }

// Solo escucha cuando se ejecuta directamente (no al importarse en tests)
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  // Scheduler IMDB: refresh al boot + cada 6h (Épica 4, decisión 5)
  refresher.startScheduler({ runImmediately: true })
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  })
}
