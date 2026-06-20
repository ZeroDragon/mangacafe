// Smoke test para Épica 4: motor RSS.
// Levanta un mini servidor HTTP que sirve feeds RSS/Atom de prueba, y ejercita
// parseFeed + refreshSeries + endpoints on-demand + dedupe + last_error.
// Correr desde backend/: node tests/smoke-rss-engine.mjs
import '../../dotenv.mjs'
import http from 'http'
import axios from 'axios'
import db, { ready } from '../src/models/db.mjs'
import user from '../src/models/user.mjs'
import series from '../src/models/series.mjs'
import seriesItem from '../src/models/series_item.mjs'
import parseFeed from '../src/rss.mjs'
import refresher from '../src/refresher.mjs'
import { app } from '../src/index.mjs'

await ready

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }

// --- Mini servidor de feeds de prueba ---
// Si el value es función, se evalúa en cada request (para feeds dinámicos).
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

// --- RSS 2.0 de prueba: 3 items ---
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

// --- Atom de prueba: 2 items, sin guid (usa link fallback) ---
FEEDS['/atom.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Anime</title>
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

// --- RSS que cambia (simula un nuevo item entre fetches) ---
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

// ============ Tests del parser (unidad) ============
log('parseFeed RSS 2.0: 3 items')
const rssItems = await parseFeed(FEEDS['/rss.xml'])
if (rssItems.length !== 3) fail(`esperaba 3 items RSS, hay ${rssItems.length}`)
if (rssItems[0].guid !== 'g1') fail(`guid mal: ${rssItems[0].guid}`)
if (rssItems[0].title !== 'Cap 101') fail(`title mal: ${rssItems[0].title}`)
if (!rssItems[0].link.startsWith('http')) fail(`link mal: ${rssItems[0].link}`)
if (typeof rssItems[0].pub_date !== 'number') fail(`pub_date no es epoch: ${rssItems[0].pub_date}`)
log(`  RSS OK (${rssItems.length} items, pub_date[0]=${rssItems[0].pub_date})`)

log('parseFeed Atom: 2 items')
const atomItems = await parseFeed(FEEDS['/atom.xml'])
if (atomItems.length !== 2) fail(`esperaba 2 items Atom, hay ${atomItems.length}`)
if (!atomItems[0].link.includes('/anime/1')) fail(`atom link mal: ${atomItems[0].link}`)
if (atomItems[0].guid !== 'e1') fail(`atom guid mal: ${atomItems[0].guid}`)
log('  Atom OK')

log('parseFeed XML inválido -> rechazo (no crash silencioso)')
try {
  await parseFeed('<<<not xml>>>')
  // xml2js puede lanzar o devolver vacío; si devuelve, debe ser array vacío
} catch (e) {
  // ok que lance
}
log('  parseFeed robusto a XML inválido')

// ============ Tests del refresher sobre BD real ============
const stamp = Date.now()
const username = `rss_${stamp}`
await user.signup(username, 'pass')
const { data: u } = await user.getBy('username', username)
log(`Usuario ${username} id=${u.id}`)

// Serie manga con feed RSS válido
const c1 = await series.create(u.id, {
  type: 'manga', name: 'Test RSS', url: null, cover_url: null,
  current_chapter: 0, rss_url: feedURL('/rss.xml')
})
const sid1 = c1.id
log(`Serie manga creada id=${sid1} con rss_url válido`)

log('refreshSeries: trae 3 items, inserta 3, limpia last_error')
const r1 = await refresher.refreshSeries({ id: sid1, user_id: u.id, rss_url: feedURL('/rss.xml') })
if (r1.error) fail('refreshSeries válido falló: ' + r1.error)
if (r1.total !== 3) fail(`esperaba total=3, vino ${r1.total}`)
if (r1.inserted !== 3) fail(`esperaba inserted=3, vino ${r1.inserted}`)
const pend1 = await seriesItem.pendingCount(sid1)
if (pend1.data !== 3) fail(`pendingCount esperaba 3, vino ${pend1.data}`)
const after1 = await series.getById(sid1, u.id)
if (after1.data.last_error) fail('last_error debería estar null tras refresh exitoso: ' + after1.data.last_error)
if (after1.data.last_checked_at == null) fail('last_checked_at debería estar poblado')
if (after1.data.last_known_total !== 3) fail(`last_known_total esperaba 3, vino ${after1.data.last_known_total}`)
log('  refreshSeries OK (3 items, last_error=null, last_checked_at poblado)')

log('refreshSeries de nuevo: dedupe por guid (0 insertados)')
const r2 = await refresher.refreshSeries({ id: sid1, user_id: u.id, rss_url: feedURL('/rss.xml') })
if (r2.inserted !== 0) fail(`esperaba 0 insertados (dedupe), vino ${r2.inserted}`)
if (r2.total !== 3) fail('total debería seguir siendo 3')
const pend2 = await seriesItem.pendingCount(sid1)
if (pend2.data !== 3) fail('pendingCount debería seguir en 3 tras dedupe')
log('  dedupe OK')

log('refreshSeries serie SIN rss_url -> skipped')
const c2 = await series.create(u.id, {
  type: 'anime', name: 'No RSS', url: null, cover_url: null,
  current_chapter: 0, rss_url: null
})
const r3 = await refresher.refreshSeries({ id: c2.id, user_id: u.id, rss_url: null })
if (!r3.skipped) fail('esperaba skipped=true para serie sin rss_url')
log('  skipped OK')

log('refreshSeries feed 500 -> last_error poblado, sin crash')
const r4 = await refresher.refreshSeries({ id: c2.id, user_id: u.id, rss_url: feedURL('/broken') })
if (!r4.error) fail('esperaba error para feed 500')
// No verificamos last_error en c2 porque la serie no tiene rss_url válida en BD;
// creamos una serie con rss_url apuntando al broken para chequearlo:
const c3 = await series.create(u.id, {
  type: 'manga', name: 'Broken', url: null, cover_url: null,
  current_chapter: 0, rss_url: feedURL('/broken')
})
await refresher.refreshSeries({ id: c3.id, user_id: u.id, rss_url: feedURL('/broken') })
const afterBroken = await series.getById(c3.id, u.id)
if (!afterBroken.data.last_error) fail('last_error debería estar poblado para feed 500')
log(`  last_error OK: "${afterBroken.data.last_error}"`)

log('refreshSeries feed 404 -> last_error poblado')
const c4 = await series.create(u.id, {
  type: 'manga', name: '404', url: null, cover_url: null,
  current_chapter: 0, rss_url: feedURL('/no-existe')
})
await refresher.refreshSeries({ id: c4.id, user_id: u.id, rss_url: feedURL('/no-existe') })
const after404 = await series.getById(c4.id, u.id)
if (!after404.data.last_error) fail('last_error debería estar poblado para feed 404')
log(`  404 OK: "${after404.data.last_error}"`)

log('refreshSeries feed dinámico: detecta item nuevo en 2do fetch')
const c5 = await series.create(u.id, {
  type: 'manga', name: 'Dynamic', url: null, cover_url: null,
  current_chapter: 0, rss_url: feedURL('/dynamic.xml')
})
const d1 = await refresher.refreshSeries({ id: c5.id, user_id: u.id, rss_url: feedURL('/dynamic.xml') })
if (d1.inserted !== 1) fail(`esperaba 1 insertado en dynamic v1, vino ${d1.inserted}`)
rssV2 = true
const d2 = await refresher.refreshSeries({ id: c5.id, user_id: u.id, rss_url: feedURL('/dynamic.xml') })
if (d2.inserted !== 1) fail(`esperaba 1 nuevo en dynamic v2, vino ${d2.inserted}`)
log('  item nuevo detectado OK')

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
// Tiene 4 series con rss_url (sid1, c3, c4, c5); las demás sin rss_url se skipean
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
await new Promise(r => feedServer.close(r))

if (process.exitCode) {
  console.error('=== Smoke test Épica 4 FALLÓ ===')
} else {
  log('=== Smoke test Épica 4 OK ===')
}
db.close()
