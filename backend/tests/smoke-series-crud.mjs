// Smoke test para Épica 3: CRUD de series vía HTTP.
// Cubre: auth, validación, ownership (aislamiento multiusuario), rotación de token.
// Correr desde backend/: node tests/smoke-series-crud.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import { app } from '../src/index.mjs'

await ready // garantiza que el schema está creado antes de queryar

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

// Levanta la app en un puerto aleatorio sin tocar el .env
const server = http.createServer(app)
await new Promise(resolve => server.listen(0, resolve))
const port = server.address().port
const baseURL = `http://localhost:${port}`

const request = (method, path, body, token) => axios({
  method,
  url: baseURL + path,
  data: body,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true // no lanzar: devolvemos el status para asserts
})

// --- Setup: dos usuarios para probar ownership ---
const stamp = Date.now()
const userA = `a_${stamp}`
const userB = `b_${stamp}`
await user.signup(userA, 'pass')
await user.signup(userB, 'pass')

const loginA = await request('post', '/api/login', { username: userA, password: 'pass' })
const loginB = await request('post', '/api/login', { username: userB, password: 'pass' })
if (loginA.status !== 200 || !loginA.data.token) fail('login A no devolvió token')
if (loginB.status !== 200 || !loginB.data.token) fail('login B no devolvió token')
const tokenA = loginA.data.token
const tokenB = loginB.data.token
log(`Login OK para ${userA} y ${userB}`)

// --- 401 sin token ---
log('GET /api/series sin token -> 401')
const noToken = await request('get', '/api/series')
if (noToken.status !== 401) fail(`esperaba 401 sin token, vino ${noToken.status}`)

// --- 403 con token inválido ---
log('GET /api/series con token inválido -> 403')
const badToken = await request('get', '/api/series', null, 'token.invalido.x')
if (badToken.status !== 403) fail(`esperaba 403 con token inválido, vino ${badToken.status}`)

// --- Lista vacía al principio ---
log('GET /api/series lista vacía')
const emptyList = await request('get', '/api/series', null, tokenA)
if (emptyList.status !== 200) fail(`esperaba 200, vino ${emptyList.status}`)
if (!Array.isArray(emptyList.data.data)) fail('data no es array')
if (emptyList.data.data.length !== 0) fail('esperaba lista vacía')
if (!emptyList.data.token) fail('falta token rotado en respuesta')

// --- POST: type inválido -> 400 ---
log('POST /api/series con type inválido -> 400')
const badType = await request('post', '/api/series', { type: 'novela', name: 'X' }, tokenA)
if (badType.status !== 400) fail(`esperaba 400 type inválido, vino ${badType.status}`)

// --- POST: name vacío -> 400 ---
log('POST /api/series con name vacío -> 400')
const badName = await request('post', '/api/series', { type: 'manga', name: '   ' }, tokenA)
if (badName.status !== 400) fail(`esperaba 400 name vacío, vino ${badName.status}`)

// --- POST: URL inválida -> 400 ---
log('POST /api/series con cover_url inválida -> 400')
const badUrl = await request('post', '/api/series', { type: 'manga', name: 'X', cover_url: 'no-es-url' }, tokenA)
if (badUrl.status !== 400) fail(`esperaba 400 cover_url inválida, vino ${badUrl.status}`)

// --- POST: last_read no-string -> 400 ---
log('POST /api/series con last_read numérico -> 400')
const badChap = await request('post', '/api/series', { type: 'manga', name: 'X', last_read: 123 }, tokenA)
if (badChap.status !== 400) fail(`esperaba 400 last_read no-string, vino ${badChap.status}`)

// --- POST: válido -> 200 con id + token rotado ---
// Épica 9: manga usa rss_url (no imdb_url). El smoke original usaba imdb_url,
// pero el dispatch por type lo rechaza ahora.
log('POST /api/series válido (manga)')
const created = await request('post', '/api/series', {
  type: 'manga',
  name: ' One Punch Man ', // verificamos trim
  url: 'https://manga.example.com/opm',
  cover_url: 'https://cdn.example.com/opm.jpg',
  rss_url: 'https://manga.example.com/opm/feed.xml'
}, tokenA)
if (created.status !== 200 || !created.data.id) fail('POST válido falló: ' + JSON.stringify(created.data))
const seriesIdA = created.data.id
log(`Serie creada id=${seriesIdA}`)

// --- POST: válido anime, sin imdb_url ---
log('POST /api/series válido (anime, sin imdb)')
const created2 = await request('post', '/api/series', {
  type: 'anime',
  name: 'Frieren'
}, tokenA)
if (created2.status !== 200 || !created2.data.id) fail('POST válido anime falló')
const seriesIdA2 = created2.data.id

