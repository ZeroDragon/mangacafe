import express from 'express'
import '../../dotenv.mjs'
import user from './models/user.mjs'
import Auth from './auth.mjs'

const app = express()
const PORT = process.env.PORT
const auth = new Auth({ secret: process.env.SECRET })

app.use(express.json())
app.set('views', './')
app.set('view engine', 'pug')

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body
  res.json(await user.signup(username, password))
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  const { error, success } = await user.login(username, password)
  if (error) return res.status(401).json({ error })
  if (success) {
    const token = auth.generateToken({ username })
    return res.json({ success, token })
  }
})

export const verifyToken = (req, res, next) => {
  const tokenHeader = req.headers.authorization
  if (!tokenHeader) return res.status(401).json({ error: 'No token provided' })
  const [, token] = tokenHeader.split(' ')
  const success = auth.verifyToken(token)
  if (!success) return res.status(403).json({ error: 'Invalid token' })
  res.newToken = auth.refreshToken(token)
  next()
}

export const getUser = (req, res, next) => {
  const token = res.newToken
  const { meta: { username } } = auth.parseToken(token)
  res.username = username
  next()
}

app.get('/api/', (_req, res) => {
  res.json({ message: 'Manga Café API' })
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
