import axios from 'axios'
const ORIGIN = process.env.ORIGIN

class SmallFish {
  constructor (ttl = 86.4e6) {
    this.memory = {}
    this.ttl = ttl
    this.timer = setInterval(() => {
      Object.keys(this.memory).forEach((key) => {
        if (this.memory[key].ttl) {
          if (Date.now() - this.memory[key].timestamp > this.memory[key].ttl) {
            delete this.memory[key]
          }
        }
      })
    }, 3e5)
  }

  set = (params) => {
    this.memory[params.key] = {}
    this.memory[params.key].timestamp = Date.now()
    this.memory[params.key].ttl = params.ttl || this.ttl
    if (Array.isArray(params.value)) return this.memory[params.key].value = params.value
    this.memory[params.key] = params.value
  }

  get = (key) => {
    return this.memory[key] || null
  }
}

const cache = new SmallFish()

const fetch = async _ => {
  const query = 'search'
  const cached = cache.get(query)?.value
  if (cached) return { response: cached }

  const json = await new Promise(resolve => {
    axios.get(`${ORIGIN}/_search.php`)
      .then(response => {
        cache.set({
          key: query,
          value: response.data
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
  const { error, response } = await fetch()
  if (error) return { error }

  const results = response
    .filter(item => {
      const lefts = [item.i, item.s, ...item.a].map(str => str.toLowerCase()).join('')
      return lefts.includes(query)
    })
    .map(item => [item.i, item.s])

  return { results }
}

export default search
