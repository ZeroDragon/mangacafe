import { reactive } from 'vue'
import axios from 'axios'

const store = reactive({
  state: {
    mangas: {},
    lists: {
      reading: {
        display: 'Reading',
        items: []
      },
      completed: {
        display: 'Completed',
        items: []
      },
      onHold: {
        display: 'On Hold',
        items: []
      },
      next: {
        display: 'Next',
        items: []
      },
      dropped: {
        display: 'Dropped',
        items: []
      },
    }
  }
})

const sync = {
  upload: async _ => {
    const data = JSON.parse(localStorage.appMemory)
    delete data.mangaLoaded
    delete data.displaySettings
    delete data.lastUpdated
    return await new Promise(resolve => {
      axios.post(`${__API__}/sync`, {
        settings: JSON.stringify(data),
      }, {
        headers: {
          Authorization: `Bearer ${localStorage.token}`
        }
      })
      .then(resolve)
      .catch(({ response }) => resolve(response))
    })
  },
  download: async _ => {
    const response = await new Promise(resolve => {
      axios.get(`${__API__}/sync`, {
        headers: {
          Authorization: `Bearer ${localStorage.token}`
        }
      })
      .then(resolve)
      .catch(({ response }) => resolve(response))
    })
    if (response.data) {
      const { remote: { settings: data }, token } = response.data
      localStorage.token = token
      localStorage.appMemory = data
    }
    return response
  }
}

const storage = {
  install: (app) => {
    const manager = {
      set: (key, value) => {
        store.state[key] = value
        manager.save()
      },
      get: (key) => {
        return store.state[key]
      },
      remove: (key) => {
        delete store.state[key]
        manager.save()
      },
      save: _ => {
        const items = Object.values(store.state.lists)
          .reduce((acc, list) => {
            acc.push(...list.items)
            return acc
          }, [])
        if (
          Object.keys(store.state.mangas).length !== 0 &&
          items.length !== 0
        ) {
          localStorage.appMemory = JSON.stringify(store.state)
        }
      },
      load: _ => {
        if (localStorage.appMemory) {
          const fromMem = JSON.parse(localStorage.appMemory)
          store.state.mangas = fromMem.mangas || {}
          store.state.lists = fromMem.lists || {}
        }
      }
    }
    manager.load()
    app.config.globalProperties.$storage = manager
  }
}

export default storage
export { sync }
