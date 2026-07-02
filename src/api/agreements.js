import client from './client'

export const listAgreements    = (params) => client.get('/agreements/index.php', { params }).then((r) => r.data)
export const getAgreement      = (params) => client.get('/agreements/item.php',  { params }).then((r) => r.data)
export const signAgreement     = (data)   => client.post('/agreements/sign.php', data).then((r) => r.data)
export const resetAgreement    = (params) => client.delete('/agreements/item.php', { params }).then((r) => r.data)
