// Smoke test para Épica 11: reels (watch-later).
// Cubre: POST/PUT/DELETE, seen/unsee, UNIQUE(user_id,url), ownership, summary.
// Correr desde backend/: node tests/smoke-reels.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import reel from '../src/models/reel.mjs'
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

// --- setup: dos usuarios para probar ownership ---
const stamp = Date.now()
const userA = `reel_${stamp}`
const userB = `reelb_${stamp}`
await user.signup(userA, 'pass')
await user.signup(userB, 'pass')
const tokenA = (await request('post', '/api/login', { username: userA, password: 'pass' })).data.token
const tokenB = (await request('post', '/api/login', { username: userB, password: 'pass' })).data.token

// --- 401 sin token ---
log('GET /api/reels sin token -> 401')
const noTok = await request('get', '/api/reels')
if (noTok.status !== 401) fail(`esperaba 401, vino ${noTok.status}`)

// --- GET lista vacía al principio ---
log('GET /api/reels lista vacía')
const empty = await request('get', '/api/reels', null, tokenA)
if (empty.status !== 200) fail(`status ${empty.status}`)
if (!Array.isArray(empty.data.data) || empty.data.data.length !== 0) fail('no es lista vacía')

// --- POST: url inválida -> 400 ---
log('POST /api/reels con url inválida -> 400')
const badUrl = await request('post', '/api/reels', { url: 'no-es-url' }, tokenA)
if (badUrl.status !== 400) fail(`esperaba 400 url inválida, vino ${badUrl.status}`)

// --- POST: url válida sin título (sin fetch real → title queda null) ---
log('POST /api/reels válido sin título')
const r1 = await request('post', '/api/reels', { url: 'https://fb.watch/abc123/' }, tokenA)
if (r1.status !== 200 || !r1.data.id) fail(`POST válido falló: ${r1.status} ${JSON.stringify(r1.data)}`)
const id1 = r1.data.id

// --- POST: con título explícito ---
log('POST /api/reels válido con título')
const r2 = await request('post', '/api/reels', {
  url: 'https://www.facebook.com/reel/123',
  title: 'Receta de pasta'
}, tokenA)
if (r2.status !== 200 || !r2.data.id) fail('POST con título falló')
if (r2.data.title !== 'Receta de pasta') fail(`title mal: ${r2.data.title}`)
const id2 = r2.data.id

// --- POST: misma URL otra vez -> skipped: true (UNIQUE user_id,url) ---
log('POST /api/reels misma URL -> skipped')
const dup = await request('post', '/api/reels', { url: 'https://fb.watch/abc123/' }, tokenA)
if (dup.status !== 200 || !dup.data.skipped) fail(`esperaba skipped:true, vino ${JSON.stringify(dup.data)}`)

// --- GET lista ahora tiene 2 ---
log('GET /api/reels trae 2 items')
const list = await request('get', '/api/reels', null, tokenA)
if (list.data.data.length !== 2) fail(`esperaba 2 reels, hay ${list.data.data.length}`)
// Orden: created_at DESC => el último creado (id2) primero
if (list.data.data[0].id !== id2) fail('orden esperado: id2 primero')

// pendingCountByUser directo sobre el modelo
const pc = await reel.pendingCountByUser((await user.getBy('username', userA)).data.id)
if (pc.data !== 2) fail(`pendingCountByUser esperaba 2, vino ${pc.data}`)

// --- PUT: editar url y título ---
log('PUT /api/reels/:id actualiza campos')
const upd = await request('put', `/api/reels/${id1}`, {
  url: 'https://fb.watch/abc123/v2',
  title: 'Nuevo título'
}, tokenA)
if (upd.status !== 200) fail(`PUT falló: ${upd.status} ${JSON.stringify(upd.data)}`)
const afterUpd = list.data.data.find(r => r.id === id1)
const listAfterUpd = await request('get', '/api/reels', null, tokenA)
const upd1 = listAfterUpd.data.data.find(r => r.id === id1)
if (upd1.title !== 'Nuevo título') fail(`title no actualizado: ${upd1.title}`)
if (upd1.url !== 'https://fb.watch/abc123/v2') fail('url no actualizada')

// --- PUT: title: null limpia el título ---
log('PUT /api/reels/:id con title=null limpia')
const clr = await request('put', `/api/reels/${id1}`, { title: null }, tokenA)
if (clr.status !== 200) fail(`PUT title=null falló: ${clr.status}`)
const clrList = await request('get', '/api/reels', null, tokenA)
if (clrList.data.data.find(r => r.id === id1).title !== null) fail('title debería ser null')

