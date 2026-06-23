import express from 'express'
import '../../dotenv.mjs'
import user from './models/user.mjs'
import series from './models/series.mjs'
import seriesItem from './models/series_item.mjs'
import reel from './models/reel.mjs'
import refresher from './refresher.mjs'
import Auth from './auth.mjs'
import * as crunchyroll from './crunchyroll.mjs'
import { CUSTOM_ADAPTER } from './sources/custom.mjs'
import { ready as dbReady } from './models/db.mjs'

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
const URL_FIELDS = ['url', 'cover_url']
const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\/.+/.test(v)

// Valida la shape de source_config (Épica 14). Devuelve array de mensajes.
//   { selector: string (req), url_attr?: string, label_attr?: string, reverse?: boolean }
const validateSourceConfig = (cfg) => {
  if (typeof cfg !== 'object' || Array.isArray(cfg) || cfg === null) {
    return ['source_config must be an object { selector, url_attr?, label_attr?, reverse? }']
  }
  const errs = []
  if (typeof cfg.selector !== 'string' || !cfg.selector.trim()) {
    errs.push('source_config.selector is required and must be a non-empty string')
  }
  if ('url_attr' in cfg && typeof cfg.url_attr !== 'string') errs.push('source_config.url_attr must be a string')
  if ('label_attr' in cfg && typeof cfg.label_attr !== 'string') errs.push('source_config.label_attr must be a string')
  if ('reverse' in cfg && typeof cfg.reverse !== 'boolean') errs.push('source_config.reverse must be a boolean')
  return errs
}

// Parsea source_config desde la DB (string JSON) a objeto. Null si está vacío
// o el JSON está corrupto. Usado en los GET para que el frontend reciba un
// objeto listo para usar (no un string crudo).
const parseSourceConfig = (raw) => {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}

// Devuelve array de mensajes de error. `partial=true` permite omitir campos (PUT).
// Reglas de feed por type (Épica 9):
//  - anime: solo imdb_url; rss_url rechazado.
//  - manga: solo rss_url; imdb_url rechazado.
// source_config (Épica 14): sólo manga, requiere rss_url, shape válida.
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
  // Feed por tipo
  const type = body.type
  const isAnime = type === 'anime'
  const isManga = type === 'manga'
  if (has('imdb_url') && body.imdb_url !== '' && body.imdb_url != null) {
    if (!isHttpUrl(body.imdb_url)) errors.push('imdb_url must be an http(s) URL')
    if (isManga) errors.push('imdb_url is only for anime; manga uses rss_url')
  }
  if (has('rss_url') && body.rss_url !== '' && body.rss_url != null) {
    if (!isHttpUrl(body.rss_url)) errors.push('rss_url must be an http(s) URL')
    if (isAnime) errors.push('rss_url is only for manga; anime uses imdb_url')
  }
  // source_config (Épica 14): sólo manga, requiere rss_url no-vacío, shape válida.
  if (has('source_config') && body.source_config != null) {
    if (isAnime) {
      errors.push('source_config is only for manga; anime uses imdb_url')
    } else if (isManga) {
      const rssEmpty = !has('rss_url') || !body.rss_url || !String(body.rss_url).trim()
      if (rssEmpty) errors.push('source_config requires a feed URL (rss_url)')
      errors.push(...validateSourceConfig(body.source_config))
    }
  }
  if (has('current_chapter')) {
    // Épica 10: current_chapter fue eliminado. Se ignora silenciosamente
    // en PUT para no romper clientes cacheados; no se valida ni persiste.
  }
  if (has('last_read')) {
    if (body.last_read !== null && typeof body.last_read !== 'string') {
      errors.push('last_read must be a string or null')
    }
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
  // Feed por tipo: solo se persiste el campo que corresponde al type.
  const isAnime = req.body.type === 'anime'
  const payload = {
    type: req.body.type,
    name: req.body.name.trim(),
    url: req.body.url || null,
    cover_url: req.body.cover_url || null,
    last_read: req.body.last_read || null,
    imdb_url: isAnime ? (req.body.imdb_url || null) : null,
    rss_url: isAnime ? null : (req.body.rss_url || null),
    // Épica 14: source_config se persiste como string JSON.
    source_config: isAnime ? null : (req.body.source_config ? JSON.stringify(req.body.source_config) : null)
  }
  const { error, id } = await series.create(res.userId, payload)
  if (error) return res.status(500).json({ error })
  res.json({ success: true, id, token: res.newToken })
})

