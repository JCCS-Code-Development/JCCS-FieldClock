import client from './client'

export const listChecks    = (params) => client.get('/checks/index.php', { params }).then(r => r.data)
export const registerChecks = (checks) => client.post('/checks/index.php', { checks }).then(r => r.data)
export const updateCheck   = (data)   => client.put('/checks/item.php', data).then(r => r.data)
export const voidCheck     = (id)     => client.delete(`/checks/item.php?id=${id}`).then(r => r.data)
