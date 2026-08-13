import client from './client'

export const listChecks    = (params) => client.get('/checks/index.php', { params }).then(r => r.data)
export const registerChecks = (checks) => client.post('/checks/index.php', { checks }).then(r => r.data)
export const updateCheck   = (data)   => client.put('/checks/item.php', data).then(r => r.data)
export const voidCheck     = (id)     => client.delete(`/checks/item.php?id=${id}`).then(r => r.data)

// One-off: preview/apply the historical net-pay (loan deduction) correction.
// See api/checks/fix-net-amounts.php.
export const previewNetAmountFix = () => client.get('/checks/fix-net-amounts.php').then(r => r.data)
export const applyNetAmountFix   = () => client.post('/checks/fix-net-amounts.php').then(r => r.data)
