import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Queue for concurrent requests that fail while a refresh is in flight
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => (error ? prom.reject(error) : prom.resolve(token)))
  failedQueue = []
}

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      })
    }
    original._retry = true
    isRefreshing = true
    const { refreshToken, updateToken, logout } = useAuthStore.getState()
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/auth/refresh.php`,
        { refreshToken }
      )
      const newToken = res.data.token
      updateToken(newToken)
      processQueue(null, newToken)
      original.headers.Authorization = `Bearer ${newToken}`
      return client(original)
    } catch (err) {
      processQueue(err, null)
      logout()
      window.location.replace('/login')
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)

export default client
