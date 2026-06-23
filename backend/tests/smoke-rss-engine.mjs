// Smoke test para Épica 9: motor RSS para mangas + dispatch por tipo.
// Levanta:
//   - un mini servidor de feeds RSS/Atom/rotos, y
//   - un mini servidor que simula api.graphql.imdb.com (para verificar que el
//     flujo anime sigue intacto tras la ramificación por type).
// Ejercita parseFeed, refreshSeries (dispatch), refreshByUser, validateSeries
// vía HTTP (POST /api/series rechaza el feed equivocado para el tipo) y
// endpoints on-demand.
// Correr desde backend/: node tests/smoke-rss-engine.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import series from '../src/models/series.mjs'
import seriesItem from '../src/models/series_item.mjs'
import parseFeed from '../src/rss.mjs'
import refresher from '../src/refresher.mjs'
import { COMIVEX_ADAPTER } from '../src/sources/comivex.mjs'
import { app } from '../src/index.mjs'

await ready

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

// --- Mini servidor de feeds RSS/Atom ---
const FEEDS = {}
const feedServer = http.createServer((req, res) => {
  const key = req.url
  const entry = FEEDS[key]
  if (entry != null) {
    const body = typeof entry === 'function' ? entry() : entry
    res.writeHead(200, { 'Content-Type': 'application/xml' })
    res.end(body)
  } else if (key === '/broken') {
    res.writeHead(500)
    res.end('boom')
  } else {
    res.writeHead(404)
    res.end('no feed')
  }
})
await new Promise(r => feedServer.listen(0, r))
const feedPort = feedServer.address().port
const feedURL = (path) => `http://localhost:${feedPort}${path}`

FEEDS['/rss.xml'] = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Manga</title>
  <link>http://example.com</link>
  <description>feed</description>
  <item>
    <guid>g1</guid><title>Cap 101</title><link>http://example.com/101</link><pubDate>Sat, 14 Nov 2023 00:00:00 GMT</pubDate>
  </item>
  <item>
    <guid>g2</guid><title>Cap 102</title><link>http://example.com/102</link><pubDate>Sat, 15 Nov 2023 00:00:00 GMT</pubDate>
  </item>
  <item>
    <guid>g3</guid><title>Cap 103</title><link>http://example.com/103</link><pubDate>Sat, 16 Nov 2023 00:00:00 GMT</pubDate>
  </item>
</channel></rss>`

FEEDS['/atom.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>Ep 1</title>
    <link href="http://example.com/anime/1" rel="alternate"/>
    <id>e1</id><updated>2023-11-14T00:00:00Z</updated><published>2023-11-14T00:00:00Z</published>
  </entry>
  <entry>
    <title>Ep 2</title>
    <link href="http://example.com/anime/2" rel="alternate"/>
    <id>e2</id><updated>2023-11-15T00:00:00Z</updated><published>2023-11-15T00:00:00Z</published>
  </entry>
</feed>`

let rssV2 = false
FEEDS['/dynamic.xml'] = () => rssV2
  ? `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title><item>
      <guid>g1</guid><title>Cap 101</title><link>http://x/1</link><pubDate>Sat, 14 Nov 2023 00:00:00 GMT</pubDate>
    </item><item>
      <guid>gNEW</guid><title>Cap 104</title><link>http://x/104</link><pubDate>Sat, 17 Nov 2023 00:00:00 GMT</pubDate>
    </item></channel></rss>`
  : `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title><item>
      <guid>g1</guid><title>Cap 101</title><link>http://x/1</link><pubDate>Sat, 14 Nov 2023 00:00:00 GMT</pubDate>
    </item></channel></rss>`

// --- Mini servidor que simula api.graphql.imdb.com (para verificar que el
// flujo anime sigue funcionando tras el dispatch por tipo). Reuso simple.
const gqlServer = http.createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    const edges = []
    for (let i = 1; i <= 2; i++) {
      const d = new Date(Date.UTC(2020, 0, i))
      edges.push({
        position: i,
        node: {
          id: `ttTest-e${i}`,
          titleText: { text: `Episode ${i}` },
          canonicalUrl: `https://www.imdb.com/title/ttTest-e${i}/`,
          releaseDate: { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }
        }
      })
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      data: {
        title: {
          episodes: {
            episodes: { total: edges.length, edges }
          }
        }
      }
    }))
  })
})
await new Promise(r => gqlServer.listen(0, r))
process.env.IMDB_GRAPHQL_ENDPOINT = `http://localhost:${gqlServer.address().port}/`
const animeURL = () => 'https://www.imdb.com/title/tt0000001/episodes/?season=1'

