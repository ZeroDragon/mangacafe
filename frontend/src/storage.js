import { reactive } from 'vue'

const store = reactive({
  state: {}
})

const storage = {
  install: (app) => {
    const manager = {
      set: (key, value) => {
        store.state[key] = value
      },
      get: (key) => store.state[key],
      remove: (key) => {
        delete store.state[key]
      }
    }
    app.config.globalProperties.$storage = manager
  }
}

export default storage
