import client from './client'
import { useAuthStore } from '../store/authStore'

const BASE = '/contractor/invoices'

export const listInvoices = (params) =>
  client.get(`${BASE}/index.php`, { params }).then((r) => r.data)

export const uploadInvoice = (formData) =>
  client.post(`${BASE}/index.php`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export const updateInvoiceStatus = (data) =>
  client.put(`${BASE}/item.php`, data).then((r) => r.data)

export const deleteInvoice = (id) =>
  client.delete(`${BASE}/item.php`, { params: { id } }).then((r) => r.data)

export const getDownloadUrl = (id) => {
  const base = (client.defaults.baseURL ?? '').replace(/\/$/, '')
  const token = useAuthStore.getState().token ?? ''
  // Append token as query param so the download works in a new tab without Authorization header
  return `${base}/contractor/invoices/download.php?id=${id}&_t=${encodeURIComponent(token)}`
}
