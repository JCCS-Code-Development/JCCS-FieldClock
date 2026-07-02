import client from './client'

export const getTimeOffRequests = (params) =>
  client.get('/time-off/index.php', { params }).then((r) => r.data)

export const createTimeOffRequest = (data) =>
  client.post('/time-off/index.php', data).then((r) => r.data)

export const reviewTimeOffRequest = (data) =>
  client.put('/time-off/item.php', data).then((r) => r.data)
