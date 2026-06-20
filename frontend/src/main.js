import { createApp } from 'vue/dist/vue.esm-bundler'
import { createRouter, createWebHistory } from 'vue-router'
import storage from './storage.js'
import home from './components/home.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: home }
  ]
})

const app = createApp({})
app.use(storage)
app.use(router)
app.mount('#app')
