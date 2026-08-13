import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import net from 'node:net'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const schemaPath = resolve(here, 'fieldclock_test_schema.sql')
const dbName = `fieldclock_test_${process.pid}_${Date.now()}`
const password = 'ClockTest-Only-2026!'
const servers = []
const results = []
let requestCounter = 0

function mysql(args, input = undefined) {
  const result = spawnSync('mysql', ['-uroot', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`MySQL failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

function sql(statement) {
  return mysql(['--batch', '--skip-column-names', dbName, '-e', statement])
}

function scalar(statement) {
  return Number(sql(statement))
}

function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail) {
  results.push({ ok: false, name, detail })
  console.error(`FAIL  ${name} — ${detail}`)
}

function check(name, condition, detail = '') {
  if (condition) pass(name, detail)
  else fail(name, detail || 'assertion failed')
}

function equal(name, actual, expected) {
  check(name, actual === expected, `expected ${expected}, received ${actual}`)
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const socket = net.createServer()
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close(() => resolvePort(port))
    })
    socket.on('error', reject)
  })
}

async function waitForServer(baseUrl) {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/timeclock/status.php`)
      if (response.status === 401) return
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`PHP test server did not start at ${baseUrl}`)
}

async function startServers(count = 4) {
  for (let i = 0; i < count; i++) {
    const port = await freePort()
    const child = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], {
      cwd: root,
      env: {
        ...process.env,
        FIELDCLOCK_DB_HOST: 'localhost',
        FIELDCLOCK_DB_NAME: dbName,
        FIELDCLOCK_DB_USER: 'root',
        FIELDCLOCK_DB_PASS: '',
        FIELDCLOCK_TEST_MODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    child.stdout.on('data', (chunk) => { logs += chunk.toString() })
    child.stderr.on('data', (chunk) => { logs += chunk.toString() })
    servers.push({ child, baseUrl: `http://127.0.0.1:${port}`, getLogs: () => logs })
    await waitForServer(`http://127.0.0.1:${port}`)
  }
}

async function api(path, { method = 'GET', token = null, body = undefined, server = null } = {}) {
  const target = server ?? servers[requestCounter++ % servers.length]
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${target.baseUrl}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  return { status: response.status, data }
}

async function login(email) {
  const response = await api('/auth/login.php', {
    method: 'POST',
    body: { identifier: email, password },
  })
  if (response.status !== 200 || !response.data?.token) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.data)}`)
  }
  return response.data
}

function seedSql(hash) {
  const users = [
    [1, 'Simulation Admin', 'admin@test.invalid', 'admin', 'w2', 'hourly', 35],
    ...Array.from({ length: 10 }, (_, index) => [index + 2, `Sim Worker ${String(index + 1).padStart(2, '0')}`, `worker${index + 1}@test.invalid`, 'employee', index % 3 === 2 ? '1099' : 'w2', 'hourly', 20 + index]),
    [12, 'Race Worker', 'race@test.invalid', 'employee', 'w2', 'hourly', 20],
    [13, 'Overnight Worker', 'overnight@test.invalid', 'employee', 'w2', 'hourly', 20],
    [14, 'Salary Worker', 'salary@test.invalid', 'employee', 'w2', 'salary', 1200],
    [15, 'Unassigned Worker', 'unassigned@test.invalid', 'employee', 'w2', 'hourly', 20],
  ]
  const values = users.map(([id, name, email, role, payType, structure, rate]) =>
    `(${id},'${name}','${email}','${role}','${payType}','${structure}',${rate},'${hash}',1)`
  ).join(',\n')
  const assignments = []
  for (let userId = 2; userId <= 13; userId++) {
    assignments.push(`(1,${userId})`, `(2,${userId})`)
  }
  return `
    INSERT INTO users (id,name,email,role,pay_type,pay_structure,pay_rate,password_hash,is_active) VALUES ${values};
    INSERT INTO jobs (id,name,client_name,company,address,latitude,longitude,clock_in_radius_meters,status,is_recurring_maintenance) VALUES
      (1,'Hospital Main','Facilities','Hospital Group','100 Main St',34.0000000,-81.0000000,300,'active',0),
      (2,'Clinic North','Facilities','Hospital Group','200 North St',34.1000000,-81.1000000,300,'active',0),
      (3,'Restricted Site','Private Client','Other Company','300 Private Rd',34.2000000,-81.2000000,300,'active',0);
    INSERT INTO job_assignments (job_id,user_id) VALUES ${assignments.join(',')};
    INSERT INTO job_estimates (id,job_id,estimate_number,description,is_active,created_by)
      VALUES (1,1,'EST-TEST-001','Integration test estimate',1,1);
  `
}

function cleanup() {
  for (const { child } of servers) {
    if (!child.killed) child.kill('SIGTERM')
  }
  if (/^fieldclock_test_[0-9_]+$/.test(dbName)) {
    spawnSync('mysql', ['-uroot', '-e', `DROP DATABASE IF EXISTS \`${dbName}\``], { encoding: 'utf8' })
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

