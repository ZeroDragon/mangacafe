// Smoke test para Épica 4: scraper de IMDB.
// Levanta un mini servidor HTTP que simula api.graphql.imdb.com (devuelve JSON
// con la forma de la query de episodios) y ejercita fetchEpisodes +
// refreshSeries + endpoints on-demand + dedupe + last_error + filtrado de
// episodios no emitidos.
// Correr desde backend/: node tests/smoke-imdb-engine.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import series from '../src/models/series.mjs'
import seriesItem from '../src/models/series_item.mjs'
import fetchEpisodes, { parseImdbUrl } from '../src/imdb.mjs'
import refresher from '../src/refresher.mjs'
import { app } from '../src/index.mjs'

await ready

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

// --- Mini servidor que simula api.graphql.imdb.com ---
// Respuestas keyeadas por `${titleId}:${season}`. Si el value es función, se
// evalúa en cada request (para feeds dinámicos). El body es la "data" GraphQL
// (lo que va dentro de { data: ... }). Para simular error HTTP, value = { _http: 500 }.
// Para simular errores GraphQL, value = { _gqlErrors: [...] }.
const RESPONSES = {}
const gqlServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    let parsed = {}
    try { parsed = JSON.parse(body || '{}') } catch (_) { /* ignore */ }
    const vars = parsed.variables || {}
    const key = `${vars.titleId}:${vars.season}`
    const entry = RESPONSES[key]
    if (entry == null) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({}))
    }
    const value = typeof entry === 'function' ? entry() : entry
    if (value && value._http) {
      res.writeHead(value._http, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ message: 'boom' }))
    }
    const payload = value && value._gqlErrors
      ? { errors: value._gqlErrors }
      : { data: value }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
})
await new Promise(r => gqlServer.listen(0, r))
const gqlPort = gqlServer.address().port
const gqlURL = `http://localhost:${gqlPort}/`
process.env.IMDB_GRAPHQL_ENDPOINT = gqlURL
const imdbURL = (titleId, season) => `https://www.imdb.com/title/${titleId}/episodes/?season=${season}`

// Helper para construir la "data" GraphQL con N episodios.
// Usa fechas FIJAS (pasado lejano / futuro lejano) en vez de "ahora", para que
// el filtrado de emitido-vs-futuro sea determinista e independiente de la zona
// horaria en la que corra el test.
const seasonData = (titleId, count, { futureEp = false, noDateEp = false } = {}) => {
  const edges = []
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(2020, 0, i)) // 2020-01-0i
    edges.push({
      position: i,
      node: {
        id: `${titleId}-e${i}`,
        titleText: { text: `Episodio ${i}` },
        canonicalUrl: `https://www.imdb.com/title/${titleId}-e${i}/`,
        releaseDate: { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }
      }
    })
  }
  if (futureEp) {
    const d = new Date(Date.UTC(2099, 0, 1))
    edges.push({
      position: count + 1,
      node: {
        id: `${titleId}-eFUT`,
        titleText: { text: 'Episodio futuro' },
        canonicalUrl: `https://www.imdb.com/title/${titleId}-eFUT/`,
        releaseDate: { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }
      }
    })
  }
  if (noDateEp) {
    edges.push({
      position: count + 2,
      node: {
        id: `${titleId}-eNODATE`,
        titleText: { text: 'Sin fecha' },
        canonicalUrl: `https://www.imdb.com/title/${titleId}-eNODATE/`,
        releaseDate: null
      }
    })
  }
  return { title: { episodes: { episodes: { total: edges.length, edges } } } }
}

// ============ Tests del parser de URL (unidad) ============
log('parseImdbUrl: extrae ttId + season')
const p1 = parseImdbUrl('https://www.imdb.com/title/tt19223420/episodes/?season=2')
if (p1.ttId !== 'tt19223420') fail(`ttId mal: ${p1.ttId}`)
if (p1.season !== '2') fail(`season mal: ${p1.season}`)

log('parseImdbUrl: default season=1 si falta')
const p2 = parseImdbUrl('https://www.imdb.com/title/tt19223420/episodes/')
if (p2.season !== '1') fail(`season default mal: ${p2.season}`)

log('parseImdbUrl: url sin ttId -> error')
const p3 = parseImdbUrl('https://www.imdb.com/')
if (!p3.error) fail('esperaba error para url sin ttId')
log('  parseImdbUrl OK')

