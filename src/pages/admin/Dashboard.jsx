import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StatsCard from '../../components/admin/StatsCard'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import ClockToggle from '../../components/employee/ClockToggle'
import { getStatus } from '../../api/timeclock'
import { useTimeclockStore } from '../../store/timeclockStore'
import { getPending } from '../../api/approvals'
import { listJobs } from '../../api/jobs'
import { getWorkOrderReview } from '../../api/reports'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ clockedIn: [], pendingApprovals: 0, activeJobs: 0, pendingReview: 0 })
  const { setTimeclockData } = useTimeclockStore()

  useEffect(() => {
    Promise.all([
      getStatus().catch(() => ({ active_employees: [] })),
      getPending().catch(() => ({ entries: [] })),
      listJobs({ status: 'active' }).catch(() => ({ jobs: [] })),
      getWorkOrderReview({ review_status: 'pending_review' }).catch(() => ({ work_orders: [] })),
    ]).then(([status, approvals, jobs, woReview]) => {
      setTimeclockData({
        statusLabel:  status.statusLabel  ?? null,
        currentEntry: status.currentEntry ?? null,
        activeJob:    status.activeJob    ?? null,
        dayStarted:   status.dayStarted   ?? false,
      })
      setStats({
        clockedIn: status.active_employees ?? [],
        pendingApprovals: approvals.entries?.length ?? 0,
        activeJobs: jobs.jobs?.length ?? 0,
        pendingReview: woReview.work_orders?.length ?? 0,
      })
    }).finally(() => setLoading(false))
  }, [])

  const STATUS_LABELS = {
    traveling: 'Traveling', working: 'Working', lunch: 'Lunch',
    material_run: 'Material Run', waiting: 'Waiting', done: 'Done',
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Today's overview</p>
      </div>

      {/* Admin clock in/out */}
      <div className="bg-white rounded-2xl border border-gray-100 px-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-4 pb-1">Your Clock</p>
        <ClockToggle />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatsCard label="Clocked In" value={stats.clockedIn.length} color="green"
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} />
        <StatsCard label="Change Requests" value={stats.pendingApprovals} color="amber"
          onClick={() => navigate('/admin/timesheets')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>} />
        <StatsCard label="Active Jobs" value={stats.activeJobs} color="blue"
          onClick={() => navigate('/admin/jobs')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>} />
        <StatsCard label="Reports" value="" color="green"
          onClick={() => navigate('/admin/reports')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6"/></svg>} />
      </div>

      {stats.clockedIn.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Currently Clocked In</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.clockedIn.map((emp) => (
              <div key={emp.id} className="px-5 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                  {emp.job_name && (
                    <p className="text-xs text-gray-400">{emp.job_name}</p>
                  )}
                </div>
                <Badge variant={emp.status_label ?? 'active'}>
                  {STATUS_LABELS[emp.status_label] ?? emp.status_label}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
