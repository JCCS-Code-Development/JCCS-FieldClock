import client from './client'

export const listInvoices = (params) =>
  client.get('/invoices/index.php', { params }).then((r) => r.data)

export const getInvoice = (id) =>
  client.get('/invoices/item.php', { params: { id } }).then((r) => r.data)

export const createInvoice = (data) =>
  client.post('/invoices/index.php', data).then((r) => r.data)

export const updateInvoice = (id, data) =>
  client.put('/invoices/item.php', { id, ...data }).then((r) => r.data)

export const deleteInvoice = (id) =>
  client.delete('/invoices/item.php', { params: { id } }).then((r) => r.data)
