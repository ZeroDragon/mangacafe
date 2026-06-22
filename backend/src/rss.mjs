import xml2js from 'xml2js'

const parser = new xml2js.Parser({ explicitArray: false, trim: true })

// guid fallback: si no trae <guid>, usar link; si no, hash ligero de title+pub_date.
const fallbackGuid = (item) => {
  if (item.guid) return String(item.guid)
  if (item.link) return String(item.link)
  const seed = `${item.title || ''}|${item.pubDate || ''}|${item.published || ''}`
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i)
    h |= 0
  }
  return `auto-${h}`
}

// Normaliza fechas RFC822 / ISO a epoch segundos; si falla, ahora.
const toEpoch = (raw) => {
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? Math.floor(Date.now() / 1000) : Math.floor(t / 1000)
}

// Extrae texto desde un objeto que puede ser string, objeto con _, o array.
const text = (v) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return v._ || v['$']?.value || ''
  return String(v)
}

// Normaliza un feed RSS 2.0 o Atom a items [{ guid, title, link, pub_date }]
const parseFeed = async (xml) => {
  const parsed = await parser.parseStringPromise(xml)
  const items = []

  // RSS 2.0: rss.channel.item (uno o muchos)
  if (parsed?.rss?.channel) {
    const channel = parsed.rss.channel
    const raw = [].concat(channel.item || [])
    for (const it of raw) {
      items.push({
        guid: fallbackGuid(it),
        title: text(it.title),
        link: text(it.link),
        pub_date: toEpoch(it.pubDate || it.date)
      })
    }
    return items
  }

  // Atom: feed.entry (uno o muchos)
  if (parsed?.feed?.entry) {
    const raw = [].concat(parsed.feed.entry)
    for (const it of raw) {
      // <link href="..."/> puede ser uno o varios; preferimos el rel="alternate" o el primero
      let link = ''
      if (Array.isArray(it.link)) {
        const alt = it.link.find(l => l?.$?.rel === 'alternate') || it.link[0]
        link = alt?.$?.href || ''
      } else if (it.link?.$?.href) {
        link = it.link.$.href
      } else {
        link = text(it.link)
      }
      // guid fallback: usar <id> si viene, sino el link
      const guid = it.id ? text(it.id) : (link || fallbackGuid(it))
      items.push({
        guid,
        title: text(it.title),
        link,
        pub_date: toEpoch(it.published || it.updated)
      })
    }
    return items
  }

  return items
}

export default parseFeed
export { fallbackGuid, toEpoch }
