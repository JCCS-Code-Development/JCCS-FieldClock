import client from './client'
import { useAuthStore } from '../store/authStore'

export const listLoans            = (params) => client.get('/loans/index.php',   { params }).then((r) => r.data)

// My Pay's "my loans" view — an admin is also an employee viewing their own
// page here, so this must force self-scoping even though listLoans() alone
// would return everyone for an admin caller. See api/loans/index.php.
export const listMyLoans          = ()       => client.get('/loans/index.php',   { params: { mine: 1 } }).then((r) => r.data)
export const getLoan              = (id)     => client.get('/loans/item.php',     { params: { id } }).then((r) => r.data)
export const createLoan           = (data)   => client.post('/loans/index.php',   data).then((r) => r.data)
export const updateLoan           = (data)   => client.put('/loans/item.php',     data).then((r) => r.data)
export const deleteLoan           = (id)     => client.delete('/loans/item.php',  { params: { id } }).then((r) => r.data)

// multipart/form-data — a receipt image may be attached for check/transfer payments
export const recordPayment = (formData) =>
  client.post('/loans/payments/index.php', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export const deletePayment        = (id)     => client.delete('/loans/payments/index.php', { params: { id } }).then((r) => r.data)

export const getLoanReceiptUrl = (paymentId) => {
  const base  = (client.defaults.baseURL ?? '').replace(/\/$/, '')
  const token = useAuthStore.getState().token ?? ''
  return `${base}/loans/payments/download.php?id=${paymentId}&_t=${encodeURIComponent(token)}`
}
export const getPeriodLoanTotals     = (period_start, period_end) =>
  client.get('/loans/index.php', { params: { period_start, period_end } }).then((r) => r.data.period_loan_deductions ?? {})

export const getMyPeriodLoanDeduction = (period_start, period_end) =>
  client.get('/loans/index.php', { params: { period_start, period_end, mine: 1 } }).then((r) => r.data.period_loan_deduction ?? 0)

// ── Signed pagarés (promissory notes) — see api/loans/_pagare.php ────────
export const listLoanNotes   = (loan_id) => client.get('/loans/notes.php', { params: { loan_id } }).then((r) => r.data.notes ?? [])
export const listMyLoanNotes = ()        => client.get('/loans/notes.php', { params: { mine: 1 } }).then((r) => r.data.notes ?? [])
export const signLoanNote    = (data)    => client.post('/loans/sign.php', data).then((r) => r.data)
export const countersignLoanNote = (data) => client.post('/loans/countersign.php', data).then((r) => r.data)
export const voidLoan        = (loan_id) => client.post('/loans/void.php', { loan_id }).then((r) => r.data)
export const amendLoan       = (data)    => client.post('/loans/amend.php', data).then((r) => r.data)
export const repaperLoans    = ()        => client.post('/loans/repaper.php', {}).then((r) => r.data)
export const getLoansDue     = (week_start) => client.get('/loans/due.php', { params: { week_start } }).then((r) => r.data)
export const previewSeparation = (params) => client.get('/loans/separate.php', { params }).then((r) => r.data)
export const separateEmployee  = (data)   => client.post('/loans/separate.php', data).then((r) => r.data)
export const getMySignature  = ()     => client.get('/loans/my-signature.php').then((r) => r.data.signature_data)
export const saveMySignature = (signature_data) => client.put('/loans/my-signature.php', { signature_data }).then((r) => r.data)
