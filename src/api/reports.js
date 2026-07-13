import client from './client'

export const getLaborCost = (params) =>
  client.get('/reports/labor-cost.php', { params }).then((r) => r.data)