// --- GET lista ahora tiene 2, y el nombre está trimmeado ---
log('GET /api/series trae 2 y trimea name')
const list = await request('get', '/api/series', null, tokenA)
if (list.data.data.length !== 2) fail(`esperaba 2 series, hay ${list.data.data.length}`)
const opm = list.data.data.find(s => s.id === seriesIdA)
if (!opm) fail('no encontré la serie creada')
if (opm.name !== 'One Punch Man') fail(`name no fue trimeado: "${opm.name}"`)
if (opm.pending !== 0) fail(`pending debería ser 0 (sin items), vino ${opm.pending}`)
if (opm.type !== 'manga') fail('type mal')
if (opm.rss_url !== 'https://manga.example.com/opm/feed.xml') fail('rss_url mal')

// --- GET detalle ---
log('GET /api/series/:id detalle')
const detail = await request('get', `/api/series/${seriesIdA}`, null, tokenA)
if (detail.status !== 200) fail(`detalle status ${detail.status}`)
if (detail.data.data.name !== 'One Punch Man') fail('detalle name mal')

// --- GET detalle con id inexistente -> 404 ---
log('GET /api/series/99999999 (inexistente) -> 404')
const missing = await request('get', '/api/series/99999999', null, tokenA)
if (missing.status !== 404) fail(`esperaba 404, vino ${missing.status}`)

// --- PUT: actualiza last_read y rss_url ---
log('PUT /api/series/:id actualiza campos')
const updated = await request('put', `/api/series/${seriesIdA}`, {
  last_read: 'Cap 102',
  rss_url: 'https://manga.example.com/opm/v2.xml'
}, tokenA)
if (updated.status !== 200) fail(`PUT falló: ${updated.status} ${JSON.stringify(updated.data)}`)
const afterUpd = await request('get', `/api/series/${seriesIdA}`, null, tokenA)
if (afterUpd.data.data.last_read !== 'Cap 102') fail('last_read no actualizado')
if (afterUpd.data.data.rss_url !== 'https://manga.example.com/opm/v2.xml') fail('rss_url no actualizado')

// --- PUT: current_chapter (legacy, de cliente viejo) se ignora silenciosamente ---
log('PUT con current_chapter (legacy) -> 200, se ignora')
const legacyPut = await request('put', `/api/series/${seriesIdA}`, { current_chapter: 999 }, tokenA)
if (legacyPut.status !== 200) fail(`legacy PUT debería ser 200, vino ${legacyPut.status}`)

// --- PUT: type inválido -> 400 ---
log('PUT con type inválido -> 400')
const badPutType = await request('put', `/api/series/${seriesIdA}`, { type: 'novela' }, tokenA)
if (badPutType.status !== 400) fail(`esperaba 400 PUT type inválido, vino ${badPutType.status}`)

// === Ownership: usuario B no puede ver/editar/borrar la serie de A ===
log('Ownership: usuario B no ve serie de A (GET detalle -> 404)')
const bGetDetail = await request('get', `/api/series/${seriesIdA}`, null, tokenB)
if (bGetDetail.status !== 404) fail(`B no debería ver serie de A: ${bGetDetail.status}`)

log('Ownership: B no ve la serie en su lista')
const bList = await request('get', '/api/series', null, tokenB)
if (bList.data.data.find(s => s.id === seriesIdA)) fail('serie de A aparece en lista de B')

log('Ownership: B no puede PUT la serie de A -> 404')
const bPut = await request('put', `/api/series/${seriesIdA}`, { last_read: 'hack' }, tokenB)
if (bPut.status !== 404) fail(`esperaba 404 PUT de B sobre serie de A, vino ${bPut.status}`)
// verificamos que el PUT de B no haya modificado nada
const stillA = await request('get', `/api/series/${seriesIdA}`, null, tokenA)
if (stillA.data.data.last_read !== 'Cap 102') fail('PUT de B modificó la serie de A!')

log('Ownership: B no puede DELETE la serie de A -> 404')
const bDel = await request('delete', `/api/series/${seriesIdA}`, null, tokenB)
if (bDel.status !== 404) fail(`esperaba 404 DELETE de B sobre serie de A, vino ${bDel.status}`)

// Verificamos que la serie sigue existiendo para A
const stillThere = await request('get', `/api/series/${seriesIdA}`, null, tokenA)
if (stillThere.status !== 200) fail('la serie fue borrada por B!')

// --- DELETE por el dueño ---
log('DELETE /api/series/:id por el dueño')
const deleted = await request('delete', `/api/series/${seriesIdA}`, null, tokenA)
if (deleted.status !== 200) fail(`DELETE falló: ${deleted.status}`)
const afterDel = await request('get', `/api/series/${seriesIdA}`, null, tokenA)
if (afterDel.status !== 404) fail('serie debería estar borrada')

// --- Rotación de token en cada respuesta protegida ---
log('Token rotado en respuestas protegidas')
const refreshed = await request('get', '/api/series', null, tokenA)
if (!refreshed.data.token) fail('falta token rotado')
// (no comparamos string porque el timestamp interno puede variar en ms)

// Limpieza
await new Promise(r => server.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 3 FALLÓ ===')
} else {
  log('=== Smoke test Épica 3 OK ===')
}
db.close()
