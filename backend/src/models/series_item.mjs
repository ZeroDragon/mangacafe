import db from './db.mjs'

// Recalcula series.last_read a partir del item visto más reciente
// (mismo orden que el feed: pub_date DESC, created_at DESC, id DESC).
// NULL si no hay ninguno visto ("No data" en la UI). Se llama al final
// de cada mutación de seen para mantener el indicador siempre al día.
const recomputeLastRead = (seriesId) => {
  return new Promise(resolve => {
    db.get(
      `SELECT title FROM series_items
       WHERE series_id = ? AND seen = 1
       ORDER BY pub_date DESC, created_at DESC, id DESC
       LIMIT 1`,
      [seriesId],
      (err, row) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        const lastRead = row ? row.title : null
        db.run(
          `UPDATE series SET last_read = ?, updated_at = strftime('%s', 'now') WHERE id = ?`,
          [lastRead, seriesId],
          (err) => {
            if (err) {
              console.error(err)
              return resolve({ error: err })
            }
            resolve({ last_read: lastRead })
          }
        )
      }
    )
  })
}

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
      `SELECT s.id AS series_id, s.name, s.type, s.cover_url, s.last_read,
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

// Agregación completa para el dashboard: une series + conteo de pendientes
// + último item pendiente (título y fecha). Ordenado por pendientes DESC.
const dashboardByUser = (userId) => {
  return new Promise(resolve => {
    db.all(
      `SELECT s.*, COALESCE(p.pending, 0) AS pending,
              li.title AS last_item_title, li.pub_date AS last_item_date, li.id AS last_item_id, li.link AS last_item_link
       FROM series s
       LEFT JOIN (
         SELECT series_id, COUNT(*) AS pending
         FROM series_items
         WHERE seen = 0
         GROUP BY series_id
       ) p ON p.series_id = s.id
       LEFT JOIN (
         SELECT series_id, MAX(id) AS max_id
         FROM series_items
         WHERE seen = 0
         GROUP BY series_id
       ) lm ON lm.series_id = s.id
       LEFT JOIN series_items li ON li.id = lm.max_id
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

// Marca un item como visto y, en cascada, todos los anteriores (pub_date menor
// o igual → capítulos/episodios previos). Tiene sentido: si llegaste hasta el
// capítulo N, los N-1 .. 1 ya están leídos. Valida ownership vía JOIN con series.
// Tras mutar seen, recalcula series.last_read (Épica 10).
const markSeen = (itemId, userId) => {
  return new Promise(resolve => {
    db.get(
      `SELECT i.id, i.series_id FROM series_items i
       JOIN series s ON s.id = i.series_id
       WHERE i.id = ? AND s.user_id = ?`,
      [itemId, userId],
      (err, row) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (!row) return resolve({ error: 'Item not found or not owned' })
        db.run(
          `UPDATE series_items
           SET seen = 1
           WHERE series_id = ?
             AND series_id IN (SELECT id FROM series WHERE user_id = ?)
             AND seen = 0
             AND (COALESCE(pub_date, 0), created_at, id) <= (
               SELECT COALESCE(pub_date, 0), created_at, id
               FROM series_items WHERE id = ?
             )`,
          [row.series_id, userId, itemId],
          async function (err) {
            if (err) {
              console.error(err)
              return resolve({ error: err })
            }
            await recomputeLastRead(row.series_id)
            resolve({ success: true, updated: this.changes })
          }
        )
      }
    )
  })
}

// Desmarca un item (visto -> pendiente) y, en cascada, todos los posteriores
// (pub_date mayor o igual → capítulos/episodios siguientes). Tiene sentido: si
// marcás el capítulo N como no leído, no pueden estar leídos los N+1 .. M.
// Mismo ownership check que markSeen. Tras mutar seen, recalcula series.last_read.
const markUnseen = (itemId, userId) => {
  return new Promise(resolve => {
    db.get(
      `SELECT i.id, i.series_id FROM series_items i
       JOIN series s ON s.id = i.series_id
       WHERE i.id = ? AND s.user_id = ?`,
      [itemId, userId],
      (err, row) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (!row) return resolve({ error: 'Item not found or not owned' })
        db.run(
          `UPDATE series_items
           SET seen = 0
           WHERE series_id = ?
             AND series_id IN (SELECT id FROM series WHERE user_id = ?)
             AND seen = 1
             AND (COALESCE(pub_date, 0), created_at, id) >= (
               SELECT COALESCE(pub_date, 0), created_at, id
               FROM series_items WHERE id = ?
             )`,
          [row.series_id, userId, itemId],
          async function (err) {
            if (err) {
              console.error(err)
              return resolve({ error: err })
            }
            await recomputeLastRead(row.series_id)
            resolve({ success: true, updated: this.changes })
          }
        )
      }
    )
  })
}

// Borra los items de una serie con pub_date > limitEpoch (episodios no emitidos).
// Sincroniza la DB: fetchEpisodes ya no inserta futuros, pero los que se colaron
// antes (bugs de tz, cambios de fecha en IMDB) deben purgarse para no contar como
// pendientes. No filtra por user_id: el series_id ya es único por serie/usuario.
const deleteFuture = (seriesId, limitEpoch) => {
  return new Promise(resolve => {
    db.run(
      `DELETE FROM series_items WHERE series_id = ? AND pub_date > ?`,
      [seriesId, limitEpoch],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ success: true, deleted: this.changes })
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
      async function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        await recomputeLastRead(seriesId)
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

// Marca como vistos todos los items pendientes de una serie (ownership check).
// Tras mutar seen, recalcula series.last_read.
const markAllSeen = (seriesId, userId) => {
  return new Promise(resolve => {
    db.run(
      `UPDATE series_items
       SET seen = 1
       WHERE series_id = ?
         AND seen = 0
         AND series_id IN (SELECT id FROM series WHERE user_id = ?)`,
      [seriesId, userId],
      async function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        await recomputeLastRead(seriesId)
        resolve({ success: true, updated: this.changes })
      }
    )
  })
}

export default {
  insertMany,
  pendingCount,
  pendingByUser,
  dashboardByUser,
  recomputeLastRead,
  markSeen,
  markUnseen,
  markSeenUpTo,
  markAllSeen,
  listBySeries,
  deleteFuture
}
