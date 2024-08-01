import { reactive } from 'vue'

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

export default {
  install: (app) => {
    const manager = {
      set: (key, value) => {
        store.state[key] = value
        if (['mangas', 'lists'].includes(key)) {
          store.state.lastUpdated = new Date().getTime()
        }
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
          console.log('loading')
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