// ============ Tests de fetchEpisodes (unidad, contra el mock) ============
RESPONSES['tt111:1'] = seasonData('tt111', 3)
log('fetchEpisodes: 3 episodios emitidos')
const f1 = await fetchEpisodes(imdbURL('tt111', 1))
if (f1.items.length !== 3) fail(`esperaba 3 items, hay ${f1.items.length}`)
if (!f1.items[0].guid.startsWith('tt111-e')) fail(`guid mal: ${f1.items[0].guid}`)
if (typeof f1.items[0].pub_date !== 'number') fail(`pub_date no es epoch`)
if (!/^S1 E1:/.test(f1.items[0].title)) fail(`title mal: ${f1.items[0].title}`)
if (!f1.items[0].link.startsWith('http')) fail(`link mal: ${f1.items[0].link}`)
log(`  fetchEpisodes OK (${f1.items.length} items)`)

log('fetchEpisodes: filtra episodios futuros y sin fecha')
RESPONSES['tt112:1'] = seasonData('tt112', 2, { futureEp: true, noDateEp: true })
const f2 = await fetchEpisodes(imdbURL('tt112', 1))
if (f2.items.length !== 2) fail(`esperaba 2 items (filtrados), hay ${f2.items.length}`)
if (f2.items.some(i => i.title.includes('futuro'))) fail('un episodio futuro se coló')
if (f2.items.some(i => i.title.includes('Sin fecha'))) fail('un episodio sin fecha se coló')
log('  filtrado OK (futuro y sin fecha excluidos)')

// Caso de regresión del bug del desfase: un episodio con fecha "hoy" (en la tz
// del proceso) debe estar disponible, y uno con "mañana" debe filtrarse. Antes
// se comparaba por instante UTC y aparecían un día antes en zonas occidentales.
log('fetchEpisodes: episodio de hoy disponible, de mañana filtrado (regresión desfase)')
{
  const now = new Date()
  // "Hoy" como fecha calendaria en la tz del proceso (igual que hace imdb.mjs).
  const tzParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now)
  const g = (t) => Number(tzParts.find(p => p.type === t).value)
  const today = { year: g('year'), month: g('month'), day: g('day') }
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrow = { year: tomorrowDate.getFullYear(), month: tomorrowDate.getMonth() + 1, day: tomorrowDate.getDate() }
  RESPONSES['tt200:1'] = {
    title: {
      episodes: {
        episodes: {
          total: 2,
          edges: [
            { position: 1, node: { id: 'tt200-TODAY', titleText: { text: 'Hoy' }, canonicalUrl: 'http://imdb/today', releaseDate: { day: today.day, month: today.month, year: today.year } } },
            { position: 2, node: { id: 'tt200-TOMORROW', titleText: { text: 'Mañana' }, canonicalUrl: 'http://imdb/tomorrow', releaseDate: { day: tomorrow.day, month: tomorrow.month, year: tomorrow.year } } }
          ]
        }
      }
    }
  }
  const r = await fetchEpisodes(imdbURL('tt200', 1))
  if (r.items.length !== 1) fail(`esperaba 1 item (solo el de hoy), hay ${r.items.length}`)
  if (r.items[0].guid !== 'tt200-TODAY') fail(`debería ser el de hoy, vino ${r.items[0].guid}`)
  log('  regresión desfase OK (hoy entra, mañana se filtra)')
}

log('fetchEpisodes: url inválida -> error')
try {
  await fetchEpisodes('https://no-imdb.com/foo')
  fail('esperaba error por url inválida')
} catch (e) {
  if (!/title\/tt/.test(e.message)) fail(`mensaje inesperado: ${e.message}`)
}
log('  url inválida OK')

log('fetchEpisodes: error GraphQL -> error con mensaje útil')
RESPONSES['tt113:1'] = { _gqlErrors: [{ message: 'Title not found' }] }
try {
  await fetchEpisodes(imdbURL('tt113', 1))
  fail('esperaba error GraphQL')
} catch (e) {
  if (!/Title not found/.test(e.message)) fail(`mensaje GraphQL inesperado: ${e.message}`)
}
log('  error GraphQL OK')

// ============ Tests del refresher sobre BD real ============
const stamp = Date.now()
const username = `imdb_${stamp}`
await user.signup(username, 'pass')
const { data: u } = await user.getBy('username', username)
log(`Usuario ${username} id=${u.id}`)

