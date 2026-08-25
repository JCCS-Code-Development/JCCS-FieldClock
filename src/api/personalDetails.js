import client from './client'

// No user_id → the caller's own record, returned in full. Admin passing a
// user_id gets tax_id/bank_account_number masked unless reveal is set.
export const getPersonalDetails = (userId) =>
  client.get('/employees/personal-details.php', { params: userId ? { user_id: userId } : {} }).then((r) => r.data)

export const revealPersonalDetailField = (userId, field) =>
  client.get('/employees/personal-details.php', { params: { user_id: userId, reveal: field } }).then((r) => r.data)

export const savePersonalDetails = (data) =>
  client.put('/employees/personal-details.php', data).then((r) => r.data)
