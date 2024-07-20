import axios from 'axios'
import { parseString } from 'xml2js'
import pageScrapper from './scrapper.mjs'

const ORIGIN = process.env.ORIGIN

const leftPad = (str, len, ch = '0') => {
  const [left, ...rest] = str.split('.')
  const construct = [`${ch.repeat(len)}${left}`.slice(-len)]
  if (rest.length) construct.push(rest.join('.'))
  return construct.join('.')
}

const getMetaData = (name, url) => {
  const [,chapter,,index] = url.split('/')
    .pop()
    .replace(`${name}-`, '')
    .replace('-page-1.html', '')
    .split('-')
  return { chapter, index }
}

const transformer = async (manga, chapter) => {
  const url = `${ORIGIN}/rss/${manga}.xml`
  const { error, json } = await fetchXmlData(url)
  if (error) return { error }
  const response = {}
  const [ item ] = json.rss.channel
  response.title = item.title[0]
  response.image = item.image[0].url[0]
  if (!chapter) {
    response.chapters = item.item.map(item => {
      const { chapter, index } = getMetaData(manga, item.link[0])
      const name = manga
      const indexName = index ? `S${index}` : null
      const guid = [name, indexName, chapter]
        // .filter(itm => itm)
        .join('/')
      return {
        title: item.title[0],
        guid,
        pubDate: item.pubDate[0]
      }
    })
  } else {
    const [chap] = item.item.filter(item => item.guid[0]._ === `${manga}-${chapter}`)
    delete response.image
    response.curPath = await pageScrapper(chap.link[0])
  }
  return { ...response }
}

const fetchXmlData = async url => {
  const xmlData = await new Promise(resolve => {
    try {
      axios.get(url)
      .then(response => {
        resolve({ data: response.data })
      })
      .catch(error => {
        console.error('Error fetching XML:', error)
        resolve({ error })
      })
    } catch (error) {
      console.error('Error fetching XML:', error)
      resolve({ error })
    }
  })
  if (xmlData.error) return { error: xmlData.error.message }
  const json = await new Promise(resolve => {
    parseString(xmlData.data, (error, result) => {
      if (error) {
        console.error('Error parsing XML:', error)
        resolve({ error })
      }
      resolve(result)
    })
  })
  return { json }
}

const mangaData = async (manga, season, chapter) => {
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
  let imageBase = ''
  if (chapter) {
    const chapterPadded = leftPad(chapter, 4)
    const path = [manga, season, chapterPadded].filter(itm => itm).join('/')
    imageBase = `https://${data.curPath}/manga/${path}-`
    delete data.curPath
  }
  return { data: {...data, imageBase} }
}

export default mangaData
