import db from './models/db.mjs'
import series from './models/series.mjs'
import seriesItem from './models/series_item.mjs'
import fetchEpisodes from './imdb.mjs'

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h (decisión 5)
const DELAY_BETWEEN_FETCHES_MS = 800 // rate limit suave entre fetches

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const now = () => Math.floor(Date.now() / 1000)

// Refresca una sola serie. Setea last_error en fallo (no revienta al caller).
const refreshSeries = async (s) => {
  if (!s.imdb_url) return { skipped: true }
  try {
    const { items, total } = await fetchEpisodes(s.imdb_url)
    const { inserted } = await seriesItem.insertMany(s.id, items)
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

// Refresca todas las series con imdb_url (de todos los usuarios). Scheduler de fondo.
const refreshAll = async () => {
  const rows = await new Promise(resolve => {
    db.all(
      `SELECT * FROM series WHERE imdb_url IS NOT NULL AND imdb_url != ''`,
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
  const own = (data || []).filter(s => s.imdb_url)
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
      console.log(`[imdb] refreshAll: refreshed=${res.refreshed} failed=${res.failed} total=${res.total}`)
    } catch (err) {
      console.error('[imdb] scheduler error:', err)
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
  refreshAll,
  refreshByUser,
  startScheduler,
  stopScheduler
}
