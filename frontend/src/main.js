import { createApp } from 'vue/dist/vue.esm-bundler'
import { createRouter, createWebHistory } from 'vue-router'
import storage from './storage.js'

import search from './components/search.vue'
import chapter from './components/chapter.vue'
import manga from './components/manga.vue'
import settings from './components/settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: search },
    { path: '/:manga', component: manga },
    { path: '/:manga/:chapter/:season?', component: chapter }
  ]
})
const app = createApp({
  components: { settings }
})
app.use(storage)
app.use(router)
app.mount('#app')
