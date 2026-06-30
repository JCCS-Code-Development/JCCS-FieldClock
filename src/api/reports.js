import client from './client'

export const getLaborCost = (params) =>
  client.get('/reports/labor-cost.php', { params }).then((r) => r.data)

export const getWorkOrderReview = (params) =>
  client.get('/reports/work-order-review.php', { params }).then((r) => r.data)