app.get('/api/series/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { error, data } = await series.getById(req.params.id, res.userId)
  if (error) return res.status(500).json({ error })
  if (!data) return res.status(404).json({ error: 'Series not found' })
  data.source_config = parseSourceConfig(data.source_config)
  res.json({ data, token: res.newToken })
})

app.put('/api/series/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const errors = validateSeries(req.body, true)
  if (errors.length) return res.status(400).json({ error: errors.join('; ') })
  // Determinar el tipo efectivo (del body si cambia, o del valor existente).
  // Así podemos forzar a null el campo del otro tipo y mantener el dispatch limpio.
  const { data: existing } = await series.getById(req.params.id, res.userId)
  if (!existing) return res.status(404).json({ error: 'Series not found or not owned' })
  const effectiveType = req.body.type || existing.type
  const isAnime = effectiveType === 'anime'
  const fields = { ...req.body }
  if (isAnime) {
    fields.imdb_url = req.body.imdb_url !== undefined ? (req.body.imdb_url || null) : existing.imdb_url
    fields.rss_url = null
    fields.source_config = null
  } else {
    fields.rss_url = req.body.rss_url !== undefined ? (req.body.rss_url || null) : existing.rss_url
    fields.imdb_url = null
    // Épica 14: source_config se persiste como string JSON.
    fields.source_config = req.body.source_config !== undefined
      ? (req.body.source_config ? JSON.stringify(req.body.source_config) : null)
      : existing.source_config
  }
  const { error } = await series.update(req.params.id, res.userId, fields)
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
  // Épica 11: conteo de reels pendientes para el card de Reels.
  const reelsRes = await reel.pendingCountByUser(res.userId)
  const reelsPending = reelsRes.data || 0
  const items = (data || []).map(s => ({
    id: s.id,
    type: s.type,
    name: s.name,
    url: s.url,
    cover_url: s.cover_url,
    last_read: s.last_read,
    imdb_url: s.imdb_url,
    rss_url: s.rss_url,
    source_config: parseSourceConfig(s.source_config),
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
    summary: { totalPending, withUpdates, total: items.length, reelsPending },
    token: res.newToken
  })
})

// --- Sources preview (Épica 14) ---
// Dry-run del adapter custom: fetchea la URL, aplica la config y devuelve los
// items en orden newest-first (como el feed). No persiste nada.
app.post('/api/sources/preview', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { url, config } = req.body || {}
  if (!url || !isHttpUrl(url)) return res.status(400).json({ error: 'url must be an http(s) URL' })
  const cfgErrors = validateSourceConfig(config)
  if (cfgErrors.length) return res.status(400).json({ error: cfgErrors.join('; ') })
  try {
    const result = await CUSTOM_ADAPTER.preview(url, config)
    res.json({ ...result, token: res.newToken })
  } catch (err) {
    res.status(400).json({ error: err?.message || String(err) })
  }
})

// --- Reels (Épica 11) ---
// Watch-later / ToDo de URLs (típicamente reels de FB). Independiente del
// modelo de series: sin feed, sin cascada al marcar visto, sin last_read.
// Todas las rutas filtran por res.userId (aislamiento multiusuario).

const validateReel = (body, partial = false) => {
  const errors = []
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k)
  if (!partial || has('url')) {
    if (!isHttpUrl(body.url)) errors.push('url must be an http(s) URL')
  }
  if (has('title') && body.title !== null) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      errors.push('title must be a non-empty string or null')
    }
  }
  return errors
}

app.get('/api/reels', [verifyToken, getUser, resolveUserId], async (_req, res) => {
  const { error, data } = await reel.listByUser(res.userId)
  if (error) return res.status(500).json({ error: 'Error fetching reels' })
  res.json({ data, token: res.newToken })
})

app.post('/api/reels', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const errors = validateReel(req.body)
  if (errors.length) return res.status(400).json({ error: errors.join('; ') })
  const url = req.body.url.trim()
  const title = req.body.title != null ? req.body.title.trim() : null
  const result = await reel.create(res.userId, { url, title })
  if (result.error) return res.status(500).json({ error: result.error })
  if (result.skipped) return res.json({ skipped: true, token: res.newToken })
  res.json({ id: result.id, title, token: res.newToken })
})

