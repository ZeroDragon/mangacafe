import { createApp } from 'vue/dist/vue.esm-bundler'
import { createRouter, createWebHistory } from 'vue-router'

import search from './components/search.vue'
import chapter from './components/chapter.vue'
import manga from './components/manga.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: search },
    { path: '/manga/:manga', component: manga },
    { path: '/manga/:manga/:chapter', component: chapter }
  ]
})
const app = createApp()
app.use(router)
app.mount('#app')
