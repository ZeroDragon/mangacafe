// Adapter genérico para graphic novels (Épica 14).
// Recibe { url, config } donde config = { selector, url_attr?, label_attr?, reverse? }.
// Fetchea el HTML, lo parsea con cheerio (ya instalado — sin deps nuevas), aplica
// el selector + extrae los atributos + opcionalmente invierte el orden, y normaliza
// a items [{ guid, title, link, pub_date }] listos para series_items.
//
// Convención de orden: después del reverse opcional, el array debe estar oldest→newest
// (Chapter 1 primero). normalizeItems asigna pub_date ascendente por índice para que
// el feed (ORDER BY pub_date DESC) muestre newest-first y la cascada mark-seen funcione.
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'node:crypto'

const CUSTOM_UA = process.env.CUSTOM_SOURCE_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const CUSTOM_TIMEOUT = Number(process.env.CUSTOM_SOURCE_TIMEOUT) || 15000

// fetch HTML plano con UA de browser (algunos sitios bloquean UAs genéricos).
const fetchHTML = async (url) => {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': CUSTOM_UA,
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: CUSTOM_TIMEOUT,
    responseType: 'text',
    transformResponse: [d => d]
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`fetch failed: HTTP ${res.status}`)
  }
  return res.data
}

// Lee un "attr" de un elemento cheerio. Casos:
//   'text'        → $(el).text() (contenido de texto)
//   'html'        → $(el).html() (contenido HTML)
//   cualquier otra string → $(el).attr(name) (atributo del tag: href, src, title, ...)
const readAttr = ($, el, name) => {
  if (name === 'text') return $(el).text().trim()
  if (name === 'html') return $(el).html() || ''
  return $(el).attr(name) || ''
}

// Extrae [{url,label}] a partir del HTML y la config.
// Aplica reverse si config.reverse === true (el sitio lista newest-first).
export const extractItems = (html, config) => {
  const { selector, url_attr = 'href', label_attr = 'text', reverse = false } = config
  const $ = cheerio.load(html)

  const matches = $(selector)
  if (matches.length === 0) {
    throw new Error(`selector '${selector}' matched no elements`)
  }

  const raw = matches.map((i, el) => ({
    url: readAttr($, el, url_attr),
    label: readAttr($, el, label_attr)
  })).get()                       // .get() convierte el cheerio array a array nativo

  // Validar que todos tengan URL (el atributo URL es obligatorio).
  const missingUrl = raw.filter(it => !it.url)
  if (missingUrl.length) {
    throw new Error(`${missingUrl.length} of ${raw.length} elements have no '${url_attr}' attribute`)
  }

  return reverse ? raw.reverse() : raw
}

// Normaliza [{url,label}] a items [{guid,title,link,pub_date}].
// - Resuelve URLs relativas contra baseUrl (cheerio NO resuelve href).
// - guid estable custom:{sha256(link)[:16]} para dedupe entre runs.
// - pub_date ascendente por índice: result[0] (más viejo) recibe el más bajo.
export const normalizeItems = (raw, baseUrl) => {
  if (!Array.isArray(raw)) throw new Error('extractItems must return an array')
  if (raw.length && (!raw[0] || typeof raw[0] !== 'object')) {
    throw new Error('extractItems items must be objects {url, label}')
  }
  const base = Math.floor(Date.now() / 1000)
  return raw.map((item, i) => {
    if (typeof item.url !== 'string' || !item.url) {
      throw new Error('each item must have a string "url"')
    }
    let link
    try { link = new URL(item.url, baseUrl).href } catch { link = item.url }
    return {
      guid: `custom:${crypto.createHash('sha256').update(link).digest('hex').slice(0, 16)}`,
      title: String(item.label ?? link),
      link,
      pub_date: base + i            // result[0] = más viejo
    }
  })
}

// Pipeline completo: fetch + extract + normalize.
// Devuelve { items } listos para insertMany.
export const parseCustomHTML = async (url, config) => {
  const html = await fetchHTML(url)
  return parseCustomHTMLFromBody(html, url, config)
}

// Variante con body ya fetcheado (reuso del orquestador cuando ya tiene el HTML).
export const parseCustomHTMLFromBody = (html, url, config) => {
  const raw = extractItems(html, config)
  const items = normalizeItems(raw, url)
  return { items }
}

export const CUSTOM_ADAPTER = {
  name: 'custom',
  // Adapter hace su propio GET (como comivex). Usado por el refresher.
  async fetch (url, config) {
    return parseCustomHTML(url, config)
  },
  // Reuso del body cuando el orquestador ya fetcheó (rama sniff).
  parse (body, url, config) {
    return parseCustomHTMLFromBody(body, url, config)
  },
  // Dry-run para el endpoint de preview: ejecuta extract+normalize y devuelve
  // los items en orden newest-first (reverse del normalizado oldest-first),
  // sin guid/pub_date, para que el frontend los muestre como el feed del detalle.
  async preview (url, config) {
    const html = await fetchHTML(url)
    const raw = extractItems(html, config)
    const items = normalizeItems(raw, url)
    // Orden newest-first (como el feed: pub_date DESC) y sin campos internos.
    const view = items
      .slice().sort((a, b) => b.pub_date - a.pub_date)
      .map(it => ({ title: it.title, link: it.link }))
    return { items: view, count: view.length }
  }
}

export default CUSTOM_ADAPTER
