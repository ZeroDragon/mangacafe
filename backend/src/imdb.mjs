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

// Zona horaria usada para decidir "qué día es hoy" al filtrar episodios futuros.
// IMDB devuelve la fecha de emisión como fecha calendaria (sin zona horaria);
// para saber si un episodio YA se emitió hay que comparar contra el día actual
// en una zona horaria concreta. Por defecto usamos la TZ del sistema del proceso
// (en dev del usuario suele ser su TZ local); en producción se puede afinar con
// IMDB_TZ (ej. "America/Mexico_City"). Comparar fechas calendariais evita que un
// episodio aparezca como disponible el día ANTERIOR a su estreno en zonas
// occidentales (UTC negativo), que es lo que pasaba al comparar instantes UTC.
const IMDB_TZ = process.env.IMDB_TZ ||
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  'UTC'

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
// El epoch se almacena así (medianoche UTC) y el frontend DEBE mostrarlo con
// timeZone: 'UTC' para que la fecha calendaria no se desplace según la TZ del
// navegador.
const releaseToEpoch = (rd) => {
  if (!rd || !rd.year) return null
  // month/day pueden venir undefined para fechas parciales; default a 1.
  const m = rd.month || 1
  const d = rd.day || 1
  const ms = Date.UTC(rd.year, m - 1, d, 0, 0, 0)
  return Math.floor(ms / 1000)
}

// {year,month,day} del instante actual en la zona horaria configurada (IMDB_TZ).
const todayInTz = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IMDB_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = (t) => Number(parts.find(p => p.type === t).value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

// Compara dos fechas calendariais: -1 si a<b, 0 si ==, 1 si a>b.
const cmpDate = (a, b) => {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1
  if (a.month !== b.month) return a.month < b.month ? -1 : 1
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  return 0
}

// Epoch límite (segundos): items con pub_date <= este valor ya se emitieron.
// Es la medianoche UTC del día actual en IMDB_TZ. Como pub_date se guarda como
// medianoche UTC del día de emisión, comparar `pub_date > airedUntilEpoch()`
// identifica fechas calendariais posteriores a hoy (episodios no emitidos).
// Útil para purgar de la DB items futuros insertados por bugs previos.
const airedUntilEpoch = () => {
  const today = todayInTz()
  return Math.floor(Date.UTC(today.year, today.month - 1, today.day, 0, 0, 0) / 1000)
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

  // "Hoy" como fecha calendaria en la tz configurada: un episodio está disponible
  // cuando su fecha de emisión <= hoy (en esa tz). Comparar fechas calendariais
  // (no instantes) evita el desfase de un día en zonas horarias negativas.
  const today = todayInTz()
  const items = []
  for (const edge of (eps.edges || [])) {
    const n = edge?.node
    if (!n || !n.id) continue
    const rd = n.releaseDate
    if (!rd || !rd.year) continue   // sin fecha → no emitido
    const released = { year: rd.year, month: rd.month || 1, day: rd.day || 1 }
    if (cmpDate(released, today) > 0) continue   // futuro → aún no disponible
    const pubDate = releaseToEpoch(rd)
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
export { parseImdbUrl, SEASON_QUERY, airedUntilEpoch }
