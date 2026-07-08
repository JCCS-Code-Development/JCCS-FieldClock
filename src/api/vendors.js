import client from './client'

export const listVendors       = (params) => client.get('/vendors/index.php', { params }).then(r => r.data)
export const createVendor      = (data)   => client.post('/vendors/index.php', data).then(r => r.data)
export const updateVendor      = (id, data) => client.put('/vendors/item.php', data, { params: { id } }).then(r => r.data)
export const deactivateVendor  = (id)    => client.delete('/vendors/item.php', { params: { id } }).then(r => r.data)

export const listVendorChecks  = (params) => client.get('/vendor-checks/index.php', { params }).then(r => r.data)
export const createVendorCheck = (data)   => client.post('/vendor-checks/index.php', data).then(r => r.data)
export const updateVendorCheck = (id, data) => client.put('/vendor-checks/item.php', data, { params: { id } }).then(r => r.data)
export const deleteVendorCheck = (id)    => client.delete('/vendor-checks/item.php', { params: { id } }).then(r => r.data)
