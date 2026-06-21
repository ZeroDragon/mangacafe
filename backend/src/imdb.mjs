import axios from 'axios'

// Scraper de IMDB vía su endpoint GraphQL interno (api.graphql.imdb.com).
// El HTML público de imdb.com/.../episodes está detrás de AWS WAF (reto JS),
// pero el endpoint GraphQL que usa la propia web es accesible directamente y
// devuelve los episodios de forma estructurada y estable (sin selectores CSS).
//
// Mapea cada episodio a un item del feed de la serie:
//   { guid, title, link, pub_date }
// - guid: ttId del episodio (único global en IMDB → dedupe perfecto).
// - title: "S{season} E{n}: {titulo}".
// - link: canonical URL del episodio en IMDB.
// - pub_date: epoch (UTC 00:00) de la fecha de emisión.

const DEFAULT_ENDPOINT = 'https://api.graphql.imdb.com/'
const DEFAULT_UA = process.env.IMDB_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const DEFAULT_TIMEOUT = Number(process.env.IMDB_TIMEOUT) || 15000

// Extrae { ttId, season } de una URL de episodios de IMDB.
// Acepta: https://www.imdb.com/title/tt19223420/episodes/?season=2
// También soporta ?season=1 (default 1) y sin /episodes/ (sólo /title/tt...).
const parseImdbUrl = (url) => {
  if (!url || typeof url !== 'string') return { error: 'missing IMDB url' }
  const tt = url.match(/\/title\/(tt\d+)/i)
  if (!tt) return { error: 'IMDB url must contain a /title/ttXXXXXXX/ id' }
  const seasonMatch = url.match(/[?&]season=(\d+)/i)
  const season = seasonMatch ? seasonMatch[1] : '1'
  return { ttId: tt[1], season }
}

const SEASON_QUERY = `query Season($titleId: ID!, $season: String!) {
  title(id: $titleId) {
    episodes {
      episodes(first: 200, filter: { includeSeasons: [$season] }) {
        total
        edges {
          position
          node {
            id
            titleText { text }
            canonicalUrl
            releaseDate { day month year }
          }
        }
      }
    }
  }
}`

// epoch (segundos) para una fecha {year,month,day} a 00:00 UTC; null si falta year.
const releaseToEpoch = (rd) => {
  if (!rd || !rd.year) return null
  // month/day pueden venir undefined para fechas parciales; default a 1.
  const m = rd.month || 1
  const d = rd.day || 1
  const ms = Date.UTC(rd.year, m - 1, d, 0, 0, 0)
  return Math.floor(ms / 1000)
}

// Trae los episodios de una temporada desde IMDB y los normaliza a items del feed.
// Opciones (todas opcionales, con defaults de env): endpoint, userAgent, timeout.
// Filtra episodios sin fecha de emisión o con fecha futura (no emitidos aún):
// esos no deben contarse como "pendientes" hasta que se emitan.
const fetchEpisodes = async (imdbUrl, opts = {}) => {
  const parsed = parseImdbUrl(imdbUrl)
  if (parsed.error) throw new Error(parsed.error)

  const endpoint = opts.endpoint || process.env.IMDB_GRAPHQL_ENDPOINT || DEFAULT_ENDPOINT
  const userAgent = opts.userAgent || DEFAULT_UA
  const timeout = opts.timeout || DEFAULT_TIMEOUT

  const res = await axios.post(
    endpoint,
    {
      query: SEASON_QUERY,
      variables: { titleId: parsed.ttId, season: String(parsed.season) }
    },
    {
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout,
      responseType: 'json',
      // Evitar que axios transforme/parse dos veces: trabajamos con el JSON ya parseado.
      validateStatus: () => true
    }
  )

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`IMDB HTTP ${res.status}`)
  }
  const body = res.data
  if (!body) throw new Error('IMDB: empty response body')
  if (body.errors && body.errors.length) {
    const msg = body.errors.map(e => e.message).join('; ')
    throw new Error(`IMDB GraphQL: ${msg.slice(0, 300)}`)
  }

  const eps = body?.data?.title?.episodes?.episodes
  if (!eps) throw new Error('IMDB: title not found or not a TV series')

  const nowSec = Math.floor(Date.now() / 1000)
  const items = []
  for (const edge of (eps.edges || [])) {
    const n = edge?.node
    if (!n || !n.id) continue
    const pubDate = releaseToEpoch(n.releaseDate)
    if (pubDate == null) continue           // sin fecha → no emitido
    if (pubDate > nowSec) continue          // futuro → aún no disponible
    const titleText = n.titleText?.text || '(untitled)'
    items.push({
      guid: n.id,
      title: `S${parsed.season} E${edge.position ?? '?'}: ${titleText}`,
      link: n.canonicalUrl || `https://www.imdb.com/title/${n.id}/`,
      pub_date: pubDate
    })
  }
  return { items, total: eps.total ?? items.length, ttId: parsed.ttId, season: parsed.season }
}

export default fetchEpisodes
export { parseImdbUrl, SEASON_QUERY }
