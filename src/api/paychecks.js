import client from './client'

export const listPaychecks   = (params) => client.get('/paychecks/index.php', { params }).then((r) => r.data)
export const createPaycheck  = (data)   => client.post('/paychecks/index.php', data).then((r) => r.data)
export const updatePaycheck  = (data)   => client.put('/paychecks/item.php', data).then((r) => r.data)
export const deletePaycheck  = (id)     => client.delete(`/paychecks/item.php?id=${id}`).then((r) => r.data)