// ============ Tests del parser (unidad) ============
log('parseFeed RSS 2.0: 3 items')
const rssItems = await parseFeed(FEEDS['/rss.xml'])
if (rssItems.length !== 3) fail(`esperaba 3 items RSS, hay ${rssItems.length}`)
if (rssItems[0].guid !== 'g1') fail(`guid mal: ${rssItems[0].guid}`)
if (rssItems[0].title !== 'Cap 101') fail(`title mal: ${rssItems[0].title}`)
if (!rssItems[0].link.startsWith('http')) fail(`link mal: ${rssItems[0].link}`)
if (typeof rssItems[0].pub_date !== 'number') fail(`pub_date no es epoch: ${rssItems[0].pub_date}`)
log(`  RSS OK (${rssItems.length} items)`)

log('parseFeed Atom: 2 items, guid por <id>')
const atomItems = await parseFeed(FEEDS['/atom.xml'])
if (atomItems.length !== 2) fail(`esperaba 2 items Atom, hay ${atomItems.length}`)
if (!atomItems[0].link.includes('/anime/1')) fail(`atom link mal: ${atomItems[0].link}`)
if (atomItems[0].guid !== 'e1') fail(`atom guid mal: ${atomItems[0].guid}`)
log('  Atom OK')

// ============ Setup: usuario ============
const stamp = Date.now()
const username = `rss_${stamp}`
await user.signup(username, 'pass')
const { data: u } = await user.getBy('username', username)
log(`Usuario ${username} id=${u.id}`)

// ============ Dispatch: manga -> RSS ============
log('refreshSeries manga con rss_url -> flujo RSS (3 items)')
const c1 = await series.create(u.id, {
  type: 'manga', name: 'Manga RSS', url: null, cover_url: null,
  rss_url: feedURL('/rss.xml')
})
const sid1 = c1.id
const full1 = await series.getById(sid1, u.id)
const r1 = await refresher.refreshSeries(full1.data)
if (r1.error) fail('refreshSeries manga falló: ' + r1.error)
if (r1.total !== 3) fail(`esperaba total=3, vino ${r1.total}`)
if (r1.inserted !== 3) fail(`esperaba inserted=3, vino ${r1.inserted}`)
const pend1 = await seriesItem.pendingCount(sid1)
if (pend1.data !== 3) fail(`pendingCount esperaba 3, vino ${pend1.data}`)
const after1 = await series.getById(sid1, u.id)
if (after1.data.last_error) fail('last_error debería estar null: ' + after1.data.last_error)
if (after1.data.last_known_total !== 3) fail(`last_known_total esperaba 3, vino ${after1.data.last_known_total}`)
log('  manga RSS OK (3 items, last_error=null)')

log('refreshSeries manga otra vez: dedupe por guid (0 insertados)')
const r2 = await refresher.refreshSeries((await series.getById(sid1, u.id)).data)
if (r2.inserted !== 0) fail(`esperaba 0 insertados (dedupe), vino ${r2.inserted}`)
log('  dedupe OK')

// ============ Dispatch: anime -> IMDB (sin regresión) ============
log('refreshSeries anime con imdb_url -> flujo IMDB (mock GraphQL, 2 items)')
const c2 = await series.create(u.id, {
  type: 'anime', name: 'Anime IMDB', url: null, cover_url: null,
  imdb_url: animeURL()
})
const full2 = await series.getById(c2.id, u.id)
const r3 = await refresher.refreshSeries(full2.data)
if (r3.error) fail('refreshSeries anime falló: ' + r3.error)
if (r3.total !== 2) fail(`esperaba total=2 (IMDB mock), vino ${r3.total}`)
if (r3.inserted !== 2) fail(`esperaba inserted=2, vino ${r3.inserted}`)
log(`  anime IMDB OK (${r3.total} items, dispatch intacto)`)

