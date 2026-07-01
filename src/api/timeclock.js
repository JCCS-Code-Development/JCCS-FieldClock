import client from './client'

export const getStatus = () =>
  client.get('/timeclock/status.php').then((r) => r.data)

export const dayStart = (payload) =>
  client.post('/timeclock/day-start.php', payload).then((r) => r.data)

export const setTraveling = (payload) =>
  client.post('/timeclock/traveling.php', payload).then((r) => r.data)

export const markArrival = (payload) =>
  client.post('/timeclock/mark-arrival.php', payload).then((r) => r.data)

export const setWorking = (payload) =>
  client.post('/timeclock/working.php', payload).then((r) => r.data)

export const setLunch = (payload) =>
  client.post('/timeclock/lunch.php', payload).then((r) => r.data)

export const setMaterialRun = (payload) =>
  client.post('/timeclock/material-run.php', payload).then((r) => r.data)

export const setWaiting = (payload) =>
  client.post('/timeclock/waiting.php', payload).then((r) => r.data)

export const dayEnd = (payload) =>
  client.post('/timeclock/day-end.php', payload).then((r) => r.data)

export const getEntries = (params) =>
  client.get('/timeclock/entries.php', { params }).then((r) => r.data)

export const getChangeRequests = (params) =>
  client.get('/timeclock/change-requests.php', { params }).then((r) => r.data)

export const createChangeRequest = (data) =>
  client.post('/timeclock/change-requests.php', data).then((r) => r.data)

export const reviewChangeRequest = (data) =>
  client.post('/timeclock/review-change.php', data).then((r) => r.data)
