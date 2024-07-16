import express from 'express'
import fetchXmlData from './fetcher.mjs'

const app = express()
const PORT = process.env.PORT || 8000

app.set('views', '../frontend')
app.use(express.static('../frontend'))

app.get('/', (req, res) => {
  res.render('index.pug')
})

app.get('/api/manga/:manga', (req, res) => {
  const url = `https://manga4life.com/rss/${req.params.manga}.xml`
  fetchXmlData(url)
    .then(data => {
      res.json(data)
    })
    .catch(error => {
      console.error('Error fetching XML:', error)
      res.status(500).send
    })
})

app.get('*', (req, res) => {
  res.render('index.pug')
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
