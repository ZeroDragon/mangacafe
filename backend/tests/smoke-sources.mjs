// Smoke test para Épica 12: auto-detección de fuente (RSS vs HTML scraper).
// Cubre:
//   - detectSource: RSS por Content-Type, RSS por sniff, Atom, HTML,
//     host conocido (comivex.com), host desconocido con HTML → error.
//   - fetchItems:
//     - RSS mini-servidor produce items vía adapter rss.
//     - comivex mini-servidor (sirve fixture HTML) produce items con
//       guid `comivex:1295:N` vía COMIVEX_ADAPTER.
//     - host desconocido devolviendo HTML → lanza "unsupported source".
// Correr desde backend/: DB_PATH=./test.sqlite node tests/smoke-sources.mjs
import '../../dotenv.mjs'
import http from 'http'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { detectSource, fetchItems } from '../src/sources/index.mjs'
import { COMIVEX_ADAPTER } from '../src/sources/comivex.mjs'
import { RSS_ADAPTER } from '../src/sources/rss.mjs'

const log = (...a) => console.log('•', ...a)
const fail = (...a) => { console.error('✗', ...a); process.exitCode = 1 }
const assert = (cond, msg) => cond ? null : fail(msg)

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = await readFile(join(__dirname, 'fixtures', 'comivex-1295.html'), 'utf8')

// ============ detectSource (unidad) ============
log('detectSource: host comivex.com → adapter comivex')
{
  const d = detectSource({ url: 'https://comivex.com/series/1295-test/' })
  assert(d.type === 'comivex', `esperaba type=comivex, vino ${d.type}`)
  assert(d.adapter === COMIVEX_ADAPTER, 'adapter debería ser COMIVEX_ADAPTER')
  log('  comivex por host OK')
}

log('detectSource: host www.comivex.com → adapter comivex')
{
  const d = detectSource({ url: 'https://www.comivex.com/series/1295/' })
  assert(d.type === 'comivex', `esperaba type=comivex (www), vino ${d.type}`)
  log('  www.comivex.com OK')
}

log('detectSource: Content-Type rss+xml → rss (sin sniffear body)')
{
  const d = detectSource({ url: 'https://example.com/feed', contentType: 'application/rss+xml; charset=utf-8', body: 'whatever' })
  assert(d.type === 'rss', `esperaba rss, vino ${d.type}`)
  assert(d.adapter === RSS_ADAPTER, 'adapter debería ser RSS_ADAPTER')
  log('  rss por Content-Type OK')
}

log('detectSource: Content-Type atom+xml → rss')
{
  const d = detectSource({ url: 'https://example.com/atom', contentType: 'application/atom+xml', body: '<feed></feed>' })
  assert(d.type === 'rss', `esperaba rss, vino ${d.type}`)
  log('  atom por Content-Type OK')
}

log('detectSource: Content-Type text/plain pero body con <rss> → rss por sniff')
{
  const body = '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>'
  const d = detectSource({ url: 'https://example.com/feed', contentType: 'text/plain', body })
  assert(d.type === 'rss', `esperaba rss (sniff), vino ${d.type}`)
  log('  sniff <rss> OK')
}

log('detectSource: body con <feed> → rss por sniff')
{
  const body = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>'
  const d = detectSource({ url: 'https://example.com/atom', contentType: 'text/xml', body })
  assert(d.type === 'rss', `esperaba rss (atom sniff), vino ${d.type}`)
  log('  sniff <feed> OK')
}

log('detectSource: body arranca con <?xml> → rss por sniff')
{
  const body = '<?xml version="1.0"?>\n<rdf:RDF></rdf:RDF>'
  const d = detectSource({ url: 'https://example.com/x', contentType: '', body })
  assert(d.type === 'rss', `esperaba rss (rdf sniff), vino ${d.type}`)
  log('  sniff <?xml> OK')
}

log('detectSource: HTML de host desconocido → throw "unsupported source"')
{
  let threw = null
  try {
    detectSource({ url: 'https://mangadex.org/title/abc', contentType: 'text/html', body: '<!DOCTYPE html><html><body>hola</body></html>' })
  } catch (err) {
    threw = err
  }
  assert(threw, 'debería haber lanzado')
  assert(/unsupported source|no adapter/i.test(threw.message), `mensaje inesperado: ${threw.message}`)
  log(`  HTML host desconocido OK: "${threw.message}"`)
}

log('detectSource: HTML de host desconocido y sin body → default rss (backward compat)')
{
  const d = detectSource({ url: 'https://feeds.feedburner.com/x' })
  assert(d.type === 'rss', `esperaba default rss, vino ${d.type}`)
  log('  default rss OK')
}

// ============ Adapter Comivex: parse directo con fixture ============
log('COMIVEX_ADAPTER.parse(fixture) → 3 items con guids estables')
{
  const { items, _meta } = COMIVEX_ADAPTER.parse(FIXTURE, 'https://comivex.com/series/1295-test/')
  assert(items.length === 3, `esperaba 3 items, hay ${items.length}`)
  assert(_meta.mangaId === '1295', `mangaId esperaba 1295, vino ${_meta.mangaId}`)
  const first = items[0]
  assert(first.guid === 'comivex:1295:81', `guid[0] esperaba comivex:1295:81, vino ${first.guid}`)
  assert(first.title === 'Chapter 81', `title[0]: ${first.title}`)
  assert(first.link.startsWith('https://comivex.com/'), `link[0] debería ser absoluto: ${first.link}`)
  assert(typeof first.pub_date === 'number' && first.pub_date > 0, `pub_date[0] debería ser epoch > 0: ${first.pub_date}`)
  // El más viejo (5 years, 5 months ago) debe ser menor (más antiguo) que el último (2 days ago).
  const newest = items[0].pub_date
  const oldest = items[2].pub_date
  assert(oldest < newest, `oldest (${oldest}) debería ser < newest (${newest})`)
  log(`  parse OK: ${items.length} items, guids ${items.map(i => i.guid).join(', ')}`)
}

