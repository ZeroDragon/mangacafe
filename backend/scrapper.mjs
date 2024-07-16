import axios from 'axios'
const pageScrapper = async url => {
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

export default pageScrapper
