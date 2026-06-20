// Smoke test para Épica 5: dashboard.
// Cubre GET /api/dashboard (agregado + summary) y POST /api/series/:id/seen-all.
// Correr desde backend/: node tests/smoke-dashboard.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import series from '../src/models/series.mjs'
import seriesItem from '../src/models/series_item.mjs'
import { app } from '../src/index.mjs'

await ready

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

const server = http.createServer(app)
await new Promise(r => server.listen(0, r))
const baseURL = `http://localhost:${server.address().port}`
const request = (method, path, body, token) => axios({
  method, url: baseURL + path, data: body,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true
})

// --- setup: usuario A con 3 series (varios items), usuario B aislado ---
const stamp = Date.now()
const username = `dash_${stamp}`
await user.signup(username, 'pass')
const { data: u } = await user.getBy('username', username)

// Serie 1: con 3 items pendientes
const s1 = await series.create(u.id, {
  type: 'manga', name: 'Con pendientes', url: null, cover_url: null,
  current_chapter: 100, rss_url: null
})
await seriesItem.insertMany(s1.id, [
  { guid: 'a1', title: 'Cap 101', link: 'http://x/1', pub_date: 1700000000 },
  { guid: 'a2', title: 'Cap 102', link: 'http://x/2', pub_date: 1700001000 },
  { guid: 'a3', title: 'Cap 103', link: 'http://x/3', pub_date: 1700002000 }
])

// Serie 2: con 1 item pendiente
const s2 = await series.create(u.id, {
  type: 'anime', name: 'Un pendiente', url: null, cover_url: null,
  current_chapter: 5, rss_url: null
})
await seriesItem.insertMany(s2.id, [
  { guid: 'b1', title: 'Ep 6', link: 'http://x/6', pub_date: 1700003000 }
])

// Serie 3: sin items
const s3 = await series.create(u.id, {
  type: 'manga', name: 'Sin items', url: null, cover_url: null,
  current_chapter: 0, rss_url: null
})

// Serie 4: con error de RSS para verificar visibilidad
const s4 = await series.create(u.id, {
  type: 'manga', name: 'Con error', url: null, cover_url: null,
  current_chapter: 0, rss_url: 'http://invalido.invalid/feed'
})
await series.update(s4.id, u.id, { last_error: 'ETIMEDOUT', last_checked_at: 1700005000 })

// Usuario B con su propia serie
const other = `other_${stamp}`
await user.signup(other, 'pass')

const loginA = await request('post', '/api/login', { username, password: 'pass' })
const tokenA = loginA.data.token
const loginB = await request('post', '/api/login', { username: other, password: 'pass' })
const tokenB = loginB.data.token

// --- GET /api/dashboard ---
log('GET /api/dashboard sin token -> 401')
const noTok = await request('get', '/api/dashboard')
if (noTok.status !== 401) fail(`esperaba 401, vino ${noTok.status}`)

log('GET /api/dashboard usuario A')
const dash = await request('get', '/api/dashboard', null, tokenA)
if (dash.status !== 200) fail(`status ${dash.status}`)
const items = dash.data.data
if (!Array.isArray(items) || items.length !== 4) fail(`esperaba 4 series, hay ${items.length}`)
if (!dash.data.token) fail('falta token rotado')

// summary
const sum = dash.data.summary
log(`summary: totalPending=${sum.totalPending} withUpdates=${sum.withUpdates} total=${sum.total}`)
if (sum.totalPending !== 4) fail(`esperaba totalPending=4, vino ${sum.totalPending}`)
if (sum.withUpdates !== 2) fail(`esperaba withUpdates=2, vino ${sum.withUpdates}`)
if (sum.total !== 4) fail(`esperaba total=4, vino ${sum.total}`)

// Orden: pendientes primero
if (items[0].pending < items[1].pending) fail('no está ordenado por pending DESC')

// Serie con error visible
const conError = items.find(s => s.name === 'Con error')
if (!conError) fail('serie "Con error" no aparece')
if (conError.last_error !== 'ETIMEDOUT') fail(`last_error mal: ${conError.last_error}`)
if (conError.last_checked_at !== 1700005000) fail('last_checked_at mal')

// hasUpdates + last_item_title/date
const conPend = items.find(s => s.name === 'Con pendientes')
if (!conPend.hasUpdates) fail('hasUpdates debería ser true')
if (conPend.pending !== 3) fail(`pending mal: ${conPend.pending}`)
if (conPend.last_item_title !== 'Cap 103') fail(`last_item_title mal: ${conPend.last_item_title}`)
if (!conPend.last_item_link) fail('falta last_item_link')

// Serie sin items: hasUpdates false
const sinItems = items.find(s => s.name === 'Sin items')
if (sinItems.hasUpdates) fail('sin items debería tener hasUpdates=false')
if (sinItems.pending !== 0) fail('pending debería ser 0')
log('  dashboard OK (4 series, summary correcto, error visible, last_item)')

// --- Ownership: B no ve las series de A ---
log('Ownership: dashboard de B no tiene series de A')
const dashB = await request('get', '/api/dashboard', null, tokenB)
const idsA = items.map(s => s.id)
const idsB = dashB.data.data.map(s => s.id)
const leak = idsB.some(id => idsA.includes(id))
if (leak) fail('series de A aparecen en dashboard de B!')
log('  ownership OK')

// --- POST /api/series/:id/seen-all ---
log('POST /api/series/:id/seen-all: marca 3 items como vistos')
const seenRes = await request('post', `/api/series/${s1.id}/seen-all`, null, tokenA)
if (seenRes.status !== 200) fail(`status ${seenRes.status}`)
if (seenRes.data.updated !== 3) fail(`esperaba updated=3, vino ${seenRes.data.updated}`)

log('Dashboard de A tras seen-all: pending=0 en s1')
const dash2 = await request('get', '/api/dashboard', null, tokenA)
const s1after = dash2.data.data.find(s => s.id === s1.id)
if (s1after.pending !== 0) fail(`pending debería ser 0 tras seen-all, vino ${s1after.pending}`)
if (s1after.hasUpdates) fail('hasUpdates debería ser false tras seen-all')
if (sum.totalPending - 3 !== dash2.data.summary.totalPending) fail('summary.totalPending mal tras seen-all')
log('  seen-all OK (pending=0, summary actualizado)')

log('seen-all sobre serie ajena -> 404')
const bSeen = await request('post', `/api/series/${s1.id}/seen-all`, null, tokenB)
if (bSeen.status !== 404) fail(`esperaba 404 seen-all serie ajena, vino ${bSeen.status}`)
log('  ownership seen-all OK (404)')

// --- Limpieza ---
await new Promise(r => server.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 5 FALLÓ ===')
} else {
  log('=== Smoke test Épica 5 OK ===')
}
db.close()
