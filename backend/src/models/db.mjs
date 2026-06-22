import sqlite3 from 'sqlite3'
const db = new sqlite3.Database(process.env.DB_PATH)
// ON DELETE CASCADE requiere activar FKs por conexión (OFF por defecto en SQLite).
db.run('PRAGMA foreign_keys = ON')
const createTable = (table, schema) => {
  return new Promise(resolve => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`, (err, row) => {
      if (err) return resolve({ error: err })
      if (row) return resolve({ info: `Table '${table}' exists` })
      console.log(`Creating table '${table}'`)
      db.run(schema, (err) => {
        if (err) return resolve({ error: err })
        resolve({ info: `Table '${table}' created` })
      })
    })
  })
}

const createIndex = (name, schema) => {
  return new Promise(resolve => {
    db.get(`SELECT name FROM sqlite_master WHERE type='index' AND name='${name}'`, (err, row) => {
      if (err) return resolve({ error: err })
      if (row) return resolve({ info: `Index '${name}' exists` })
      console.log(`Creating index '${name}'`)
      db.run(schema, (err) => {
        if (err) return resolve({ error: err })
        resolve({ info: `Index '${name}' created` })
      })
    })
  })
}

// Resuelve cuando todas las tablas e índices están listos. Útil para tests/scripts
// que importan los modelos y necesitan garantir el schema antes de queryar.
// El backend en producción no lo necesita (las requests llegan después del boot).

// Renombra una columna si existe la vieja y no la nueva (SQLite >= 3.25).
// Idempotente. Usado para migrar series.rss_url -> series.imdb_url.
const renameColumnIfMissing = (table, oldCol, newCol) => {
  return new Promise(resolve => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) return resolve({ error: err })
      const cols = rows.map(r => r.name)
      if (cols.includes(newCol) || !cols.includes(oldCol)) {
        return resolve({ info: `no rename needed (${table}.${newCol})` })
      }
      db.run(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`, (err) => {
        if (err) return resolve({ error: err })
        console.log(`Renamed ${table}.${oldCol} -> ${newCol}`)
        resolve({ info: `renamed ${table}.${oldCol} -> ${newCol}` })
      })
    })
  })
}

// Agrega una columna si no existe (SQLite >= 3.35 para ADD COLUMN con defaults simples).
// Idempotente. Usado para re-agregar series.rss_url (convive con imdb_url).
const addColumnIfMissing = (table, col, def = 'TEXT') => {
  return new Promise(resolve => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) return resolve({ error: err })
      const cols = rows.map(r => r.name)
      if (cols.includes(col)) {
        return resolve({ info: `no add needed (${table}.${col})` })
      }
      db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`, (err) => {
        if (err) return resolve({ error: err })
        console.log(`Added ${table}.${col}`)
        resolve({ info: `added ${table}.${col}` })
      })
    })
  })
}

export const ready = (async () => {
  // Migración previa: si existe la tabla series vieja con rss_url, renombrarla.
  // (CREATE TABLE usa imdb_url; este paso arregla bases preexistentes.)
  await renameColumnIfMissing('series', 'rss_url', 'imdb_url')
  // Épica 9: rss_url convive con imdb_url (dispatch por type). CREATE TABLE ya
  // trae rss_url en bases nuevas; esto agrega la columna a bases existentes.
  await addColumnIfMissing('series', 'rss_url', 'TEXT')

  const tables = await Promise.all([
    createTable('users', `
      CREATE TABLE users (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')));
    `),
    createTable('series', `
      CREATE TABLE series (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('manga', 'anime')),
        name TEXT NOT NULL,
        url TEXT,
        cover_url TEXT,
        current_chapter INTEGER NOT NULL DEFAULT 0,
        imdb_url TEXT,
        rss_url TEXT,
        last_known_total INTEGER,
        last_checked_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        CONSTRAINT series_users_FK FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `),
    createTable('series_items', `
      CREATE TABLE series_items (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        series_id INTEGER NOT NULL,
        guid TEXT NOT NULL,
        title TEXT,
        link TEXT,
        pub_date INTEGER,
        seen INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        CONSTRAINT series_items_series_FK FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        CONSTRAINT series_items_uniq UNIQUE (series_id, guid)
      );
    `)
  ])
  tables.forEach(result => { if (result.error) throw result.error })

  const indexes = await Promise.all([
    createIndex('idx_series_user', 'CREATE INDEX idx_series_user ON series(user_id)'),
    createIndex('idx_series_user_type', 'CREATE INDEX idx_series_user_type ON series(user_id, type)'),
    createIndex('idx_series_last_checked', 'CREATE INDEX idx_series_last_checked ON series(last_checked_at)'),
    createIndex('idx_items_series', 'CREATE INDEX idx_items_series ON series_items(series_id)'),
    createIndex('idx_items_series_unseen', 'CREATE INDEX idx_items_series_unseen ON series_items(series_id, seen)')
  ])
  indexes.forEach(result => { if (result.error) throw result.error })
})()

export const enableForeignKeys = () => {
  db.run('PRAGMA foreign_keys = ON')
}

export default db
