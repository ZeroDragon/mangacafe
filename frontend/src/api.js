import axios from 'axios'

const api = axios.create({
  baseURL: __API__
})

let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.token) {
      localStorage.setItem('token', response.data.token)
    }
    return response
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      if (onUnauthorized) onUnauthorized()
    }
    return Promise.reject(error)
  }
)

export default api
