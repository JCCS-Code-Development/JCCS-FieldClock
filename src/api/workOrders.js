import client from './client'

export const listWorkOrders = (params) =>
  client.get('/work-orders/index.php', { params }).then((r) => r.data)

export const getWorkOrder = (id) =>
  client.get('/work-orders/item.php', { params: { id } }).then((r) => r.data)

export const createWorkOrder = (data) =>
  client.post('/work-orders/index.php', data).then((r) => r.data)

export const updateWorkOrder = (id, data) =>
  client.put('/work-orders/item.php', { id, ...data }).then((r) => r.data)

export const deleteWorkOrder = (id) =>
  client.delete('/work-orders/item.php', { params: { id } }).then((r) => r.data)

export const completeWorkOrder = (id, notes) =>
  client.post('/work-orders/complete.php', { id, notes }).then((r) => r.data)

export const uploadPhoto = (workOrderId, file, caption = '') => {
  const form = new FormData()
  form.append('work_order_id', workOrderId)
  form.append('photo', file)
  form.append('caption', caption)
  return client
    .post('/work-orders/photos/upload.php', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

export const deletePhoto = (photoId) =>
  client.delete('/work-orders/photos/delete.php', { params: { id: photoId } }).then((r) => r.data)
