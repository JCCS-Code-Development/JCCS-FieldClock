import client from './client'

export const listVisitStops = (params) =>
  client.get('/visit-stops/index.php', { params }).then((r) => r.data)

export const createVisitStop = (data) =>
  client.post('/visit-stops/index.php', data).then((r) => r.data)

export const updateVisitStop = (id, data) =>
  client.put('/visit-stops/item.php', { id, ...data }).then((r) => r.data)

export const deleteVisitStop = (id) =>
  client.delete('/visit-stops/item.php', { params: { id } }).then((r) => r.data)
