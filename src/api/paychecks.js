import client from './client'

export const listPaychecks   = (params) => client.get('/paychecks/index.php', { params }).then((r) => r.data)
export const createPaycheck  = (data)   => client.post('/paychecks/index.php', data).then((r) => r.data)
export const updatePaycheck  = (data)   => client.put('/paychecks/item.php', data).then((r) => r.data)
export const deletePaycheck  = (id)     => client.delete(`/paychecks/item.php?id=${id}`).then((r) => r.data)

export const markAllAvailable = (periodStart, periodEnd) =>
  client.post('/paychecks/mark-available-bulk.php', { period_start: periodStart, period_end: periodEnd }).then((r) => r.data)

// For catching up old backlog: checks that were already handed out in real
// life but never got marked as such in the app. Skips the "available" push
// notification on purpose — see mark-picked-up-bulk.php.
export const markAllPickedUp = (periodStart, periodEnd) =>
  client.post('/paychecks/mark-picked-up-bulk.php', { period_start: periodStart, period_end: periodEnd }).then((r) => r.data)
