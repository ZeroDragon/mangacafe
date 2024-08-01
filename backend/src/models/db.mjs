import sqlite3 from 'sqlite3'
const db = new sqlite3.Database(process.env.DB_PATH)
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

Promise.all([
  createTable('users', `
    CREATE TABLE users (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      telegram_id TEXT);
  `),
  createTable('user_data', `
    CREATE TABLE user_data (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      settings TEXT,
      last_updated INTEGER,
      CONSTRAINT user_data_users_FK FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE);
  `)
]).then(results => {
  results.forEach(result => {
    if (result.error) throw result.error
  })
})

export default db
