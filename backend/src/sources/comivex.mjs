// Adapter de comivex.com: port de experiments/comivex-scraper/scrape.mjs.
// Hace su propio GET con UA de browser realista (cloudflare en el medio) y
// produce items [{ guid, title, link, pub_date }] listos para series_items.
import axios from 'axios'
import * as cheerio from 'cheerio'

const BASE = 'https://comivex.com'

const COMIVEX_UA = process.env.COMIVEX_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const COMIVEX_TIMEOUT = Number(process.env.COMIVEX_TIMEOUT) || 15000

// Convierte "1 week, 2 days ago" / "5 years, 5 months ago" / "10 months ago" → epoch seconds.
// Aproximaciones: 1y=365d, 1mo=30d, 1w=7d. Suficiente para ordenamiento cronológico
// en series_items (el dedupe es por guid, no por fecha).
const parseAgeToEpoch = (raw) => {
  if (!raw) return null
  const txt = raw.toLowerCase().replace(/ago/, '').trim()
  const parts = txt.split(',').map(s => s.trim()).filter(Boolean)
  let secs = 0
  for (const p of parts) {
    const m = p.match(/^(\d+)\s+(year|month|week|day|hour|minute|second)s?$/)
    if (!m) continue
    const n = Number(m[1])
    const unit = m[2]
    const mul = {
      year: 365 * 86400,
      month: 30 * 86400,
      week: 7 * 86400,
      day: 86400,
      hour: 3600,
      minute: 60,
      second: 1
    }[unit]
    secs += n * mul
  }
  if (secs === 0) return null
  return Math.floor(Date.now() / 1000) - secs
}

// Devuelve { items } listos para insertMany. Items con guid estable
// `comivex:{mangaId}:{chapterNumber}` para que el dedupe funcione entre runs.
export const parseComivexHTML = (html, url) => {
  const $ = cheerio.load(html)

  // Detectar el mangaId desde el botón "Start Reading" (/read/1295/1-eng-li/).
  const startLink = $('.btn-read').attr('href') || ''
  const mangaId = startLink.match(/\/read\/(\d+)\//)?.[1] || null

  const items = []
  $('.ch-item').each((_, el) => {
    const $el = $(el)
    const href = $el.find('.ch-link').attr('href')
    const numText = $el.find('.ch-num').text().trim()         // "Chapter 75"
    const ageText = $el.find('.ch-date').text().trim()        // "1 week, 2 days ago"

    const chapterNumber = numText.replace(/^Chapter\s+/i, '')
    items.push({
      guid: `comivex:${mangaId || 'unknown'}:${chapterNumber}`,
      title: numText,
      link: href && href.startsWith('http') ? href : `${BASE}${href || ''}`,
      pub_date: parseAgeToEpoch(ageText)
    })
  })

  return { items, _meta: { mangaId, url } }
}

export const COMIVEX_ADAPTER = {
  name: 'comivex',
  hosts: ['comivex.com', 'www.comivex.com'],
  // Adapter hace su propio GET con headers de browser (cloudflare en el medio).
  async fetch (url) {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': COMIVEX_UA,
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: COMIVEX_TIMEOUT,
      responseType: 'text',
      transformResponse: [d => d]
    })
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`)
    }
    return parseComivexHTML(res.data, url)
  },
  // Reuso del body cuando el orquestador ya fetcheó (rama "HTML sniff").
  parse (body, url) {
    return parseComivexHTML(body, url)
  }
}

export default COMIVEX_ADAPTER
