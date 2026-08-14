import client from './client'

export const listMiscChecks   = (params) => client.get('/misc-checks/index.php', { params }).then((r) => r.data)
export const createMiscCheck  = (data)   => client.post('/misc-checks/index.php', data).then((r) => r.data)
export const updateMiscCheck  = (id, data) => client.put('/misc-checks/item.php', data, { params: { id } }).then((r) => r.data)
export const deleteMiscCheck  = (id)     => client.delete('/misc-checks/item.php', { params: { id } }).then((r) => r.data)
