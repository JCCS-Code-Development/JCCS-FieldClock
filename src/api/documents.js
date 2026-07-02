import client from './client'
import { useAuthStore } from '../store/authStore'

const BASE = '/contractor/documents'

export const listDocuments = (params) =>
  client.get(`${BASE}/index.php`, { params }).then((r) => r.data)

export const uploadDocument = (formData) =>
  client.post(`${BASE}/index.php`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export const getDocumentUrl = (id) => {
  const base  = (client.defaults.baseURL ?? '').replace(/\/$/, '')
  const token = useAuthStore.getState().token ?? ''
  return `${base}/contractor/documents/download.php?id=${id}&_t=${encodeURIComponent(token)}`
}
