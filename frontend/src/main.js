import { createApp } from 'vue/dist/vue.esm-bundler'
import storage from './storage.js'
import toast from './toast.js'
import router from './router.js'
import App from './App.vue'
import { setUnauthorizedHandler } from './api.js'

setUnauthorizedHandler(() => {
  if (router.currentRoute.value.path !== '/login') {
    router.push('/login')
  }
})

const app = createApp(App)
app.use(storage)
app.use(toast)
app.use(router)
app.mount('#app')
