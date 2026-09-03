import client from './client'

export const listChecks     = (params) => client.get('/checks/index.php', { params }).then(r => r.data)
export const getCheck       = (id)     => client.get('/checks/item.php', { params: { id } }).then(r => r.data)

// Create a single check for an employee / vendor / other payee.
export const createCheck    = (data)   => client.post('/checks/index.php', data).then(r => r.data)

// Pay one or more approved contractor invoices with one check.
export const payInvoices    = (contractor_invoice_ids, opts = {}) =>
  client.post('/checks/index.php', { contractor_invoice_ids, ...opts }).then(r => r.data)

// Pay one or more approved vendor invoices with one check.
export const payVendorInvoices = (vendor_invoice_ids, opts = {}) =>
  client.post('/checks/index.php', { vendor_invoice_ids, ...opts }).then(r => r.data)

// Batch-register printed checks from the payday print run.
export const registerChecks = (checks) => client.post('/checks/index.php', { checks }).then(r => r.data)

// Move a check along its lifecycle: draft -> printed -> cleared -> voided.
export const markPrinted    = (id, check_number, issued_date) =>
  client.put('/checks/item.php', { id, status: 'printed', check_number, issued_date }).then(r => r.data)
// Undo "mark printed" — back to draft, check number cleared.
export const unmarkPrinted  = (id) => client.put('/checks/item.php', { id, status: 'draft' }).then(r => r.data)
export const markCleared    = (id) => client.put('/checks/item.php', { id, status: 'cleared' }).then(r => r.data)
export const voidCheck      = (id, void_reason) =>
  client.put('/checks/item.php', { id, status: 'voided', void_reason }).then(r => r.data)

// Edit a draft's fields.
export const updateCheck    = (data) => client.put('/checks/item.php', data).then(r => r.data)

// Discard a draft.
export const deleteCheck    = (id)   => client.delete('/checks/item.php', { params: { id } }).then(r => r.data)
