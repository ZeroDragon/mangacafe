import db from './db.mjs'

const getUser = async (username) => {
  return await new Promise(resolve => {
    db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
      if (err) {
        console.error(err)
        return resolve({ error: err })
      }
      resolve({ data: row })
    })
  })
}

const getUserSettings = async (username) => {
  const userSelect = await getUser(username)
  if (userSelect.error) return { error: 'Error while syncing' }
  return new Promise(resolve => {
    db.get(`SELECT settings, last_updated FROM user_data WHERE id = ?`, [userSelect.data.id], (err, row) => {
      if (err) {
      console.error(err)
      return resolve({ error: err })
      }
      resolve({ data: row })
    })
  })
}

const setUserSettings = async (username, { settings, lastUpdated }) => {
  // return { success: true }
  const userSelect = await getUser(username)
  if (userSelect.error) return { error: 'Error while syncing' }
  return new Promise(resolve => {
    db.run(`INSERT INTO user_data (user_id, settings, last_updated) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, last_updated = excluded.last_updated`,
        [userSelect.data.id, settings, lastUpdated], (err) => {
      if (err) {
        console.error(err)
        return resolve({ error: err })
      }
      resolve({ success: true })
    })
  })
}

export default {
  getUserSettings,
  setUserSettings
}
