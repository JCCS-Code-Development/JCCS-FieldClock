import client from './client'

export const listEmployees = (params) =>
  client.get('/employees/index.php', { params }).then((r) => r.data)

export const getEmployee = (id) =>
  client.get('/employees/item.php', { params: { id } }).then((r) => r.data)

export const createEmployee = (data) =>
  client.post('/employees/index.php', data).then((r) => r.data)

export const updateEmployee = (id, data) =>
  client.put('/employees/item.php', { id, ...data }).then((r) => r.data)

export const deactivateEmployee = (id) =>
  client.delete('/employees/item.php', { params: { id } }).then((r) => r.data)

export const resetEmployeePassword = (id, newPassword = null) =>
  client.post('/employees/reset-password.php', {
    user_id: id,
    ...(newPassword ? { new_password: newPassword } : {}),
  }).then((r) => r.data)
