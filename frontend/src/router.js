import { createRouter, createWebHistory } from 'vue-router'
import Login from './components/Login.vue'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/dashboard', component: () => import('./components/Dashboard.vue') },
  { path: '/series', component: () => import('./components/SeriesList.vue') },
  { path: '/series/new', component: () => import('./components/SeriesForm.vue') },
  { path: '/series/:id', component: () => import('./components/SeriesDetail.vue') },
  { path: '/series/:id/edit', component: () => import('./components/SeriesForm.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!token && to.path !== '/login') return '/login'
  if (token && to.path === '/login') return '/dashboard'
  return true
})

export default router
