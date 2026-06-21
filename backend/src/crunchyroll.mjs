import { createRequire } from 'module'

// Cliente de la Beta API de Crunchyroll.
// crunchyroll.js es CommonJS y además muta un singleton (`cr.client`), así que
// lo usamos solo para el login (obtiene access_token + account_id) y a partir
// de ahí hacemos las peticiones de watchlist con `fetch`, independientes del
// estado compartido. Cada petición del backend es secuencial aquí, así que no
// hay riesgo de pisar el token entre usuarios en este MVP.
const require = createRequire(import.meta.url)
const cr = require('crunchyroll.js')

const BASE = 'https://beta-api.crunchyroll.com'

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

  return {
    name,
    season,
    episode,
    title,
    status,
    label: status === 'unstarted' ? 'sin empezar' : epLabel(season, episode)
  }
}

// Orden de interés: lo que estás viendo primero, luego estrenos pendientes,
// después lo completado y al final lo que ni arrancaste.
const RANK = { incomplete: 0, pending: 1, watched: 2, unstarted: 3 }

// Trae toda la watchlist del usuario y la devuelve normalizada y ordenada.
// Recibe las credenciales de Crunchyroll (no se persisten).
export async function getWatchlist(email, password) {
  if (!email || !password) return { error: 'email and password are required' }

  const login = await cr.login(email, password)
  if (!login.success) return { error: login.message || 'Crunchyroll login failed' }

  const token = cr.client.access_token
  const accountId = cr.client.id

  const items = []
  let start = 0
  // Pagina de a 50 hasta juntar el total.
  while (true) {
    const url = `${BASE}/content/v1/${accountId}/watchlist?n=50&start=${start}`
    let res
    try {
      res = await fetch(url, { headers: { Authorization: token } })
    } catch (e) {
      return { error: `Network error talking to Crunchyroll: ${e.message}` }
    }
    if (!res.ok) return { error: `Crunchyroll API error: ${res.status}` }
    const body = await res.json()
    const batch = body.items || []
    items.push(...batch)
    if (items.length >= (body.total || 0) || !batch.length) break
    start += 50
  }

  const data = items.map(normalize).sort((a, b) => {
    const r = (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9)
    if (r) return r
    return a.name.localeCompare(b.name)
  })

  return { data }
}
