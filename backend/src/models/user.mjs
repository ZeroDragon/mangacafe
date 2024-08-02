import md5 from 'md5'
import db from './db.mjs'

const signup = async (username, password, phone) => {
  const { error: phoneError, data: userByPhone } = await getBy('phone', phone)
  const { error: usernameError, data: userByUsername } = await getBy('username', username)
  if (phoneError || usernameError) {
    console.error(phoneError || usernameError)
    return { error: 'Unexpected error!' }
  }
  if (userByPhone) return { error: 'Phone number already exists!' }
  if (userByUsername) return { error: 'Username already exists!' }

  const hashedPassword = md5(password)
  // Insert user data into the database
  return new Promise(resolve => {
    db.run('INSERT INTO users (username, password, phone) VALUES (?, ?, ?)', [username, hashedPassword, phone], (err) => {
      if (err) {
        console.error(err)
        resolve({ error: 'Error while creating user, try again later.' })
      }
      resolve({ success: true })
    })
  })
}

const login = async (username, password) => {
  const hashedPassword = md5(password)
  return new Promise(resolve => {
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, hashedPassword], (err, row) => {
      if (err) {
        console.error(err)
        resolve({ error: 'Error while log in, try again later.' })
      }
      if (row) return resolve({ success: true })
      resolve({ error: 'Invalid username or password' })
    })
  })
}

const getBy = (selector, match) => {
  // Get user data from the database
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

const changePassword = (telegramId, password) => {
  const hashedPassword = md5(password)
  return new Promise(resolve => {
    db.run('UPDATE users SET password = ? WHERE telegram_id = ?', [hashedPassword, telegramId], (err) => {
      if (err) {
        console.error(err);
        return resolve({ error: err });
      }
      resolve({ success: true });
    });
  });
};

export default {
  signup,
  login,
  getBy,
  update,
  changePassword
}