// --- PUT: fuera del whitelist (campo raro) -> 200 pero no persiste ---
log('PUT con campo fuera del whitelist se ignora')
const weird = await request('put', `/api/reels/${id1}`, { seen: 1, foo: 'bar' }, tokenA)
if (weird.status !== 200) fail(`PUT whitelist falló: ${weird.status}`)
const weirdList = await request('get', '/api/reels', null, tokenA)
const weirdItem = weirdList.data.data.find(r => r.id === id1)
if (weirdItem.seen !== 0) fail('seen no debería mutarse por PUT (fuera de whitelist)')

// --- POST /seen: marca visto, SIN cascada ---
log('POST /api/reels/:id/seen marca 1 solo (sin cascada)')
const seen1 = await request('post', `/api/reels/${id1}/seen`, null, tokenA)
if (seen1.status !== 200) fail(`seen falló: ${seen1.status}`)
const seenList = await request('get', '/api/reels', null, tokenA)
const seenItem1 = seenList.data.data.find(r => r.id === id1)
const seenItem2 = seenList.data.data.find(r => r.id === id2)
if (!seenItem1 || seenItem1.seen !== 1) fail('id1 debería estar seen=1')
if (!seenItem2 || seenItem2.seen !== 0) fail('id2 NO debería estar seen (sin cascada)')

// pendingCount ahora es 1 (id2 sigue pendiente)
const pc2 = await reel.pendingCountByUser((await user.getBy('username', userA)).data.id)
if (pc2.data !== 1) fail(`pendingCountByUser esperaba 1 tras seen, vino ${pc2.data}`)

// --- DELETE /seen: vuelve a pendiente ---
log('DELETE /api/reels/:id/seen vuelve a pendiente')
const unsee1 = await request('delete', `/api/reels/${id1}/seen`, null, tokenA)
if (unsee1.status !== 200) fail(`unsee falló: ${unsee1.status}`)
const unseeList = await request('get', '/api/reels', null, tokenA)
if (unseeList.data.data.find(r => r.id === id1).seen !== 0) fail('id1 debería volver a seen=0')

// --- Ownership: B no ve/edita/borra/marca reels de A (404 en todos) ---
log('Ownership: B no puede acceder a reels de A')
const bGet = await request('get', '/api/reels', null, tokenB)
if (bGet.data.data.length !== 0) fail('B no debería ver reels (lista vacía)')

const bPut = await request('put', `/api/reels/${id1}`, { title: 'hack' }, tokenB)
if (bPut.status !== 404) fail(`PUT de B sobre reel de A debería ser 404, vino ${bPut.status}`)

const bSeen = await request('post', `/api/reels/${id1}/seen`, null, tokenB)
if (bSeen.status !== 404) fail(`seen de B sobre reel de A debería ser 404, vino ${bSeen.status}`)

const bDel = await request('delete', `/api/reels/${id1}`, null, tokenB)
if (bDel.status !== 404) fail(`DELETE de B sobre reel de A debería ser 404, vino ${bDel.status}`)

// Verificamos que el reel de A sigue intacto
const intact = await request('get', '/api/reels', null, tokenA)
if (!intact.data.data.find(r => r.id === id1)) fail('reel de A fue afectado por B!')

// --- DELETE por el dueño ---
log('DELETE /api/reels/:id por el dueño')
const del1 = await request('delete', `/api/reels/${id1}`, null, tokenA)
if (del1.status !== 200) fail(`DELETE falló: ${del1.status}`)
const afterDel = await request('get', '/api/reels', null, tokenA)
if (afterDel.data.data.find(r => r.id === id1)) fail('reel debería estar borrado')

// --- Dashboard incluye reelsPending ---
log('GET /api/dashboard incluye summary.reelsPending')
const dash = await request('get', '/api/dashboard', null, tokenA)
if (dash.status !== 200) fail(`dashboard status ${dash.status}`)
if (dash.data.summary.reelsPending !== 1) fail(`reelsPending esperaba 1 (queda id2), vino ${dash.data.summary.reelsPending}`)

// --- Limpieza ---
await new Promise(r => server.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 11 FALLÓ ===')
} else {
  log('=== Smoke test Épica 11 OK ===')
}
db.close()
