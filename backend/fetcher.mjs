import axios from 'axios'
import { parseString } from 'xml2js'
import pageScrapper from './scrapper.mjs'

const leftPad = (str, len, ch = '0') => {
  const [left, ...rest] = str.split('.')
  const construct = [`${ch.repeat(len)}${left}`.slice(-len)]
  if (rest.length) construct.push(rest.join('.'))
  return construct.join('.')
}

const transformer = async url => {
  const { error, json } = await fetchXmlData(url)
  if (error) return { error }
  const response = {}
  const [ item ] = json.rss.channel
  response.title = item.title[0]
  response.image = item.image[0].url[0]
  response.curPath = await pageScrapper(item.item[0].link[0])
  response.chapters = item.item.map(item => {
    const uid = item.guid[0]._.split('-')
    const chapter = uid.pop()
    const name = uid.join('-')
    const guid = `${name}/${leftPad(chapter, 4)}`
    return {
      title: item.title[0],
      guid,
      image: `//${response.curPath}/manga/${guid}-001.png`,
      pubDate: item.pubDate[0]
    }
  })
  return { error, ...response }
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

export default transformer
