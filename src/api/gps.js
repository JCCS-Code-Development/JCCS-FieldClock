import client from './client'

export const postWaypoints = (data) =>
  client.post('/gps/waypoints.php', data).then((r) => r.data)

export const getDailyMileage = (params) =>
  client.get('/gps/waypoints.php', { params }).then((r) => r.data)
