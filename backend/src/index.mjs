import express from 'express'
import '../../dotenv.mjs'
import './bot.mjs'
import search from './search.mjs'
import mangaData from './fetcher.mjs'
import user from './models/user.mjs'
import settings from './models/settings.mjs'
import Auth from './auth.mjs'

const app = express()
const PORT = process.env.PORT
const auth = new Auth({ secret: process.env.SECRET })

app.use(express.json())
app.set('views', './')
app.set('view engine', 'pug')

// add support for cors
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})

app.get('/api/manga/:manga/:chapter?/:season?', (req, res) => {
  const { manga, chapter, season } = req.params
  mangaData(manga, season, chapter)
    .then(data => {
      res.json(data)
    })
    .catch(error => {
      console.error('Error fetching XML:', error)
      res.status(500).send
    })
})

app.post('/api/search', async (req, res) => {
  res.json(await search(req.body.query.toLowerCase()))
})

app.get('/api/', (_req, res) => {
  res.json({ message: 'Hello world' })
})

app.post('/api/signup', async (req, res) => {
  const { username, password, phone } = req.body
  res.json(await user.signup(username, password, phone))
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

const verifyToken = (req, res, next) => {
  const tokenHeader = req.headers.authorization
  if (!tokenHeader) return res.status(401).json({ error: 'No token provided' })
  const [, token] = tokenHeader.split(' ')
  const success = auth.verifyToken(token)
  if (!success) return res.status(403).json({ error: 'Invalid token' })
  res.newToken = auth.refreshToken(token)
  next()
}
const getUser = (req, res, next) => {
  const token = res.newToken
  const {meta: { username }} = auth.parseToken(token)
  res.username = username
  next()
}

app.get('/api/sync', [verifyToken, getUser], async (req, res) => {
  const response = await settings.getUserSettings(res.username)
  if (response.error) return res.status(500).json({ error: 'Error while syncing' })
  res.json({ remote: response.data, token: res.newToken })
})

app.post('/api/sync', [verifyToken, getUser], async (req, res) => {
  const { settings: bodySettings } = req.body
  const response = await settings.setUserSettings(res.username, { settings: bodySettings })
  if (response.error) return res.status(500).json({ error: 'Error while syncing' })
  res.json({ success: true, token: res.newToken })
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
