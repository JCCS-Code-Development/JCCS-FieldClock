import client from './client'

export const listLoans            = (params) => client.get('/loans/index.php',   { params }).then((r) => r.data)
export const getLoan              = (id)     => client.get('/loans/item.php',     { params: { id } }).then((r) => r.data)
export const createLoan           = (data)   => client.post('/loans/index.php',   data).then((r) => r.data)
export const updateLoan           = (data)   => client.put('/loans/item.php',     data).then((r) => r.data)
export const deleteLoan           = (id)     => client.delete('/loans/item.php',  { params: { id } }).then((r) => r.data)
export const recordPayment        = (data)   => client.post('/loans/payments/index.php', data).then((r) => r.data)
export const deletePayment        = (id)     => client.delete('/loans/payments/index.php', { params: { id } }).then((r) => r.data)
export const getPeriodLoanTotals     = (period_start, period_end) =>
  client.get('/loans/index.php', { params: { period_start, period_end } }).then((r) => r.data.period_loan_deductions ?? {})

export const getMyPeriodLoanDeduction = (period_start, period_end) =>
  client.get('/loans/index.php', { params: { period_start, period_end } }).then((r) => r.data.period_loan_deduction ?? 0)
