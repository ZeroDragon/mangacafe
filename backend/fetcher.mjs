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

const getMetaData = (name, url) => {
  const [,chapter,,index] = url.split('/')
    .pop()
    .replace(`${name}-`, '')
    .replace('-page-1.html', '')
    .split('-')
  return { chapter, index }
}

const transformer = async (manga, chapter, season) => {
  const url = `${ORIGIN}/rss/${manga}.xml`
  const { error, json } = await fetchXmlData(url)
  if (error) return { error }
  const response = {}
  const [ item ] = json.rss.channel
  response.title = item.title[0]
  response.image = item.image[0].url[0]
  response.chapters = item.item.map(item => {
    const { chapter, index } = getMetaData(manga, item.link[0])
    const indexName = index ? `S${index}` : null
    return {
      title: item.title[0],
      chapter,
      pubDate: item.pubDate[0],
      link: item.link[0],
      uri: [manga, chapter, indexName].filter(itm => itm).join('/')
    }
  })
  if (chapter) {
    const [chap] = response.chapters.filter(chp => chp.uri === [manga, chapter, season].filter(itm => itm).join('/'))
    const index = response.chapters.findIndex(chp => chp.uri === chap.uri)
    const { chapterInfo, pathName } = await chapterData(chap.link)
    response.curPath = pathName
    response.chapterInfo = chapterInfo
    Object.entries({ prev: 1, next: -1 }).forEach(([key, value]) => {
      response[key] = response.chapters[index + value]
      if (response[key]) {
        delete response[key].link
        delete response[key].title
        delete response[key].pubDate
      }
    })
    delete response.chapters
    delete response.image
  } else {
    response.chapters = response.chapters.map(chapter => {
      delete chapter.link
      return chapter
    })
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
    transformer(manga, chapter, season)
      .then(data => {
        resolve({ data })
      })
      .catch(error => {
        console.error('Error fetching XML:', error)
        resolve({ error })
      })
  })
  if (error) return { error }
  let imageBase = null
  if (chapter) {
    const chapterPadded = leftPad(chapter, 4)
    const path = [manga, season, chapterPadded].filter(itm => itm).join('/')
    const pathAlt = [
      manga,
      data.chapterInfo.bucket,
      chapterPadded
    ].filter(itm => itm !== '').join('/')
    imageBase = [`https://${data.curPath}/manga/${path}-`, `https://${data.curPath}/manga/${pathAlt}-`]
    data.pages = data.chapterInfo.page
    delete data.chapterInfo
    delete data.curPath
  } else {
    const mangaInfo = cache.memory?.search?.value?.find(item => item.i === manga)
    if (mangaInfo && !mangaInfo.metaData) {
      const { status, description, error } = await metaData(manga)
      if (!error) mangaInfo.metaData = { status, description }
    }
    data.description = mangaInfo?.metaData?.description
    data.status = mangaInfo?.metaData?.status
  }
  return { data: {...data, imageBase} }
}

export default mangaData
