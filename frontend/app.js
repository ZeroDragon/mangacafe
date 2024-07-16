import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import search from '/search.js'
import manga from '/manga.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: search },
    { path: '/manga/:manga/:chapter', component: manga }
  ]
})
const app = createApp()
app.use(router)
app.mount('#app')
