import client from './client'

export const getSummary = (params) =>
  client.get('/payroll/summary.php', { params }).then((r) => r.data)

export const getBreakdown = (params) =>
  client.get('/payroll/breakdown.php', { params }).then((r) => r.data)

export const getMyPay = (params) =>
  client.get('/payroll/my-pay.php', { params }).then((r) => r.data)

export const listAdjustments = (params) =>
  client.get('/payroll/adjustments/index.php', { params }).then((r) => r.data)

export const createAdjustment = (data) =>
  client.post('/payroll/adjustments/index.php', data).then((r) => r.data)

export const updateAdjustment = (id, data) =>
  client.put('/payroll/adjustments/item.php', { id, ...data }).then((r) => r.data)

export const deleteAdjustment = (id) =>
  client.delete('/payroll/adjustments/item.php', { params: { id } }).then((r) => r.data)

export const getAnnualSummary = (year) =>
  client.get('/payroll/annual-summary.php', { params: { year } }).then((r) => r.data)

export const listFlatRatePayments = (params) =>
  client.get('/payroll/flat-rate.php', { params }).then((r) => r.data)

export const createFlatRatePayment = (data) =>
  client.post('/payroll/flat-rate.php', data).then((r) => r.data)

export const updateFlatRatePayment = (id, data) =>
  client.put('/payroll/flat-rate.php', { id, ...data }).then((r) => r.data)

export const deleteFlatRatePayment = (id) =>
  client.delete('/payroll/flat-rate.php', { params: { id } }).then((r) => r.data)
