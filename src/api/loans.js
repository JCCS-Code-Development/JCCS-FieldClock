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
