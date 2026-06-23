// Orquestador de fuentes para mangas (Épica 12).
// El refresher solo llama fetchItems(url); este módulo detecta la fuente
// (RSS / adapter por host) y dispatcha.
//
// Algoritmo (detectSource):
//   1. Host conocido → adapter registrado (comivex.com → COMIVEX_ADAPTER).
//      El adapter hace su propio GET con headers específicos.
//   2. Sino, GET propio y sniff del body:
//      - Content-Type rss+xml / atom+xml / xml → rss.
//      - Body arranca con <?xml o contiene <rss / <feed / <rdf:RDF → rss
//        (algunos feeds vienen con Content-Type: text/plain por server mal configurado).
//      - Body contiene <html o <!DOCTYPE html> → HTML; si host matchea adapter,
//        se lo pasamos; sino error "unsupported source".
//   3. Default: rss (backward compat con feeds raros que ya están en la DB).
//
// El orquestador no knows about `series` ni `series_items`: solo produce { items }.
import axios from 'axios'
import { RSS_ADAPTER } from './rss.mjs'
import { COMIVEX_ADAPTER } from './comivex.mjs'

// Array explícito de adapters con hosts. Sumar uno nuevo = agregar un elemento.
const HOST_ADAPTERS = [COMIVEX_ADAPTER]

const RSS_UA = process.env.RSS_USER_AGENT || 'MangaCafeRSS/1.0 (+https://github.com/mangacafe)'
const RSS_TIMEOUT = Number(process.env.RSS_TIMEOUT) || 15000

const adapterByHost = (host) => {
  for (const a of HOST_ADAPTERS) {
    if (a.hosts.some(h => host === h || host.endsWith('.' + h))) return a
  }
  return null
}

// Devuelve { type: 'rss'|'<adapter.name>', adapter, body?, contentType? }
export const detectSource = ({ url, contentType, body }) => {
  let parsed
  try { parsed = new URL(url) } catch { throw new Error(`invalid url: ${url}`) }
  const host = parsed.hostname.toLowerCase()

  // 1. Host conocido → adapter.
  const hostAdapter = adapterByHost(host)
  if (hostAdapter) return { type: hostAdapter.name, adapter: hostAdapter }

  // 2. Sniff del body si tenemos; sin body no podemos decidir más.
  if (body != null) {
    const ct = (contentType || '').toLowerCase()
    const head = String(body).slice(0, 2048).toLowerCase()

    // 2a. Content-Type xml explícito.
    if (/rss\+xml|atom\+xml|\/xml/.test(ct)) {
      return { type: 'rss', adapter: RSS_ADAPTER }
    }
    // 2b. Sniff: body arranca con <?xml o contiene tags típicos de feed.
    if (/^\s*<\?xml/.test(String(body)) || /<rss[\s>]|<feed[\s>]|<rdf:rdf/.test(head)) {
      return { type: 'rss', adapter: RSS_ADAPTER }
    }
    // 2c. HTML: si el host tiene adapter, lo reusamos; sino error.
    if (/<html[\s>]|<!doctype html/.test(head)) {
      const adapter = adapterByHost(host)
      if (adapter) return { type: adapter.name, adapter }
      throw new Error(`HTML page from unknown host '${host}' — no adapter available`)
    }
  }

  // 3. Default: rss (backward compat).
  return { type: 'rss', adapter: RSS_ADAPTER }
}

// fetchItems(url) → { items: [{ guid, title, link, pub_date }] }
export const fetchItems = async (url) => {
  let detected
  try {
    detected = detectSource({ url })
  } catch (err) {
    // Host inválido o HTML de host desconocido detectable por URL.
    throw err
  }

  // Si el adapter sabe hacer su propio GET (hosts registrados), delegamos.
  if (detected.adapter.fetch && detected.type !== 'rss') {
    return detected.adapter.fetch(url)
  }

  // Sino: GET plano para RSS o para sniff si vino por default.
  const res = await axios.get(url, {
    headers: { 'User-Agent': RSS_UA },
    timeout: RSS_TIMEOUT,
    responseType: 'text',
    transformResponse: [d => d]
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}`)
  }
  const contentType = res.headers['content-type'] || ''
  // Re-detect con body real por si el default (rss) estaba mal.
  const sniffed = detectSource({ url, contentType, body: res.data })

  // Si el sniff ahora resuelve a un adapter por host (HTML de comivex, etc.),
  // le pasamos el body ya fetcheado para que no haga un segundo GET.
  if (sniffed.type !== 'rss' && sniffed.adapter.parse) {
    return sniffed.adapter.parse(res.data, url)
  }
  return sniffed.adapter.parse(res.data)
}

export default { fetchItems, detectSource }