// ============ Dispatch: sin feed del tipo correcto ============
log('refreshSeries manga sin rss_url -> skipped (no toca imdb_url)')
const c3 = await series.create(u.id, {
  type: 'manga', name: 'Manga sin feed', url: null, cover_url: null
})
const r4 = await refresher.refreshSeries((await series.getById(c3.id, u.id)).data)
if (!r4.skipped) fail('manga sin rss_url debería skipped')
log('  manga skipped OK')

log('refreshSeries anime sin imdb_url -> skipped')
const c4 = await series.create(u.id, {
  type: 'anime', name: 'Anime sin feed', url: null, cover_url: null
})
const r5 = await refresher.refreshSeries((await series.getById(c4.id, u.id)).data)
if (!r5.skipped) fail('anime sin imdb_url debería skipped')
log('  anime skipped OK')

// ============ Errores de feed ============
log('refreshSeries manga feed 500 -> last_error poblado, sin crash')
const c5 = await series.create(u.id, {
  type: 'manga', name: 'Broken 500', url: null, cover_url: null,
  rss_url: feedURL('/broken')
})
await refresher.refreshSeries((await series.getById(c5.id, u.id)).data)
const after5 = await series.getById(c5.id, u.id)
if (!after5.data.last_error) fail('last_error debería estar poblado para feed 500')
log(`  500 OK: "${after5.data.last_error}"`)

log('refreshSeries manga feed 404 -> last_error poblado')
const c6 = await series.create(u.id, {
  type: 'manga', name: 'Broken 404', url: null, cover_url: null,
  rss_url: feedURL('/no-existe')
})
await refresher.refreshSeries((await series.getById(c6.id, u.id)).data)
const after6 = await series.getById(c6.id, u.id)
if (!after6.data.last_error) fail('last_error debería estar poblado para feed 404')
log(`  404 OK: "${after6.data.last_error}"`)

log('refreshSeries manga feed dinámico: detecta item nuevo en 2do fetch')
const c7 = await series.create(u.id, {
  type: 'manga', name: 'Dynamic', url: null, cover_url: null,
  rss_url: feedURL('/dynamic.xml')
})
const d1 = await refresher.refreshSeries((await series.getById(c7.id, u.id)).data)
if (d1.inserted !== 1) fail(`esperaba 1 insertado en dynamic v1, vino ${d1.inserted}`)
rssV2 = true
const d2 = await refresher.refreshSeries((await series.getById(c7.id, u.id)).data)
if (d2.inserted !== 1) fail(`esperaba 1 nuevo en dynamic v2, vino ${d2.inserted}`)
log('  item nuevo detectado OK')

// ============ refreshByUser: respeta tipo ============
log('refreshByUser refresca solo series con feed del tipo correcto')
const before = await seriesItem.pendingCount(sid1)
const rbu = await refresher.refreshByUser(u.id)
// Series del usuario con feed: sid1 (manga/rss), c2 (anime/imdb), c5 (manga/500), c6 (manga/404), c7 (manga/dynamic)
// c3 y c4 se skipean (sin feed del tipo)
if (rbu.total !== 5) fail(`refreshByUser.total esperaba 5, vino ${rbu.total}`)
if (rbu.refreshed + rbu.failed !== 5) fail(`refreshed+failed esperaba 5, vino ${rbu.refreshed}+${rbu.failed}`)
log(`  refreshByUser OK: refreshed=${rbu.refreshed} failed=${rbu.failed} total=${rbu.total}`)

// ============ Tests HTTP ============
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

log('POST /api/series type=manga + imdb_url -> 400 (campo equivocado para el tipo)')
const badManga = await request('post', '/api/series', {
  type: 'manga', name: 'Should Fail', imdb_url: animeURL()
}, token)
if (badManga.status !== 400) fail(`esperaba 400 creando manga con imdb_url, vino ${badManga.status}`)
if (!/imdb_url is only for anime/.test(badManga.data.error)) {
  fail(`mensaje no menciona la regla: "${badManga.data.error}"`)
}
log(`  400 OK: "${badManga.data.error}"`)

log('POST /api/series type=anime + rss_url -> 400')
const badAnime = await request('post', '/api/series', {
  type: 'anime', name: 'Should Fail', rss_url: feedURL('/rss.xml')
}, token)
if (badAnime.status !== 400) fail(`esperaba 400 creando anime con rss_url, vino ${badAnime.status}`)
log(`  400 OK: "${badAnime.data.error}"`)

