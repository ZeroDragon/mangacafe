import axios from 'axios'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
const ORIGIN = process.env.ORIGIN

class SmallFish {
  constructor (ttl = 18e5) { // 30 minutes
    this.memory = {}
    this.ttl = ttl
  }

  set = (params) => {
    this.memory[params.key] = {}
    this.memory[params.key].timestamp = Date.now()
    this.memory[params.key].ttl = params.ttl || this.ttl
    if (Array.isArray(params.value)) return this.memory[params.key].value = params.value
    this.memory[params.key] = params.value
  }

  get = (key) => {
    const ttl = this.memory[key]?.ttl || 0
    if (ttl && ttl + this.memory[key].timestamp < new Date().getTime()) {
      delete this.memory[key]
      return null
    }
    return this.memory[key] || null
  }
}

const cache = new SmallFish()

const fetch = async _query => {
  const query = encodeURIComponent(_query)
  const cached = cache.get(query)?.value
  if (cached) return { response: cached }

  const json = await new Promise(resolve => {
    axios.get(`${ORIGIN}manga?title=${query}&includes[]=cover_art`)
      .then(response => {
        cache.set({
          key: query,
          value: response.data.data
        })
        resolve({ response: cache.get(query).value })
      })
      .catch(error => {
        console.error('Error fetching search:', error)
        resolve({ error })
      })
  })
  return json
}

const search = async (query) => {
  if (!query) return { error: 'No query provided' }
  if (query.length < 3) return { error: 'Query too short' }
  const { error, response } = await fetch(query)
  if (error) return { error }

  await Promise.all(response.map(item => {
    return downloadImage(item)
  }))

  const results = response.map(item => {
    const engTitles = item.attributes.altTitles.filter(item => item.en)
    const engTitle = (engTitles.pop() || {}).en
    return [item.id, engTitle || item.attributes.title.en || 'No title']
  })

  return { results }
}
const downloadImage = async (item) => {
  const cover = item.relationships.find(rel => rel.type === 'cover_art')
  const image = `https://uploads.mangadex.org/covers/${item.id}/${cover.attributes.fileName}`
  if (!existsSync(`./mangas/${item.id}/`)) {
    mkdirSync(`./mangas/${item.id}/`, { recursive: true })
  }
  if (!existsSync(`./mangas/${item.id}/cover.jpg`)) {
    const { data } = await axios.get(image, { responseType: 'arraybuffer' })
    writeFileSync(`./mangas/${item.id}/cover.jpg`, data)
  }
}
const cover = (manga) => {
  if (!existsSync(`./mangas/${manga}/cover.jpg`)) return { error: 'No cover found' }
  return { image: path.resolve(`./mangas/${manga}/cover.jpg`) }
}

export default search
export { cache, cover }
