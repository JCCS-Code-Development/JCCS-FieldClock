import client from './client'

export const listEstimates   = (params) => client.get('/estimates/index.php', { params }).then((r) => r.data)
export const createEstimate  = (data)   => client.post('/estimates/index.php', data).then((r) => r.data)
export const updateEstimate  = (id, data) => client.put('/estimates/item.php', data, { params: { id } }).then((r) => r.data)
export const deleteEstimate  = (id)     => client.delete('/estimates/item.php', { params: { id } }).then((r) => r.data)