log('POST /api/series type=manga + rss_url -> 201/200 con imdb_url=null')
const goodManga = await request('post', '/api/series', {
  type: 'manga', name: 'Should Work', rss_url: feedURL('/rss.xml')
}, token)
if (goodManga.status !== 200) fail(`esperaba 200 creando manga con rss_url, vino ${goodManga.status}`)
const created = await series.getById(goodManga.data.id, u.id)
if (created.data.imdb_url !== null) fail(`imdb_url debería ser null en manga, vino ${created.data.imdb_url}`)
if (created.data.rss_url !== feedURL('/rss.xml')) fail(`rss_url debería estar persistido`)
log('  persistencia por tipo OK (imdb_url=null, rss_url=set)')

log('POST /api/series/:id/refresh (manga) refresca via RSS')
const oneRes = await request('post', `/api/series/${sid1}/refresh`, null, token)
if (oneRes.status !== 200) fail(`status ${oneRes.status}`)
if (oneRes.data.success !== true) fail('esperaba success:true')
log(`  refresh manga OK: total=${oneRes.data.total} inserted=${oneRes.data.inserted}`)

log('POST /api/series/:id/refresh serie ajena -> 404')
const other = `other_${stamp}`
await user.signup(other, 'pass')
const otherToken = (await request('post', '/api/login', { username: other, password: 'pass' })).data.token
const otherRes = await request('post', `/api/series/${sid1}/refresh`, null, otherToken)
if (otherRes.status !== 404) fail(`esperaba 404 refresh serie ajena, vino ${otherRes.status}`)
log('  ownership OK')

// ============ Dispatch: manga -> comivex (Épica 12) ============
// Servimos un fixture HTML de comivex desde un mini-servidor local; override
// temporal de los hosts del adapter para que el orquestador rutee a él.
log('refreshSeries manga con rss_url=host-comivex (mock local) -> scraper')
const __dirname2 = dirname(fileURLToPath(import.meta.url))
const COMIVEX_FIXTURE = await readFile(join(__dirname2, 'fixtures', 'comivex-1295.html'), 'utf8')
const comivexSrv = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(COMIVEX_FIXTURE)
})
await new Promise(r => comivexSrv.listen(0, r))
const comivexPort = comivexSrv.address().port
const comivexURL = `http://localhost:${comivexPort}/series/1295-test/`
const cComivex = await series.create(u.id, {
  type: 'manga', name: 'Comivex Manga', url: null, cover_url: null,
  rss_url: comivexURL
})
const _origComivexHosts = COMIVEX_ADAPTER.hosts.slice()
COMIVEX_ADAPTER.hosts.push('localhost')
try {
  const rComivex = await refresher.refreshSeries((await series.getById(cComivex.id, u.id)).data)
  if (rComivex.error) fail('refreshSeries comivex falló: ' + rComivex.error)
  if (rComivex.total !== 3) fail(`esperaba total=3 (comivex mock), vino ${rComivex.total}`)
  if (rComivex.inserted !== 3) fail(`esperaba inserted=3, vino ${rComivex.inserted}`)
  // Dedupe por guid en segundo refresh.
  const rComivex2 = await refresher.refreshSeries((await series.getById(cComivex.id, u.id)).data)
  if (rComivex2.inserted !== 0) fail(`esperaba 0 insertados en 2do refresh, vino ${rComivex2.inserted}`)
} finally {
  COMIVEX_ADAPTER.hosts.length = 0
  _origComivexHosts.forEach(h => COMIVEX_ADAPTER.hosts.push(h))
}
await new Promise(r => comivexSrv.close(r))
log('  manga -> comivex OK (3 items, dedupe en 2do refresh)')

// ============ Scheduler ============
log('startScheduler/stopScheduler (no revienta)')
const h = refresher.startScheduler({ intervalMs: 1000 })
if (!h) fail('startScheduler no devolvió handle')
refresher.stopScheduler()
log('  scheduler OK')

// --- Limpieza ---
await new Promise(r => server.close(r))
await new Promise(r => feedServer.close(r))
await new Promise(r => gqlServer.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 9 FALLÓ ===')
} else {
  log('=== Smoke test Épica 9 OK ===')
}
db.close()
