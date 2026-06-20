import db from './db.mjs'

// items: [{ guid, title, link, pub_date }]
// Inserta todos, ignorando duplicados de (series_id, guid). Devuelve cuántos insertó.
const insertMany = (seriesId, items) => {
  return new Promise(resolve => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO series_items (series_id, guid, title, link, pub_date)
       VALUES (?, ?, ?, ?, ?)`
    )
    let inserted = 0
    db.serialize(() => {
      for (const item of items || []) {
        stmt.run(
          [seriesId, item.guid, item.title, item.link, item.pub_date],
          function (err) {
            if (err) console.error(err)
            else if (this.changes > 0) inserted++
          }
        )
      }
      stmt.finalize((err) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ success: true, inserted })
      })
    })
  })
}

const pendingCount = (seriesId) => {
  return new Promise(resolve => {
    db.get(
      `SELECT COUNT(*) AS count FROM series_items WHERE series_id = ? AND seen = 0`,
      [seriesId],
      (err, row) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ data: row ? row.count : 0 })
      }
    )
  })
}

// Agregación por serie para el dashboard: [{ series_id, series_name, ..., pending }]
const pendingByUser = (userId) => {
  return new Promise(resolve => {
    db.all(
      `SELECT s.id AS series_id, s.name, s.type, s.cover_url, s.current_chapter,
              s.last_error, s.last_checked_at,
              COALESCE(si.pending, 0) AS pending
       FROM series s
       LEFT JOIN (
         SELECT series_id, COUNT(*) AS pending
         FROM series_items
         WHERE seen = 0
         GROUP BY series_id
       ) si ON si.series_id = s.id
       WHERE s.user_id = ?
       ORDER BY pending DESC, s.updated_at DESC`,
      [userId],
      (err, rows) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ data: rows })
      }
    )
  })
}

const markSeen = (itemId) => {
  return new Promise(resolve => {
    db.run(
      `UPDATE series_items SET seen = 1 WHERE id = ?`,
      [itemId],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Item not found' })
        resolve({ success: true })
      }
    )
  })
}

// Marca como vistos todos los items de la serie con id <= itemId (o hasta la fecha upToDate).
// upToDate: itemId del item límite (inclusive). Todos los anteriores (por pub_date/created_at) también se marcan.
const markSeenUpTo = (seriesId, itemId) => {
  return new Promise(resolve => {
    db.run(
      `UPDATE series_items
       SET seen = 1
       WHERE series_id = ?
         AND seen = 0
         AND (created_at, id) <= (
           SELECT created_at, id FROM series_items WHERE id = ? AND series_id = ?
         )`,
      [seriesId, itemId, seriesId],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ success: true, updated: this.changes })
      }
    )
  })
}

const listBySeries = (seriesId, { onlyPending = false } = {}) => {
  return new Promise(resolve => {
    const where = onlyPending ? `AND seen = 0` : ``
    db.all(
      `SELECT * FROM series_items WHERE series_id = ? ${where} ORDER BY pub_date DESC, created_at DESC`,
      [seriesId],
      (err, rows) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ data: rows })
      }
    )
  })
}

export default {
  insertMany,
  pendingCount,
  pendingByUser,
  markSeen,
  markSeenUpTo,
  listBySeries
}
