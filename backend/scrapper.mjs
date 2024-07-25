import axios from 'axios'
const ORIGIN = process.env.ORIGIN
const pathName = async url => {
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
  return htmlData.data
    .split('\n')
    .find(line => line.includes('CurPathName ='))
    .split(' = ')[1]
    .split(';')[0]
    .replace(/"/g, '')
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

export { pathName, metaData }
