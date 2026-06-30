import client from './client'

export const getPending = () =>
  client.get('/approvals/pending.php').then((r) => r.data)

export const approveEntries = (entryIds) =>
  client.post('/approvals/approve.php', { entry_ids: entryIds }).then((r) => r.data)

export const rejectEntry = (entryId, reason) =>
  client.post('/approvals/reject.php', { entry_id: entryId, reason }).then((r) => r.data)
