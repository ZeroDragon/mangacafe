// Cliente propio para la Beta API de Crunchyroll.
//
// Reemplaza al paquete `crunchyroll.js`, que internamente mutaba un singleton
// (`cr.client`): dos requests concurrentes podían pisarse el access_token y
// mezclar cuentas. Acá cada instancia vive aislada con sus credenciales, que
// son transitorias (solo existen en memoria durante el request del backend).
//
// El login replica lo que hace el cliente web de Crunchyroll: un POST OAuth
// password-grant contra /auth/v1/token con unas client credentials públicas
// (las mismas que usa crunchyroll.js). A cambio obtenemos un access_token +
// account_id propios del usuario, y con eso llamamos a /content/v1.

const BASE = 'https://beta-api.crunchyroll.com'
const TOKEN_URL = `${BASE}/auth/v1/token`
const SUGGEST_BASE = 'https://v3.sg.media-imdb.com/suggestion'

// Client credentials del cliente web de Crunchyroll (públicas, vienen en el
// bundle del front). Las reutilizamos solo como puerta de entrada del OAuth.
const CLIENT_ID = 'xunihvedbt3mbisuhevt'
const CLIENT_SECRET = '1kIS5dyTvjE0_rqaA3YeAh0bUXUmxW11'

const PAGE_SIZE = 50

// Construye la etiqueta de episodio "S{season}E{episode}". Algunos items
// (PVs, películas) traen episode_number null; caemos a sequence_number y, si
// tampoco existe, mostramos solo la temporada.
const epLabel = (season, episode) => {
  const s = season != null ? `S${season}` : 'S?'
  if (episode == null) return s
  return `${s}E${episode}`
}

// Normaliza un item crudo de la watchlist al shape que usa el frontend.
// El item de la watchlist es el episodio "next-up" de cada serie; su estado
// describe ESE episodio:
//   - completion_status=true  → visto
//   - playhead>0 (sin completar) → viéndolo, incompleto
//   - never_watched=true      → la serie/episodio no se arrancó
//   - new=true (never_watched=false, playhead 0) → hay estreno sin ver, pero
//     la serie sí se siguió antes
const normalize = (it) => {
  const panel = it.panel || {}
  const m = panel.episode_metadata || {}
  const name = m.series_title || '(sin título)'
  const season = m.season_number
  const episode = m.episode_number != null ? m.episode_number : m.sequence_number
  const title = panel.title || ''
  const watched = it.completion_status === true
  const never = it.never_watched === true
  const partial = !watched && Number(it.playhead) > 0

  let status
  if (never) status = 'unstarted'
  else if (watched) status = 'watched'
  else if (partial) status = 'incomplete'
  else status = 'pending'

  // URL pública de Crunchyroll para abrir la serie. El panel trae series_id +
  // series_slug_title en episode_metadata; con eso armamos /series/<id>/<slug>.
  // Si no están (PVs, películas), caemos a null.
  const seriesId = m.series_id
  const seriesSlug = m.series_slug_title
  const crUrl = seriesId
    ? `https://www.crunchyroll.com/series/${seriesId}${seriesSlug ? '/' + seriesSlug : ''}`
    : null

  // Thumbnail del episodio desde el panel, por si IMDB no resuelve cover.
  // Estructura: panel.images.thumbnail[0] = [{source,width,height}, ...]
  const thumbs = panel.images?.thumbnail?.[0]
  const crPoster = thumbs?.length ? thumbs[thumbs.length - 1].source : null

  return {
    name,
    season,
    episode,
    title,
    status,
    label: status === 'unstarted' ? 'unstarted' : epLabel(season, episode),
    cr_url: crUrl,
    cr_poster: crPoster
  }
}

// Orden de interés: lo que estás viendo primero, luego estrenos pendientes,
// después lo completado y al final lo que ni arrancaste.
const RANK = { incomplete: 0, pending: 1, watched: 2, unstarted: 3 }