app.put('/api/reels/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const errors = validateReel(req.body, true)
  if (errors.length) return res.status(400).json({ error: errors.join('; ') })
  const fields = {}
  if (Object.prototype.hasOwnProperty.call(req.body, 'url')) {
    fields.url = req.body.url.trim()
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    // Permitimos title: null explícito para "limpiar" el título.
    fields.title = req.body.title != null ? req.body.title.trim() : null
  }
  const { error } = await reel.update(req.params.id, res.userId, fields)
  if (error) return res.status(404).json({ error: 'Reel not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

app.delete('/api/reels/:id', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { error } = await reel.remove(req.params.id, res.userId)
  if (error) return res.status(404).json({ error: 'Reel not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

// Marca un reel como visto. SIN cascada: sólo el item indicado cambia.
app.post('/api/reels/:id/seen', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { error } = await reel.markSeen(req.params.id, res.userId)
  if (error) return res.status(404).json({ error: 'Reel not found or not owned' })
  res.json({ success: true, token: res.newToken })
})

// Desmarca un reel (visto -> pendiente). SIN cascada.
app.delete('/api/reels/:id/seen', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { error } = await reel.markUnseen(req.params.id, res.userId)
  if (error) return res.status(404).json({ error: 'Reel not found or not owned' })
  res.json({ success: true, token: res.newToken })
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

// Marca un item como visto (en cascada: también los anteriores). Ownership vía JOIN.
app.post('/api/series/:id/items/:itemId/seen', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const result = await seriesItem.markSeen(req.params.itemId, res.userId)
  if (result.error) return res.status(404).json({ error: 'Item not found or not owned' })
  res.json({ success: true, updated: result.updated, token: res.newToken })
})

// Desmarca un item (en cascada: también los posteriores). Ownership check igual que markSeen.
app.delete('/api/series/:id/items/:itemId/seen', [verifyToken, getUser, resolveUserId], async (req, res) => {
  const { data } = await series.getById(req.params.id, res.userId)
  if (!data) return res.status(404).json({ error: 'Series not found or not owned' })
  const result = await seriesItem.markUnseen(req.params.itemId, res.userId)
  if (result.error) return res.status(404).json({ error: 'Item not found or not owned' })
  res.json({ success: true, updated: result.updated, token: res.newToken })
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
// Cada request crea su propia instancia de CrunchyrollClient, así que los
// tokens no se pisan entre usuarios. Devuelve su watchlist normalizada.
app.post('/api/crunchyroll/sync', [verifyToken, getUser], async (req, res) => {
  const { email, password } = req.body || {}
  try {
    const data = await crunchyroll.getWatchlist(email, password)
    res.json({ data, token: res.newToken })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Resuelve nombre + temporada a ttId/poster/imdbUrl de IMDB, para pre-poblar
// el alta de series desde el listado de Crunchyroll. No requiere credenciales.
app.get('/api/crunchyroll/resolve', [verifyToken, getUser], async (req, res) => {
  const { name, season } = req.query
  const result = await crunchyroll.resolveImdb(name, season)
  if (result.error) return res.status(404).json({ error: result.error })
  res.json({ data: result, token: res.newToken })
})

export { app }

// PM2 en fork mode envuelve el script y cambia process.argv[1], rompiendo el
// check clásico process.argv[1] === import.meta.url. En su lugar, no servimos
// cuando el entry point es un smoke test (estos importan { app } y levantan su
// propio servidor en puerto efímero).
const shouldServe = !(process.argv[1] || '').includes('tests/')
if (shouldServe) {
  // Espera a que el schema esté listo antes de arrancar el scheduler, para
  // evitar el race condition donde refreshAll corre antes de que las tablas
  // existan (fallaba con "no such table: series").
  dbReady.finally(() => {
    // Scheduler IMDB: refresh al boot + cada 6h (Épica 4, decisión 5)
    refresher.startScheduler({ runImmediately: true })
  })
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} (pid ${process.pid})`)
  })
  // Sin esto, un error de bind (EADDRINUSE, permisos) muere silenciosamente
  // y PM2 puede quedar mostrando el proceso como "online" sin escuchar.
  server.on('error', (err) => {
    console.error(`[listen] error on port ${PORT}:`, err.code || err.message)
    process.exit(1)
  })
}
