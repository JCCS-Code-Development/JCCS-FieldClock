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

export const registerJob = (data) =>
  client.post('/jobs/register.php', data).then((r) => r.data)

// Folds a pending-review location into an existing job — its time entries,
// estimates, and any assignments move over and the pending placeholder is
// removed.
export const mergeJob = (pendingJobId, targetJobId) =>
  client.post('/jobs/merge.php', { pending_job_id: pendingJobId, target_job_id: targetJobId }).then((r) => r.data)
