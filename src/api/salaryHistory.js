import client from './client'

export const listSalaryHistory = (userId) =>
  client.get('/salary-history/index.php', { params: { user_id: userId } }).then((r) => r.data)

export const createSalaryHistory = (data) =>
  client.post('/salary-history/index.php', data).then((r) => r.data)

export const deleteSalaryHistory = (id) =>
  client.delete('/salary-history/item.php', { params: { id } }).then((r) => r.data)
