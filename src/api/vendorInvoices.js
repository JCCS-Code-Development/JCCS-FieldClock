import client from './client'
import { useAuthStore } from '../store/authStore'

const BASE = '/vendor-invoices'

export const listVendorInvoices = (params) =>
  client.get(`${BASE}/index.php`, { params }).then((r) => r.data)

export const getVendorInvoice = (id) =>
  client.get(`${BASE}/item.php`, { params: { id } }).then((r) => r.data)

// Admin registers a vendor's bill. FormData — the file is optional.
export const createVendorInvoice = (formData) =>
  client.post(`${BASE}/index.php`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export const updateVendorInvoice = (data) =>
  client.put(`${BASE}/item.php`, data).then((r) => r.data)

export const deleteVendorInvoice = (id) =>
  client.delete(`${BASE}/item.php`, { params: { id } }).then((r) => r.data)

export const getVendorInvoiceDownloadUrl = (id) => {
  const base = (client.defaults.baseURL ?? '').replace(/\/$/, '')
  const token = useAuthStore.getState().token ?? ''
  return `${base}/vendor-invoices/download.php?id=${id}&_t=${encodeURIComponent(token)}`
}
