import bcrypt from 'bcrypt'
import db from './db.mjs'

const SALT_ROUNDS = 10

const signup = async (username, password) => {
  const { error, data: userByUsername } = await getBy('username', username)
  if (error) {
    console.error(error)
    return { error: 'Unexpected error!' }
  }
  if (userByUsername) return { error: 'Username already exists!' }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)
  return new Promise(resolve => {
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
      if (err) {
        console.error(err)
        return resolve({ error: 'Error while creating user, try again later.' })
      }
      resolve({ success: true })
    })
  })
}

const login = async (username, password) => {
  const { error, data: row } = await getBy('username', username)
  if (error) {
    console.error(error)
    return { error: 'Error while log in, try again later.' }
  }
  if (!row) return { error: 'Invalid username or password' }
  const match = await bcrypt.compare(password, row.password)
  if (!match) return { error: 'Invalid username or password' }
  return { success: true }
}

const getBy = (selector, match) => {
  return new Promise(resolve => {
    db.get(`SELECT * FROM users WHERE ${selector} = ?`, [match], (err, row) => {
      if (err) {
        console.error(err)
        return resolve({ error: err })
      }
      resolve({ data: row })
    })
  })
}

const update = (destination, value, selector, match) => {
  return new Promise(resolve => {
    db.run(`UPDATE users SET ${destination} = ? WHERE ${selector} = ?`, [value, match], (err) => {
      if (err) {
        console.error(err)
        return resolve({ error: err })
      }
      resolve({ success: true })
    })
  })
}

export default {
  signup,
  login,
  getBy,
  update
}
