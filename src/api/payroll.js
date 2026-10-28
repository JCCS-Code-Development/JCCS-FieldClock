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

// "No lunch registered" 1-hour penalties — suggested on the admin Timesheets
// page, only ever recorded when an admin applies one.
export const listLunchPenalties = (params) =>
  client.get('/payroll/lunch-penalties.php', { params }).then((r) => r.data)

export const applyLunchPenalty = (data) =>
  client.post('/payroll/lunch-penalties.php', data).then((r) => r.data)

export const removeLunchPenalty = (id) =>
  client.delete('/payroll/lunch-penalties.php', { params: { id } }).then((r) => r.data)
