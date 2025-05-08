import axios from 'axios'
import { parseString } from 'xml2js'
import { chapterData, metaData } from './scrapper.mjs'
import { cache } from './search.mjs'

const ORIGIN = process.env.ORIGIN

const leftPad = (str, len, ch = '0') => {
  const [left, ...rest] = str.split('.')
  const construct = [`${ch.repeat(len)}${left}`.slice(-len)]
  if (rest.length) construct.push(rest.join('.'))
  return construct.join('.')
}

const transformer = async (manga, chapter) => {
  if (!cache.get(manga)) {
    const getChapters = async (limit = 0) => {
      const _url = `${ORIGIN}manga/${manga}/feed?translatedLanguage[]=es-la&order[chapter]=desc`
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
  response.chapters = json.chapters.map(chapter => {
    return {
      pubDate: chapter.attributes.publishAt,
      title: chapter.attributes.chapter,
      uri: [manga, chapter.id].join('/')
    }
  })
  // if (chapter) {
  //   const [chap] = response.chapters.filter(chp => chp.uri === [manga, chapter, season].filter(itm => itm).join('/'))
  //   const index = response.chapters.findIndex(chp => chp.uri === chap.uri)
  //   const { chapterInfo, pathName } = await chapterData(chap.link)
  //   response.curPath = pathName
  //   response.chapterInfo = chapterInfo
  //   response.index = chap.index
  //   Object.entries({ prev: 1, next: -1 }).forEach(([key, value]) => {
  //     response[key] = response.chapters[index + value]
  //     if (response[key]) {
  //       delete response[key].link
  //       delete response[key].title
  //       delete response[key].pubDate
  //     }
  //   })
  //   delete response.chapters
  //   delete response.image
  // } else {
  //   response.chapters = response.chapters.map(chapter => {
  //     delete chapter.link
  //     return chapter
  //   })
  // }
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
