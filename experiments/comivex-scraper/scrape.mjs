import axios from 'axios'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BASE = 'https://comivex.com'

// Convierte "1 week, 2 days ago" / "5 years, 5 months ago" / "10 months ago" → epoch seconds.
// Soporta: year(s), month(s), week(s), day(s), hour(s), minute(s).
// Aproximaciones: 1y=365d, 1mo=30d, 1w=7d. Suficiente para ordenamiento.
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

const scrapeSeries = async (url) => {
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 15000,
    responseType: 'text',
    transformResponse: [d => d]
  })
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`)
  const $ = cheerio.load(res.data)

  // Metadata de la serie
  const title = $('.md-title').first().text().trim()
  const cover = $('.md-cover').first().attr('src') || null
  const status = $('.md-status').first().text().trim()
  const author = $('.md-author span').first().text().trim()
  const totalChaptersText = $('.md-stat').first().text().match(/(\d+)\s*Chapters/)?.[1]
  const totalChapters = totalChaptersText ? Number(totalChaptersText) : null
  const genres = $('.md-genre-pill').map((_, el) => $(el).text().trim()).get()
  const synopsis = $('#synopsis').text().trim()

  // Detectar el manga_id desde el botón Start Reading: /read/1295/1-eng-li/
  const startLink = $('.btn-read').attr('href') || ''
  const mangaId = startLink.match(/\/read\/(\d+)\//)?.[1] || null

  // Capítulos: cada <li class="ch-item"> tiene un <a class="ch-link">
  const chapters = []
  $('.ch-item').each((_, el) => {
    const $el = $(el)
    const $link = $el.find('.ch-link')
    const href = $link.attr('href')
    const numText = $el.find('.ch-num').text().trim()      // "Chapter 75"
    const views = Number(($el.find('.ch-views').text().match(/(\d[\d.]*)/) || [])[1] || 0)
    const ageText = $el.find('.ch-date').text().trim()     // "1 week, 2 days ago"

    const chapterNumber = numText.replace(/^Chapter\s+/i, '')
    chapters.push({
      guid: `comivex:${mangaId || 'unknown'}:${chapterNumber}`,
      number: chapterNumber,
      title: numText,
      link: href?.startsWith('http') ? href : `${BASE}${href}`,
      views,
      raw_age: ageText,
      pub_date: parseAgeToEpoch(ageText)
    })
  })

  return {
    title,
    cover,
    status,
    author,
    total_chapters_declared: totalChapters,
    total_chapters_scraped: chapters.length,
    manga_id: mangaId,
    genres,
    synopsis,
    chapters
  }
}

// CLI: node scrape.mjs <url>
const url = process.argv[2] || 'https://comivex.com/series/1295-shinmai-ossan-bouken-sha-saikyou-paati-ni-shinu-hodo-kitae-rarete-muteki-ni-naru/'

try {
  const data = await scrapeSeries(url)
  console.log('═══ SERIE ═══')
  console.log(`Título:     ${data.title}`)
  console.log(`Manga ID:   ${data.manga_id}`)
  console.log(`Cover:      ${data.cover}`)
  console.log(`Estado:     ${data.status}`)
  console.log(`Autor:      ${data.author}`)
  console.log(`Géneros:    ${data.genres.join(', ')}`)
  console.log(`Capítulos:  ${data.total_chapters_scraped} scrapeados / ${data.total_chapters_declared} declarados`)
  console.log(`Synopsis:   ${data.synopsis.slice(0, 120)}...`)
  console.log('\n═══ PRIMEROS 5 CAPÍTULOS (más recientes) ═══')
  for (const c of data.chapters.slice(0, 5)) {
    console.log(`  ${c.title.padEnd(14)} | views: ${String(c.views).padStart(6)} | ${c.raw_age} | ${c.link}`)
  }
  console.log('\n═══ ÚLTIMOS 3 (más viejos) ═══')
  for (const c of data.chapters.slice(-3)) {
    console.log(`  ${c.title.padEnd(14)} | views: ${String(c.views).padStart(6)} | ${c.raw_age} | ${c.link}`)
  }

  // Muestra también el primer item en formato compatible con el schema del backend
  console.log('\n═══ ITEM COMPATIBLE CON BACKEND (primer cap.) ═══')
  const sample = data.chapters[0]
  console.log(JSON.stringify({
    guid: sample.guid,
    title: sample.title,
    link: sample.link,
    pub_date: sample.pub_date
  }, null, 2))
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
}