// Resuelve un nombre de serie a su ttId + poster de IMDB vía la API pública de
// sugerencias (la que usa el autocomplete de imdb.com). Sin API key.
//
// Devuelve { ttId, label, poster, imdbUrl, season } ya armado para pre-poblar
// el alta de series, o { error } si no hay match. season se normaliza a string
// y default '1' (algunos animes arrancan sin temporada explícita).
export async function resolveImdb(name, season) {
  if (!name || !String(name).trim()) return { error: 'name is required' }
  const q = String(name).trim()
  // La URL de sugerencias se indexa por la primera letra (minúscula) del query.
  const first = encodeURIComponent(q[0].toLowerCase())
  const path = encodeURIComponent(q) + '.json'
  const url = `${SUGGEST_BASE}/${first}/${path}`

  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (e) {
    return { error: `Network error talking to IMDB: ${e.message}` }
  }
  if (!res.ok) return { error: `IMDB suggestion HTTP ${res.status}` }

  const j = await res.json().catch(() => null)
  const hits = (j && j.d) || []
  if (!hits.length) return { error: 'no IMDB match' }

  // Preferimos series de TV (qid=tvSeries); si no, primer hit.
  const hit = hits.find(x => x.qid === 'tvSeries') || hits[0]
  const ttId = hit.id
  const s = season && String(season) !== '0' ? String(season) : '1'
  return {
    ttId,
    label: hit.l || q,
    poster: (hit.i && hit.i.imageUrl) || null,
    imdbUrl: `https://www.imdb.com/title/${ttId}/episodes/?season=${s}`,
    season: s
  }
}

// Instancia de cliente de Crunchyroll, una por request del backend.
// Las credenciales viven solo en la instancia y no se persisten.
export class CrunchyrollClient {
  constructor(email, password, { locale = 'en-US' } = {}) {
    if (!email || !password) {
      throw new Error('email and password are required')
    }
    this.email = email
    this.password = password
    this.locale = locale
    this.accessToken = null
    this.accountId = null
  }

  // OAuth password-grant contra /auth/v1/token. Guarda access_token y
  // account_id en la instancia para los requests siguientes.
  async login() {
    const authorization =
      'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const body = new URLSearchParams({
      username: this.email,
      password: this.password,
      grant_type: 'password',
      scope: 'offline_access'
    })

    let res
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
        },
        body: body.toString()
      })
    } catch (e) {
      throw new Error(`Network error talking to Crunchyroll: ${e.message}`)
    }

    if (!res.ok) {
      let detail = `Crunchyroll login failed (${res.status})`
      try {
        const j = await res.json()
        if (j?.error) detail += `: ${j.error}`
      } catch {
        // cuerpo no JSON; nos quedamos con el status
      }
      throw new Error(detail)
    }

    const json = await res.json()
    if (!json.account_id) throw new Error('Invalid credentials')

    this.accessToken = `${json.token_type} ${json.access_token}`
    this.accountId = json.account_id
    return this
  }

  // GET autenticado a un path relativo de la Beta API con query params.
  // Lanza si no se hizo login o si la API responde != 2xx.
  async get(path, params = {}) {
    if (!this.accessToken) {
      throw new Error('Client not authenticated; call login() first')
    }
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

    let res
    try {
      res = await fetch(url, { headers: { Authorization: this.accessToken } })
    } catch (e) {
      throw new Error(`Network error talking to Crunchyroll: ${e.message}`)
    }
    if (!res.ok) throw new Error(`Crunchyroll API error: ${res.status}`)
    return res.json()
  }

  // Trae todos los items crudos de la watchlist paginando de a PAGE_SIZE.
  async fetchWatchlistRaw() {
    const items = []
    let start = 0
    while (true) {
      const body = await this.get(`/content/v1/${this.accountId}/watchlist`, {
        n: PAGE_SIZE,
        start
      })
      const batch = body.items || []
      items.push(...batch)
      if (items.length >= (body.total || 0) || !batch.length) break
      start += PAGE_SIZE
    }
    return items
  }

  // Devuelve la watchlist normalizada y ordenada por estado.
  async getWatchlist() {
    const items = await this.fetchWatchlistRaw()
    return items.map(normalize).sort((a, b) => {
      const r = (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9)
      if (r) return r
      return a.name.localeCompare(b.name)
    })
  }
}

// Helper de conveniencia: crea un cliente, loguea y devuelve la watchlist.
// Pensado para usarse una sola vez por request del backend.
export async function getWatchlist(email, password) {
  const client = new CrunchyrollClient(email, password)
  await client.login()
  return client.getWatchlist()
}
