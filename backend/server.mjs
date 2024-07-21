import express from 'express'
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
  res.json(await search(req.body.query))
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
