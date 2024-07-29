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
      OnHold: {
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
        localStorage.appMemory = JSON.stringify(store.state)
      },
      load: _ => {
        if (localStorage.appMemory) {
          store.state = JSON.parse(localStorage.appMemory)
        }
      }
    }
    manager.load()
    app.config.globalProperties.$storage = manager
  }
}