// Serie anime con URL IMDB válida (3 episodios)
const c1 = await series.create(u.id, {
  type: 'anime', name: 'Test IMDB', url: null, cover_url: null,
  imdb_url: imdbURL('tt111', 1)
})
const sid1 = c1.id
log(`Serie anime creada id=${sid1} con imdb_url válido`)

log('refreshSeries: trae 3 items, inserta 3, limpia last_error')
const r1 = await refresher.refreshSeries({ id: sid1, user_id: u.id, imdb_url: imdbURL('tt111', 1) })
if (r1.error) fail('refreshSeries válido falló: ' + r1.error)
if (r1.total !== 3) fail(`esperaba total=3, vino ${r1.total}`)
if (r1.inserted !== 3) fail(`esperaba inserted=3, vino ${r1.inserted}`)
const pend1 = await seriesItem.pendingCount(sid1)
if (pend1.data !== 3) fail(`pendingCount esperaba 3, vino ${pend1.data}`)
const after1 = await series.getById(sid1, u.id)
if (after1.data.last_error) fail('last_error debería estar null tras refresh exitoso')
if (after1.data.last_checked_at == null) fail('last_checked_at debería estar poblado')
if (after1.data.last_known_total !== 3) fail(`last_known_total esperaba 3, vino ${after1.data.last_known_total}`)
log('  refreshSeries OK (3 items, last_error=null)')

log('refreshSeries de nuevo: dedupe por guid (0 insertados)')
const r2 = await refresher.refreshSeries({ id: sid1, user_id: u.id, imdb_url: imdbURL('tt111', 1) })
if (r2.inserted !== 0) fail(`esperaba 0 insertados (dedupe), vino ${r2.inserted}`)
const pend2 = await seriesItem.pendingCount(sid1)
if (pend2.data !== 3) fail('pendingCount debería seguir en 3 tras dedupe')
log('  dedupe OK')

log('refreshSeries purga items con fecha futura insertados antes (regresión)')
// Simulamos el bug previo: insertamos manualmente un item con fecha lejana en
// el futuro. El refresh debe borrarlo (sincronización), aunque el mock siga
// devolviendo los 3 episodios del pasado (2020). El item futuro "fantasma"
// desaparece de la cuenta de pendientes.
const { airedUntilEpoch } = await import('../src/imdb.mjs')
const futureEpoch = airedUntilEpoch() + 365 * 86400 // +1 año
await seriesItem.insertMany(sid1, [{ guid: 'tt111-GHOST', title: 'Fantasma futuro', link: 'http://x', pub_date: futureEpoch }])
let pendGhost = await seriesItem.pendingCount(sid1)
if (pendGhost.data !== 4) fail(`tras insertar fantasma debería haber 4 pendientes, hay ${pendGhost.data}`)
const rPurge = await refresher.refreshSeries({ id: sid1, user_id: u.id, imdb_url: imdbURL('tt111', 1) })
let pendAfterPurge = await seriesItem.pendingCount(sid1)
if (pendAfterPurge.data !== 3) fail(`tras refresh el fantasma futuro debería purgarse (volver a 3), hay ${pendAfterPurge.data}`)
log(`  purga de futuros OK (4 -> ${pendAfterPurge.data})`)

log('refreshSeries serie SIN imdb_url -> skipped')
const c2 = await series.create(u.id, {
  type: 'manga', name: 'No IMDB', url: null, cover_url: null,
  imdb_url: null
})
const r3 = await refresher.refreshSeries({ id: c2.id, user_id: u.id, imdb_url: null })
if (!r3.skipped) fail('esperaba skipped=true para serie sin imdb_url')
log('  skipped OK')

log('refreshSeries GraphQL 500 -> last_error poblado, sin crash')
const c3 = await series.create(u.id, {
  type: 'anime', name: 'Broken', url: null, cover_url: null,
  imdb_url: imdbURL('tt500', 1)
})
RESPONSES['tt500:1'] = { _http: 500 }
await refresher.refreshSeries({ id: c3.id, user_id: u.id, imdb_url: imdbURL('tt500', 1) })
const afterBroken = await series.getById(c3.id, u.id)
if (!afterBroken.data.last_error) fail('last_error debería estar poblado para GraphQL 500')
log(`  last_error OK: "${afterBroken.data.last_error}"`)

