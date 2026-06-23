import db from './db.mjs'

// Modelo de reels (Épica 11): watch-later / ToDo de URLs de FB.
// Diferencias clave vs series/series_items:
//  - Sin feed: un reel es atómico (una URL).
//  - Sin cascada: marcar visto NO afecta a otros reels.
//  - Sin last_read: el indicador de progreso no aplica.
// Todas las queries filtran por user_id (aislamiento multiusuario).

const ALLOWED_FIELDS = ['url', 'title']

// INSERT OR IGNORE sobre (user_id, url): no duplica el mismo reel para el mismo
// usuario. Devuelve { id } si lo creó, o { skipped: true } si ya existía la URL.
const create = (userId, { url, title }) => {
  return new Promise(resolve => {
    db.run(
      `INSERT OR IGNORE INTO reels (user_id, url, title) VALUES (?, ?, ?)`,
      [userId, url, title != null ? title : null],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: 'Error while creating reel' })
        }
        if (this.changes === 0) return resolve({ skipped: true })
        resolve({ success: true, id: this.lastID })
      }
    )
  })
}

// Todos los reels del usuario (pendientes + vistos juntos), ordenados por
// created_at DESC. El front los separa por el flag `seen`.
const listByUser = (userId) => {
  return new Promise(resolve => {
    db.all(
      `SELECT * FROM reels WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
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

// Whitelist [url, title]. Se permite title: null explícito para "limpiar" el
// título y volver al fallback de URL. Ownership: WHERE id = ? AND user_id = ?.
const update = (id, userId, fields) => {
  const setClauses = []
  const values = []
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      setClauses.push(`${key} = ?`)
      values.push(fields[key])
    }
  }
  if (setClauses.length === 0) return Promise.resolve({ success: true })
  setClauses.push(`updated_at = strftime('%s', 'now')`)
  values.push(id, userId)
  return new Promise(resolve => {
    db.run(
      `UPDATE reels SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      values,
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Reel not found or not owned' })
        resolve({ success: true })
      }
    )
  })
}

const remove = (id, userId) => {
  return new Promise(resolve => {
    db.run(
      `DELETE FROM reels WHERE id = ? AND user_id = ?`,
      [id, userId],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Reel not found or not owned' })
        resolve({ success: true })
      }
    )
  })
}

// Toggle del flag seen. SIN cascada: sólo el item indicado cambia.
// Ownership check vía WHERE id = ? AND user_id = ?.
const markSeen = (id, userId) => {
  return new Promise(resolve => {
    db.run(
      `UPDATE reels SET seen = 1, updated_at = strftime('%s', 'now')
       WHERE id = ? AND user_id = ? AND seen = 0`,
      [id, userId],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Reel not found or not owned' })
        resolve({ success: true })
      }
    )
  })
}

const markUnseen = (id, userId) => {
  return new Promise(resolve => {
    db.run(
      `UPDATE reels SET seen = 0, updated_at = strftime('%s', 'now')
       WHERE id = ? AND user_id = ? AND seen = 1`,
      [id, userId],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Reel not found or not owned' })
        resolve({ success: true })
      }
    )
  })
}

// Para el summary del dashboard: cuántos reels pendientes tiene el usuario.
const pendingCountByUser = (userId) => {
  return new Promise(resolve => {
    db.get(
      `SELECT COUNT(*) AS count FROM reels WHERE user_id = ? AND seen = 0`,
      [userId],
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

export default {
  create,
  listByUser,
  update,
  remove,
  markSeen,
  markUnseen,
  pendingCountByUser
}