log('COMIVEX_ADAPTER.parseAgeToEpoch: casos conocidos (vía parseComivexHTML implícito)')
{
  // Sin .ch-date → pub_date null.
  const html = `<!DOCTYPE html><html><body>
    <a class="btn-read" href="/read/1295/1-eng-li/"></a>
    <li class="ch-item"><a class="ch-link" href="/read/1295/1/"></a><span class="ch-num">Chapter 1</span></li>
  </body></html>`
  const { items } = COMIVEX_ADAPTER.parse(html, 'https://comivex.com/series/1295/')
  assert(items.length === 1, `esperaba 1 item, hay ${items.length}`)
  assert(items[0].pub_date === null, `esperaba pub_date null sin .ch-date, vino ${items[0].pub_date}`)
  log('  parseAgeToEpoch null OK')
}

// ============ fetchItems: RSS vía mini-servidor ============
log('fetchItems: mini-servidor RSS produce items vía adapter')
{
  const FEED = '<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>' +
    '<item><guid>r1</guid><title>Cap 1</title><link>http://x/1</link><pubDate>Sat, 14 Nov 2023 00:00:00 GMT</pubDate></item>' +
    '<item><guid>r2</guid><title>Cap 2</title><link>http://x/2</link><pubDate>Sat, 15 Nov 2023 00:00:00 GMT</pubDate></item>' +
    '</channel></rss>'
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' })
    res.end(FEED)
  })
  await new Promise(r => srv.listen(0, r))
  const port = srv.address().port
  const { items } = await fetchItems(`http://localhost:${port}/feed.xml`)
  assert(items.length === 2, `esperaba 2 items RSS, hay ${items.length}`)
  assert(items[0].guid === 'r1', `guid[0] esperaba r1, vino ${items[0].guid}`)
  await new Promise(r => srv.close(r))
  log('  fetchItems RSS OK')
}

// ============ fetchItems: routing end-to-end a COMIVEX_ADAPTER ============
// Sobrescribimos temporalmente los hosts del adapter para que apunte al
// mini-servidor local (en lugar de comivex.com) y así probar fetchItems
// → detectSource → COMIVEX_ADAPTER.fetch → parseComivexHTML sin red externa.
log('fetchItems: routing end-to-end a COMIVEX_ADAPTER (host override + fixture)')
{
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(FIXTURE)
  })
  await new Promise(r => srv.listen(0, r))
  const port = srv.address().port
  const url = `http://localhost:${port}/series/1295-test/`

  const originalHosts = COMIVEX_ADAPTER.hosts.slice()
  COMIVEX_ADAPTER.hosts.push('localhost')
  try {
    const { items } = await fetchItems(url)
    assert(items.length === 3, `esperaba 3 items, hay ${items.length}`)
    assert(items[0].guid === 'comivex:1295:81', `guid[0]: ${items[0].guid}`)
    assert(items[0].link.startsWith('http'), `link[0] debería ser absoluto: ${items[0].link}`)
  } finally {
    COMIVEX_ADAPTER.hosts.length = 0
    originalHosts.forEach(h => COMIVEX_ADAPTER.hosts.push(h))
  }
  await new Promise(r => srv.close(r))
  log('  routing end-to-end OK (3 items, guids comivex:1295:81/80/79)')
}

// ============ fetchItems: HTML de host desconocido → error ============
log('fetchItems: HTML de host desconocido → throw "unsupported source"')
{
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!DOCTYPE html><html><body>not a feed</body></html>')
  })
  await new Promise(r => srv.listen(0, r))
  const port = srv.address().port
  let err = null
  try {
    await fetchItems(`http://localhost:${port}/manga/x`)
  } catch (e) {
    err = e
  }
  assert(err, 'fetchItems debería haber lanzado para HTML host desconocido')
  assert(/unsupported source|no adapter/i.test(err.message), `mensaje inesperado: ${err.message}`)
  await new Promise(r => srv.close(r))
  log(`  HTML host desconocido OK: "${err.message}"`)
}

// ============ fetchItems: feed 404 → error ============
log('fetchItems: HTTP 404 → throw')
{
  const srv = http.createServer((_req, res) => { res.writeHead(404); res.end('no') })
  await new Promise(r => srv.listen(0, r))
  const port = srv.address().port
  let err = null
  try {
    await fetchItems(`http://localhost:${port}/x`)
  } catch (e) {
    err = e
  }
  assert(err, 'fetchItems debería lanzar para 404')
  assert(/404/.test(err.message), `mensaje inesperado: ${err.message}`)
  await new Promise(r => srv.close(r))
  log('  404 OK')
}

if (process.exitCode) {
  console.error('=== Smoke test Épica 12 FALLÓ ===')
} else {
  log('=== Smoke test Épica 12 OK ===')
}