async function run() {
  console.log(`Creating disposable database ${dbName}`)
  mysql(['-e', `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`])
  mysql([dbName], readFileSync(schemaPath, 'utf8'))
  const hashResult = spawnSync('php', ['-r', `echo password_hash('${password}', PASSWORD_BCRYPT);`], { encoding: 'utf8' })
  if (hashResult.status !== 0 || !hashResult.stdout) throw new Error('Could not create test password hash')
  mysql([dbName], seedSql(hashResult.stdout.trim()))
  await startServers(4)
  pass('isolated environment', 'four API processes share one disposable database')

  const accounts = await Promise.all([
    login('admin@test.invalid'),
    ...Array.from({ length: 10 }, (_, i) => login(`worker${i + 1}@test.invalid`)),
    login('race@test.invalid'),
    login('overnight@test.invalid'),
    login('salary@test.invalid'),
    login('unassigned@test.invalid'),
  ])
  const [admin, ...rest] = accounts
  const workers = rest.slice(0, 10)
  const race = rest[10]
  const overnight = rest[11]
  const salary = rest[12]
  const unassigned = rest[13]
  pass('concurrent authentication', `${accounts.length} synthetic accounts logged in`) 

  const noAuth = await api('/timeclock/day-start.php', { method: 'POST', body: { job_id: 1 } })
  equal('authentication required for clock actions', noAuth.status, 401)

  const salaryStart = await api('/timeclock/day-start.php', {
    method: 'POST', token: salary.token,
    body: { job_id: 1, visit_category: 'work_order', work_order_number: 'SAL-1' },
  })
  equal('salary employee cannot clock in', salaryStart.status, 403)

  const unassignedTravel = await api('/timeclock/traveling.php', {
    method: 'POST', token: unassigned.token, body: { job_id: 3 },
  })
  equal('unassigned employee cannot start travel', unassignedTravel.status, 403)

  const invalidVisit = await api('/timeclock/day-start.php', {
    method: 'POST', token: unassigned.token,
    body: { job_id: 1, visit_category: 'estimate', estimate_id: 999, estimate_subtype: 'regular' },
  })
  equal('invalid visit classification is rejected', invalidVisit.status, 422)

  const starts = await Promise.all(workers.map((worker, index) => {
    if (index % 2 === 0) {
      return api('/timeclock/day-start.php', {
        method: 'POST', token: worker.token,
        body: {
          job_id: 1, lat: 34, lng: -81, accuracy: 8,
          visit_category: 'work_order', work_order_number: `WO-${index + 1}`,
          visit_description: 'Scheduled simulation work',
        },
        server: servers[index % servers.length],
      })
    }
    return api('/timeclock/traveling.php', {
      method: 'POST', token: worker.token,
      body: { job_id: 2, lat: 34, lng: -81, accuracy: 10 },
      server: servers[index % servers.length],
    })
  }))
  check('ten employees clock in concurrently', starts.every((r) => r.status === 200), starts.map((r) => r.status).join(','))

  const arrivals = await Promise.all(workers.map((worker, index) => index % 2 === 1
    ? api('/timeclock/mark-arrival.php', {
        method: 'POST', token: worker.token,
        body: {
          job_id: 2, lat: 34.1, lng: -81.1, accuracy: 6,
          visit_category: 'work_order', work_order_number: `ARR-${index + 1}`,
          visit_description: 'Arrival simulation',
        },
        server: servers[index % servers.length],
      })
    : Promise.resolve(null)))
  check('traveling employees arrive concurrently', arrivals.filter(Boolean).every((r) => r.status === 200 && r.data?.within_radius === true))

  const adminStatus = await api('/timeclock/status.php', { token: admin.token })
  equal('admin sees all concurrently active employees', adminStatus.data?.active_employees?.length, 10)
  equal('one active work entry per employee', scalar("SELECT COUNT(*) FROM time_entries WHERE end_time IS NULL AND cost_category != 'day_end'"), 10)

  const firstWave = await Promise.all(workers.slice(0, 5).map((worker, i) => api('/timeclock/day-end.php', {
    method: 'POST', token: worker.token, body: { lat: 34, lng: -81 }, server: servers[i % servers.length],
  })))
  const midStatus = await api('/timeclock/status.php', { token: admin.token })
  check('staggered first clock-out wave succeeds', firstWave.every((r) => r.status === 200))
  equal('five employees remain after first wave', midStatus.data?.active_employees?.length, 5)

  const secondWave = await Promise.all(workers.slice(5).map((worker, i) => api('/timeclock/day-end.php', {
    method: 'POST', token: worker.token, body: { lat: 34.1, lng: -81.1 }, server: servers[i % servers.length],
  })))
  check('staggered second clock-out wave succeeds', secondWave.every((r) => r.status === 200))
  equal('no work entries remain open after clock-out', scalar("SELECT COUNT(*) FROM time_entries WHERE end_time IS NULL AND cost_category != 'day_end'"), 0)
  equal('one day-end marker per completed worker', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id BETWEEN 2 AND 11 AND cost_category = 'day_end'"), 10)

  const periodStart = '2026-07-27'
  const periodEnd = '2026-08-02'
  const payrollEntries = []
  for (let day = 27; day <= 31; day++) {
    payrollEntries.push(api('/timeclock/admin-entry.php', {
      method: 'POST', token: admin.token,
      body: {
        user_id: 2, job_id: 1, status_label: 'working',
        start_time: `2026-07-${day} 08:00:00`, end_time: `2026-07-${day} 17:00:00`,
        visit_category: 'work_order', work_order_number: `PAY-${day}`, visit_description: 'Payroll simulation',
      },
    }))
  }
  for (let userId = 3; userId <= 11; userId++) {
    const hour = 7 + ((userId - 3) % 3)
    payrollEntries.push(api('/timeclock/admin-entry.php', {
      method: 'POST', token: admin.token,
      body: {
        user_id: userId, job_id: 1, status_label: 'working',
        start_time: `2026-07-27 ${String(hour).padStart(2, '0')}:00:00`,
        end_time: `2026-07-27 ${String(hour + 8).padStart(2, '0')}:00:00`,
        visit_category: 'work_order', work_order_number: `TEAM-${userId}`, visit_description: 'Team schedule simulation',
      },
    }))
  }
  const historical = await Promise.all(payrollEntries)
  check('different scheduled times are stored across multiple employees', historical.every((r) => r.status === 200), historical.map((r) => r.status).join(','))

  const overlap = await api('/timeclock/admin-entry.php', {
    method: 'POST', token: admin.token,
    body: { user_id: 2, job_id: 1, status_label: 'working', start_time: '2026-07-27 08:30:00', end_time: '2026-07-27 09:30:00' },
  })
  equal('same-employee overlapping entry is rejected', overlap.status, 422)

  const adjacent = await api('/timeclock/admin-entry.php', {
    method: 'POST', token: admin.token,
    body: { user_id: 3, job_id: 1, status_label: 'working', start_time: '2026-07-27 15:00:00', end_time: '2026-07-27 16:00:00' },
  })
  equal('adjacent non-overlapping entry is accepted', adjacent.status, 200)

  const payroll = await api(`/payroll/summary.php?start=${periodStart}&end=${periodEnd}`, { token: admin.token })
  const payrollWorker = payroll.data?.summary?.find((row) => Number(row.user_id) === 2)
  check('45-hour payroll calculation uses straight time', payrollWorker?.regular_hours === 40 && payrollWorker?.overtime_hours === 5 && payrollWorker?.base_gross === 900, JSON.stringify(payrollWorker))

  const correctionEntry = historical.find((_, index) => index === 5)?.data?.entry
  const correction = await api('/timeclock/change-requests.php', {
    method: 'POST', token: workers[1].token,
    body: { entry_id: correctionEntry.id, requested_start: '2026-07-27 07:15:00', reason: 'Simulation correction' },
  })
  equal('employee can request a correction to own entry', correction.status, 200)
  const foreignCorrection = await api('/timeclock/change-requests.php', {
    method: 'POST', token: workers[2].token,
    body: { entry_id: correctionEntry.id, requested_start: '2026-07-27 07:30:00', reason: 'Should be forbidden' },
  })
  equal('employee cannot change another employee entry', foreignCorrection.status, 403)
  const duplicateCorrection = await api('/timeclock/change-requests.php', {
    method: 'POST', token: workers[1].token,
    body: { entry_id: correctionEntry.id, requested_start: '2026-07-27 07:30:00', reason: 'Duplicate' },
  })
  equal('duplicate pending correction is rejected', duplicateCorrection.status, 409)
  const approveCorrection = await api('/timeclock/review-change.php', {
    method: 'POST', token: admin.token,
    body: { request_id: correction.data?.id, action: 'approve', note: 'Approved in simulation' },
  })
  equal('administrator can approve correction', approveCorrection.status, 200)
  check('approved correction creates audit history', scalar(`SELECT COUNT(*) FROM time_entry_history WHERE entry_id=${Number(correctionEntry.id)} AND source='change_request_approval'`) === 1)

  const orphan = await api('/timeclock/admin-entry.php', {
    method: 'POST', token: admin.token,
    body: { user_id: 13, job_id: 1, status_label: 'working', start_time: '2026-08-01 22:00:00' },
  })
  equal('overnight open entry can be represented', orphan.status, 200)
  const blockedByOrphan = await api('/timeclock/day-start.php', {
    method: 'POST', token: overnight.token,
    body: { job_id: 1, visit_category: 'work_order', work_order_number: 'NEXT-DAY' },
  })
  equal('forgotten overnight entry blocks a second clock-in', blockedByOrphan.status, 409)
  const closeOvernight = await api('/timeclock/day-end.php', { method: 'POST', token: overnight.token, body: {} })
  equal('overnight entry can be safely clocked out', closeOvernight.status, 200)

  const neverStartedEnd = await api('/timeclock/day-end.php', { method: 'POST', token: unassigned.token, body: {} })
  equal('clock-out without an active day is rejected', neverStartedEnd.status, 422)

  const raceStarts = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/day-start.php', {
    method: 'POST', token: race.token,
    body: { job_id: 1, visit_category: 'work_order', work_order_number: 'RACE-START', visit_description: 'Rapid double tap' },
    server: servers[i % servers.length],
  })))
  equal('simultaneous duplicate clock-ins create one successful start', raceStarts.filter((r) => r.status === 200).length, 1)
  equal('duplicate clock-in leaves exactly one open work entry', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND end_time IS NULL AND cost_category != 'day_end'"), 1)

  const raceEnds = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/day-end.php', {
    method: 'POST', token: race.token, body: {}, server: servers[i % servers.length],
  })))
  check('duplicate clock-out requests are idempotent', raceEnds.every((r) => r.status === 200), raceEnds.map((r) => r.status).join(','))
  equal('duplicate clock-out creates one day-end marker', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND cost_category='day_end'"), 1)
  equal('duplicate clock-out leaves no open work entry', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND end_time IS NULL AND cost_category != 'day_end'"), 0)

  sql('DELETE FROM time_entries WHERE user_id=12')
  const travelStart = await api('/timeclock/traveling.php', { method: 'POST', token: race.token, body: { job_id: 2, lat: 34, lng: -81 } })
  equal('race worker can begin travel', travelStart.status, 200)
  const duplicateTravel = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/traveling.php', {
    method: 'POST', token: race.token, body: { job_id: 2, lat: 34, lng: -81 }, server: servers[i % servers.length],
  })))
  check('duplicate travel requests are idempotent', duplicateTravel.every((r) => r.status === 200), duplicateTravel.map((r) => r.status).join(','))
  equal('duplicate travel creates one traveling segment', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND status_label='traveling'"), 1)
  const raceArrivals = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/mark-arrival.php', {
    method: 'POST', token: race.token,
    body: { job_id: 2, lat: 34.1, lng: -81.1, visit_category: 'work_order', work_order_number: 'RACE-ARRIVE', visit_description: 'Rapid arrival tap' },
    server: servers[i % servers.length],
  })))
  check('duplicate arrival requests are idempotent', raceArrivals.every((r) => r.status === 200), raceArrivals.map((r) => r.status).join(','))
  equal('duplicate arrival leaves one open working entry', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND end_time IS NULL AND status_label='working'"), 1)
  equal('duplicate arrival creates one working segment', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND status_label='working'"), 1)

  const switchRequests = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/switch-job.php', {
    method: 'POST', token: race.token, body: { job_id: 1 }, server: servers[i % servers.length],
  })))
  check('duplicate job-switch requests are idempotent', switchRequests.every((r) => r.status === 200), switchRequests.map((r) => r.status).join(','))
  equal('job switching leaves one open entry at the new job', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND end_time IS NULL AND job_id=1"), 1)

  const lunchRequests = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/lunch.php', {
    method: 'POST', token: race.token, body: {}, server: servers[i % servers.length],
  })))
  check('duplicate lunch transitions are idempotent', lunchRequests.every((r) => r.status === 200), lunchRequests.map((r) => r.status).join(','))
  equal('duplicate lunch transition creates one lunch segment', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND status_label='lunch'"), 1)

  const resumeRequests = await Promise.all(Array.from({ length: 12 }, (_, i) => api('/timeclock/working.php', {
    method: 'POST', token: race.token, body: {}, server: servers[i % servers.length],
  })))
  check('duplicate resume-work transitions are idempotent', resumeRequests.every((r) => r.status === 200), resumeRequests.map((r) => r.status).join(','))
  equal('resume-work leaves one active working segment', scalar("SELECT COUNT(*) FROM time_entries WHERE user_id=12 AND end_time IS NULL AND status_label='working'"), 1)

  const finalRaceEnd = await api('/timeclock/day-end.php', { method: 'POST', token: race.token, body: {} })
  equal('race workflow clocks out cleanly after transitions', finalRaceEnd.status, 200)

  check('every created or changed clock segment is audited', scalar('SELECT COUNT(*) FROM time_entry_history') >= scalar('SELECT COUNT(*) FROM time_entries'))
  equal('no duplicate open work entries remain for any employee', scalar("SELECT COUNT(*) FROM (SELECT user_id FROM time_entries WHERE end_time IS NULL AND cost_category != 'day_end' GROUP BY user_id HAVING COUNT(*) > 1) duplicate_users"), 0)
}

let fatal = null
try {
  await run()
} catch (error) {
  fatal = error
  console.error(`FATAL ${error.stack || error.message}`)
  for (const server of servers) {
    const logs = server.getLogs().trim()
    if (logs) console.error(logs.slice(-4000))
  }
} finally {
  cleanup()
}

const failed = results.filter((result) => !result.ok)
console.log(`\nClock simulation: ${results.length - failed.length} passed, ${failed.length} failed${fatal ? ', fatal setup/runtime error' : ''}.`)
if (failed.length || fatal) process.exitCode = 1
