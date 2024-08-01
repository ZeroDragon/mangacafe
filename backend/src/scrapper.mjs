import axios from 'axios'
const ORIGIN = process.env.ORIGIN
const chapterData = async url => {
  const htmlData = await new Promise(resolve => {
    try {
      axios.get(url)
        .then(response => {
          resolve({ data: response.data })
        })
        .catch(error => {
          console.error('Error fetching HTML:', error)
          resolve({ error })
        })
    } catch (error) {
      console.error('Error fetching HTML:', error)
      resolve({ error })
    }
  })
  const [chapterInfo, pathName] = htmlData.data
    .split('\n')
    .filter(line => {
      return line.includes('vm.CurPathName =') || line.includes('vm.CurChapter =')
    })
    .slice(0, 2)
    .map(line => line.split(' = ')[1].split(';')[0])
    .map(line => JSON.parse(line))
  return {
    chapterInfo: {
      page: ~~chapterInfo.Page,
      bucket: chapterInfo.Directory
    },
    pathName
  }
}

const metaData = async manga => {
  const url = `${ORIGIN}manga/${manga}`
  const htmlData = await new Promise(resolve => {
    try {
      axios.get(url)
        .then(response => {
          resolve({ data: response.data })
        })
        .catch(error => {
          console.error('Error fetching HTML:', error)
          resolve({ error })
        })
    } catch (error) {
      console.error('Error fetching HTML:', error)
      resolve({ error })
    }
    
  })
  if (htmlData.error) return { error: htmlData.error }
  let bodyText = htmlData.data.match(/<body>([\s\S]*?)<\/body>/)[1].split('\n')
  const statusIndex = bodyText.findIndex(line => line.includes('Status:'))
  const descriptionIndex = bodyText.findIndex(line => line.includes('Description:'))
  const [status, description] = [
    bodyText[statusIndex + 2].replace(' (Publish)', ''),
    bodyText[descriptionIndex + 1]
  ]
    .map(text => text.trim())
    .map(text => text.replace(/<[^>]*>/g, ''))
  return { status, description }
}

export { chapterData, metaData }
