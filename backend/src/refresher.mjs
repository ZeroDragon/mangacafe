import db from './models/db.mjs'
import series from './models/series.mjs'
import seriesItem from './models/series_item.mjs'
import fetchEpisodes, { airedUntilEpoch } from './imdb.mjs'
import sources from './sources/index.mjs'

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h (decisión 5)
const DELAY_BETWEEN_FETCHES_MS = 800 // rate limit suave entre fetches

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const now = () => Math.floor(Date.now() / 1000)

// Refresca una sola serie ramificando por type (Épica 9; Épica 12 delega
// manga → sources.fetchItems que auto-detecta RSS vs HTML scraper):
//  - anime: IMDB (fetchEpisodes + purga de no emitidos).
//  - manga: sources (RSS/Atom o adapter de host — p.ej. comivex.com).
// Setea last_error en fallo (no revienta al caller). Skipea si no tiene el feed
// que corresponde a su tipo.
const refreshSeries = async (s) => {
  if (s.type === 'manga') return refreshManga(s)
  return refreshAnime(s)
}

const refreshAnime = async (s) => {
  if (!s.imdb_url) return { skipped: true }
  try {
    const { items, total } = await fetchEpisodes(s.imdb_url)
    const { inserted } = await seriesItem.insertMany(s.id, items)
    // Sincroniza: purga items con fecha futura que se colaron antes (bugs de tz
    // previos, cambios de fecha en IMDB). Así no cuentan como pendientes.
    await seriesItem.deleteFuture(s.id, airedUntilEpoch())
    await series.update(s.id, s.user_id, {
      last_known_total: items.length,
      last_checked_at: now(),
      last_error: null
    })
    return { success: true, total, inserted }
  } catch (err) {
    const message = err?.message || String(err)
    await series.update(s.id, s.user_id, {
      last_checked_at: now(),
      last_error: message.slice(0, 500)
    })
    return { error: message }
  }
}

const refreshManga = async (s) => {
  if (!s.rss_url) return { skipped: true }
  try {
    // source_config (Épica 14) viaja como string JSON en la DB; lo parseamos
    // aquí. Si es null/vacío/malformado → opts.config falsy → flujo Épica 12.
    let config = null
    if (s.source_config) {
      try { config = typeof s.source_config === 'string' ? JSON.parse(s.source_config) : s.source_config }
      catch { config = null }
    }
    const { items } = await sources.fetchItems(s.rss_url, { config })
    const { inserted } = await seriesItem.insertMany(s.id, items)
    const total = items.length
    await series.update(s.id, s.user_id, {
      last_known_total: total,
      last_checked_at: now(),
      last_error: null
    })
    return { success: true, total, inserted }
  } catch (err) {
    const message = err?.message || String(err)
    await series.update(s.id, s.user_id, {
      last_checked_at: now(),
      last_error: message.slice(0, 500)
    })
    return { error: message }
  }
}

// Refresca todas las series con un feed (imdb_url o rss_url, de todos los usuarios).
const refreshAll = async () => {
  const rows = await new Promise(resolve => {
    db.all(
      `SELECT * FROM series
       WHERE (imdb_url IS NOT NULL AND imdb_url != '')
          OR (rss_url IS NOT NULL AND rss_url != '')`,
      [],
      (err, data) => {
        if (err) {
          console.error('refreshAll SELECT:', err)
          return resolve([])
        }
        resolve(data)
      }
    )
  })

  let refreshed = 0
  let failed = 0
  for (const s of rows) {
    const res = await refreshSeries(s)
    if (res.error) failed++
    else if (!res.skipped) refreshed++
    await sleep(DELAY_BETWEEN_FETCHES_MS)
  }
  return { refreshed, failed, total: rows.length }
}

// Refresca las series de un usuario (para el endpoint on-demand). Respeta ownership.
const refreshByUser = async (userId) => {
  const { data } = await series.listByUser(userId)
  const own = (data || []).filter(s => {
    if (s.type === 'manga') return !!s.rss_url
    return !!s.imdb_url
  })
  let refreshed = 0
  let failed = 0
  for (const s of own) {
    const res = await refreshSeries(s)
    if (res.error) failed++
    else if (!res.skipped) refreshed++
    await sleep(DELAY_BETWEEN_FETCHES_MS)
  }
  return { refreshed, failed, total: own.length }
}

// Scheduler interno: corre cada 6h + refresh inicial al boot (producción).
let schedulerHandle = null
const startScheduler = ({ intervalMs = REFRESH_INTERVAL_MS, runImmediately = false } = {}) => {
  if (schedulerHandle) return schedulerHandle
  const loop = async () => {
    try {
      const res = await refreshAll()
      console.log(`[feeds] refreshAll: refreshed=${res.refreshed} failed=${res.failed} total=${res.total}`)
    } catch (err) {
      console.error('[feeds] scheduler error:', err)
    }
  }
  if (runImmediately) loop()
  schedulerHandle = setInterval(loop, intervalMs)
  // no mantener vivo el proceso solo por el interval (tests lo importan)
  if (schedulerHandle.unref) schedulerHandle.unref()
  return schedulerHandle
}

const stopScheduler = () => {
  if (schedulerHandle) {
    clearInterval(schedulerHandle)
    schedulerHandle = null
  }
}

export default {
  refreshSeries,
  refreshAnime,
  refreshManga,
  refreshAll,
  refreshByUser,
  startScheduler,
  stopScheduler
}
