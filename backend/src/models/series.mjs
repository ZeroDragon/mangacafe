import db from './db.mjs'

const ALLOWED_FIELDS = [
  'type', 'name', 'url', 'cover_url', 'current_chapter',
  'rss_url', 'last_known_total', 'last_checked_at', 'last_error'
]

const create = (userId, { type, name, url, cover_url, current_chapter, rss_url }) => {
  return new Promise(resolve => {
    db.run(
      `INSERT INTO series (user_id, type, name, url, cover_url, current_chapter, rss_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, name, url, cover_url, current_chapter || 0, rss_url],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: 'Error while creating series' })
        }
        resolve({ success: true, id: this.lastID })
      }
    )
  })
}

const listByUser = (userId) => {
  return new Promise(resolve => {
    db.all(
      `SELECT * FROM series WHERE user_id = ? ORDER BY updated_at DESC`,
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

const getById = (id, userId) => {
  return new Promise(resolve => {
    db.get(
      `SELECT * FROM series WHERE id = ? ${userId ? 'AND user_id = ?' : ''}`,
      userId ? [id, userId] : [id],
      (err, row) => {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        resolve({ data: row })
      }
    )
  })
}

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
      `UPDATE series SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      values,
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Series not found or not owned' })
        resolve({ success: true })
      }
    )
  })
}

const remove = (id, userId) => {
  return new Promise(resolve => {
    db.run(
      `DELETE FROM series WHERE id = ? AND user_id = ?`,
      [id, userId],
      function (err) {
        if (err) {
          console.error(err)
          return resolve({ error: err })
        }
        if (this.changes === 0) return resolve({ error: 'Series not found or not owned' })
        resolve({ success: true })
      }
    )
  })
}

export default {
  create,
  listByUser,
  getById,
  update,
  remove
}
