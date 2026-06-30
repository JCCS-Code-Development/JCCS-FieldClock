import client from './client'

export const listJobs = (params) =>
  client.get('/jobs/index.php', { params }).then((r) => r.data)

export const getNearbyJobs = (params) =>
  client.get('/jobs/nearby.php', { params }).then((r) => r.data)

export const getJob = (id) =>
  client.get('/jobs/item.php', { params: { id } }).then((r) => r.data)

export const createJob = (data) =>
  client.post('/jobs/index.php', data).then((r) => r.data)

export const updateJob = (id, data) =>
  client.put('/jobs/item.php', { id, ...data }).then((r) => r.data)

export const deleteJob = (id) =>
  client.delete('/jobs/item.php', { params: { id } }).then((r) => r.data)

export const assignEmployees = (jobId, userIds) =>
  client.post('/jobs/assign.php', { job_id: jobId, user_ids: userIds }).then((r) => r.data)
