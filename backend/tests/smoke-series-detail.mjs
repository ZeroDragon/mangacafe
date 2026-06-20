// Smoke test para Épica 6: detalle de serie + feed + marcar item visto + seen-all con ownership.
// Correr desde backend/: node tests/smoke-series-detail.mjs
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

const stamp = Date.now()
const usernameA = `det_${stamp}`
const usernameB = `other_${stamp}`
await user.signup(usernameA, 'pass')
await user.signup(usernameB, 'pass')
const { data: uA } = await user.getBy('username', usernameA)
const { data: uB } = await user.getBy('username', usernameB)

// Serie de A con 3 items (orden: 103, 102, 101 por pub_date DESC)
const s1 = await series.create(uA.id, {
  type: 'manga', name: 'Detalle', url: 'http://leer.com', cover_url: 'http://img.com/x.jpg',
  current_chapter: 100, rss_url: 'http://feed.com/rss'
})
await seriesItem.insertMany(s1.id, [
  { guid: 'a1', title: 'Cap 101', link: 'http://leer.com/101', pub_date: 1700000000 },
  { guid: 'a2', title: 'Cap 102', link: 'http://leer.com/102', pub_date: 1700001000 },
  { guid: 'a3', title: 'Cap 103', link: 'http://leer.com/103', pub_date: 1700002000 }
])

// Serie de B (para ownership)
const sB = await series.create(uB.id, {
  type: 'anime', name: 'Serie B', url: null, cover_url: null, current_chapter: 0, rss_url: null
})

const tokenA = (await request('post', '/api/login', { username: usernameA, password: 'pass' })).data.token
const tokenB = (await request('post', '/api/login', { username: usernameB, password: 'pass' })).data.token

// --- GET /api/series/:id/feed ---
log('GET /api/series/:id/feed sin token -> 401')
const noTok = await request('get', `/api/series/${s1.id}/feed`)
if (noTok.status !== 401) fail(`esperaba 401, vino ${noTok.status}`)

log('GET feed: 3 items ordenados por pub_date DESC')
const feedRes = await request('get', `/api/series/${s1.id}/feed`, null, tokenA)
if (feedRes.status !== 200) fail(`status ${feedRes.status}`)
const items = feedRes.data.data
if (items.length !== 3) fail(`esperaba 3 items, hay ${items.length}`)
if (items[0].title !== 'Cap 103') fail(`orden mal, primer item: ${items[0].title}`)
if (items[2].title !== 'Cap 101') fail(`ultimo item mal: ${items[2].title}`)
if (items.some(i => i.seen === 1)) fail('todos deberían estar seen=0')
log('  feed OK (3 items ordenados DESC)')

log('GET feed serie ajena -> 404')
const otherFeed = await request('get', `/api/series/${s1.id}/feed`, null, tokenB)
if (otherFeed.status !== 404) fail(`esperaba 404 feed serie ajena, vino ${otherFeed.status}`)
log('  ownership OK')

log('GET feed inexistente -> 404')
const missFeed = await request('get', '/api/series/99999999/feed', null, tokenA)
if (missFeed.status !== 404) fail(`esperaba 404, vino ${missFeed.status}`)

log('GET feed ?pending=1 antes de marcar (3 items)')
const pend1 = await request('get', `/api/series/${s1.id}/feed?pending=1`, null, tokenA)
if (pend1.data.data.length !== 3) fail(`pending=1 esperaba 3, hay ${pend1.data.data.length}`)

// --- POST /api/series/:id/items/:itemId/seen ---
log('POST item seen: marcar el 101 (último en orden)')
const item101 = items.find(i => i.guid === 'a1')
const seenRes = await request('post', `/api/series/${s1.id}/items/${item101.id}/seen`, null, tokenA)
if (seenRes.status !== 200) fail(`status ${seenRes.status}`)

log('Verificar que ya no está en ?pending=1')
const pend2 = await request('get', `/api/series/${s1.id}/feed?pending=1`, null, tokenA)
if (pend2.data.data.length !== 2) fail(`esperaba 2 pendientes, hay ${pend2.data.data.length}`)
if (pend2.data.data.some(i => i.id === item101.id)) fail('item marcado sigue apareciendo como pendiente')
log('  marcar item visto OK')

log('POST item seen con item de otra serie (item de B) -> 404')
const itemB = (await request('get', `/api/series/${sB.id}/feed`, null, tokenB)).data.data
// Insertamos un item en sB para probar
await seriesItem.insertMany(sB.id, [{ guid: 'bx', title: 'B item', link: '', pub_date: 1700000000 }])
const bItems = (await request('get', `/api/series/${sB.id}/feed`, null, tokenB)).data.data
const bItem = bItems[0]
// A intenta marcar un item de B
const steal = await request('post', `/api/series/${sB.id}/items/${bItem.id}/seen`, null, tokenA)
if (steal.status !== 404) fail(`esperaba 404 item ajeno, vino ${steal.status}`)
log('  ownership item OK (A no puede marcar item de B)')

// Pero B sí puede marcar el suyo
const bSeen = await request('post', `/api/series/${sB.id}/items/${bItem.id}/seen`, null, tokenB)
if (bSeen.status !== 200) fail(`B no pudo marcar su item: ${bSeen.status}`)

log('POST item seen sobre item inexistente -> 404')
const missItem = await request('post', `/api/series/${s1.id}/items/99999999/seen`, null, tokenA)
if (missItem.status !== 404) fail(`esperaba 404 item inexistente, vino ${missItem.status}`)

// --- POST /api/series/:id/seen-all ---
log('POST seen-all: marca los 2 pendientes restantes')
const allSeen = await request('post', `/api/series/${s1.id}/seen-all`, null, tokenA)
if (allSeen.status !== 200) fail(`status ${allSeen.status}`)
if (allSeen.data.updated !== 2) fail(`esperaba updated=2, vino ${allSeen.data.updated}`)

log('Verificar ?pending=1 ahora vacío')
const pend3 = await request('get', `/api/series/${s1.id}/feed?pending=1`, null, tokenA)
if (pend3.data.data.length !== 0) fail(`esperaba 0 pendientes, hay ${pend3.data.data.length}`)
log('  seen-all OK')

log('seen-all sobre serie ajena -> 404')
const bSeenAll = await request('post', `/api/series/${s1.id}/seen-all`, null, tokenB)
if (bSeenAll.status !== 404) fail(`esperaba 404 seen-all serie ajena, vino ${bSeenAll.status}`)

// --- Limpieza ---
await new Promise(r => server.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 6 FALLÓ ===')
} else {
  log('=== Smoke test Épica 6 OK ===')
}
db.close()
