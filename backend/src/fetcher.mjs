import axios from 'axios'
import { parseString } from 'xml2js'
import { chapterData, metaData } from './scrapper.mjs'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { cache } from './search.mjs'

const ORIGIN = process.env.ORIGIN

const addZ = str => `${'0'.repeat(4 - str.length)}${str}`

const transformer = async (manga, chapter) => {
  if (!cache.get(manga)) {
    const getChapters = async (limit = 0) => {
      const _url = `${ORIGIN}manga/${manga}/feed?translatedLanguage[]=en&translatedLanguage[]=es-la&order[chapter]=desc`
      const { data } = await axios.get(`${_url}&limit=${limit}`)
      if (!data) return { error: 'No data' }
      if (limit === 0) {
        const total = data.total
        return await getChapters(total)
      }
      return data.data
    }
    const chapters = await getChapters()
    const url = `${ORIGIN}manga/${manga}`
    const mangaInfo = (await axios.get(url)).data.data.attributes
    if (!chapters) return { error: 'No chapters' }
    cache.set({ key: manga, value: { chapters, mangaInfo } })
  }

  const json = cache.get(manga)
  const response = {}
  response.title = json.mangaInfo.title.en
  response.image = `${process.env.API}/manga/cover/${manga}`
  response.description = json.mangaInfo.description.es
  response.chapters = json.chapters.map((chapter, index, self) => {
    return {
      pubDate: chapter.attributes.publishAt,
      title: chapter.attributes.title || chapter.attributes.chapter,
      uri: [manga, chapter.id].join('/'),
      index: self.length - index,
      lang: chapter.attributes.translatedLanguage
    }
  })
  if (chapter) {
    const chap = response.chapters.find(chp => chp.uri === [manga, chapter].filter(itm => itm).join('/'))
    if (!chap) return { error: 'No chapter' }
    const { baseUrl, chapter: { hash, data: images } } = (await axios.get(`${ORIGIN}/at-home/server/${chapter}`)).data
    // download all chapter images
    const imageLocation = `./mangas/${manga}/${chapter}/`
    if (!existsSync(imageLocation)) mkdirSync(imageLocation, { recursive: true })
    const toDownload = images.map(image => {
      return new Promise(async (resolve) => {
        const [imageNumber, imageHash] = image.split('-')
        const [, ext] = imageHash.split('.')
        const imageName = `${addZ(imageNumber)}.${ext}`
        const imagePath = `${imageLocation}${imageName}`
        if (!existsSync(imagePath)) {
          const url = `${baseUrl}/data/${hash}/${image}`
          const { data } = await axios.get(url, { responseType: 'arraybuffer' })
          writeFileSync(imagePath, data)
        }
        resolve()
      })
    })
    await Promise.all(toDownload)
    Object.entries({ prev: -1, next: 1 }).forEach(([key, value]) => {
      response[key] = response.chapters.find(chp => chp.index === chap.index + value)
      if (response[key]) {
        delete response[key].pubDate
        delete response[key].index
      }
    })
    delete response.description
    delete response.image
    delete response.chapters
    response.index = chap.index
    response.chapter = chap.title
    response.pages = readdirSync(imageLocation)
      .filter(file => {
        const [, ext] = file.split('.')
        return ['jpg', 'jpeg', 'png'].includes(ext)
      })
      .map(file => `${process.env.API}/manga/images/${manga}/${chapter}/${file}`)
  }
  return { ...response }
}

const mangaData = async (manga, chapter) => {
  const { error, data } = await new Promise(resolve => {
    transformer(manga, chapter)
      .then(data => {
        resolve({ data })
      })
      .catch(error => {
        console.error('Error fetching XML:', error)
        resolve({ error })
      })
  })
  if (error) return { error }
  return { data }
}

export default mangaData
