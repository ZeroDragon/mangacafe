import express from 'express'
import fetchXmlData from './fetcher.mjs'
import search from './search.mjs'
import mangaData from './fetcher.mjs'

const app = express()
const PORT = process.env.PORT

app.use(express.json())
app.set('views', './')
app.set('view engine', 'pug')

// add support for cors
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

app.get('/api/manga/:manga/:chapter?', (req, res) => {
  fetchXmlData(req.params.manga, req.params.chapter)
    .then(data => {
      res.json(data)
    })
    .catch(error => {
      console.error('Error fetching XML:', error)
      res.status(500).send
    })
})

app.get('/read/:manga/:chapter/:season?', async (req, res) => {
  const { manga, chapter, season } = req.params
  const { data, error } = await mangaData(manga, season, chapter)
  if (error) return res.json({ error })
  res.render('./issue.pug', { ...data })
})

app.post('/api/search', async (req, res) => {
  res.json(await search(req.body.query))
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