log('refreshSeries URL no-IMDB -> last_error poblado (parseo falla)')
const c4 = await series.create(u.id, {
  type: 'anime', name: 'Bad URL', url: null, cover_url: null,
  imdb_url: 'https://example.com/feed'
})
await refresher.refreshSeries({ id: c4.id, user_id: u.id, imdb_url: 'https://example.com/feed' })
const afterBad = await series.getById(c4.id, u.id)
if (!afterBad.data.last_error) fail('last_error debería estar poblado para URL no-IMDB')
log(`  url inválida OK: "${afterBad.data.last_error}"`)

log('refreshSeries dinámico: detecta episodio nuevo en 2do fetch')
let dynV2 = false
RESPONSES['tt777:2'] = () => dynV2 ? seasonData('tt777', 2) : (() => {
  const d = seasonData('tt777', 1)
  // En v1 sólo 1 episodio emitido (forzamos count=1 reusando helper)
  return { title: { episodes: { episodes: { total: 1, edges: d.title.episodes.episodes.edges.slice(0, 1) } } } }
})()
const c5 = await series.create(u.id, {
  type: 'anime', name: 'Dynamic', url: null, cover_url: null,
  imdb_url: imdbURL('tt777', 2)
})
const d1 = await refresher.refreshSeries({ id: c5.id, user_id: u.id, imdb_url: imdbURL('tt777', 2) })
if (d1.inserted !== 1) fail(`esperaba 1 insertado en dynamic v1, vino ${d1.inserted}`)
dynV2 = true
const d2 = await refresher.refreshSeries({ id: c5.id, user_id: u.id, imdb_url: imdbURL('tt777', 2) })
if (d2.inserted !== 1) fail(`esperaba 1 nuevo en dynamic v2, vino ${d2.inserted}`)
log('  episodio nuevo detectado OK')

// ============ Tests de los endpoints HTTP ============
const server = http.createServer(app)
await new Promise(r => server.listen(0, r))
const apiPort = server.address().port
const baseURL = `http://localhost:${apiPort}`
const request = (method, path, body, token) => axios({
  method, url: baseURL + path, data: body,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true
})

const loginRes = await request('post', '/api/login', { username, password: 'pass' })
const token = loginRes.data.token

log('POST /api/refresh (on-demand) refresca las series del usuario')
const refRes = await request('post', '/api/refresh', null, token)
if (refRes.status !== 200) fail(`POST /api/refresh status ${refRes.status}`)
if (typeof refRes.data.refreshed !== 'number') fail('falta refreshed en /api/refresh')
if (typeof refRes.data.failed !== 'number') fail('falta failed en /api/refresh')
log(`  /api/refresh OK: refreshed=${refRes.data.refreshed} failed=${refRes.data.failed} total=${refRes.data.total}`)

log('POST /api/series/:id/refresh refresca una serie')
const oneRes = await request('post', `/api/series/${sid1}/refresh`, null, token)
if (oneRes.status !== 200) fail(`POST /api/series/:id/refresh status ${oneRes.status}`)
if (oneRes.data.success !== true) fail('esperaba success:true')
log(`  /api/series/:id/refresh OK: total=${oneRes.data.total} inserted=${oneRes.data.inserted}`)

log('POST /api/series/:id/refresh serie ajena -> 404')
const other = `other_${stamp}`
await user.signup(other, 'pass')
const otherLogin = await request('post', '/api/login', { username: other, password: 'pass' })
const otherToken = otherLogin.data.token
const otherRes = await request('post', `/api/series/${sid1}/refresh`, null, otherToken)
if (otherRes.status !== 404) fail(`esperaba 404 refresh serie ajena, vino ${otherRes.status}`)
log('  ownership OK (404)')

// ============ Scheduler ============
log('startScheduler devuelve handle y stopScheduler lo limpia')
const h = refresher.startScheduler({ intervalMs: 1000 })
if (!h) fail('startScheduler no devolvió handle')
refresher.stopScheduler()
log('  scheduler start/stop OK')

// --- Limpieza ---
await new Promise(r => server.close(r))
await new Promise(r => gqlServer.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 4 FALLÓ ===')
} else {
  log('=== Smoke test Épica 4 OK ===')
}
db.close()
