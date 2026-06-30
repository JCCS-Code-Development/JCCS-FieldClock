import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StatsCard from '../../components/admin/StatsCard'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { getStatus } from '../../api/timeclock'
import { getPending } from '../../api/approvals'
import { listJobs } from '../../api/jobs'
import { getWorkOrderReview } from '../../api/reports'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ clockedIn: [], pendingApprovals: 0, activeJobs: 0, pendingReview: 0 })

  useEffect(() => {
    Promise.all([
      getStatus().catch(() => ({ active_employees: [] })),
      getPending().catch(() => ({ entries: [] })),
      listJobs({ status: 'active' }).catch(() => ({ jobs: [] })),
      getWorkOrderReview({ review_status: 'pending_review' }).catch(() => ({ work_orders: [] })),
    ]).then(([status, approvals, jobs, woReview]) => {
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
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Today's overview</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatsCard label="Clocked In" value={stats.clockedIn.length} icon="👷" color="green" />
        <StatsCard label="Pending Approvals" value={stats.pendingApprovals} icon="⏱" color="amber"
          onClick={() => navigate('/admin/timesheets')} />
        <StatsCard label="Active Jobs" value={stats.activeJobs} icon="📍" color="blue"
          onClick={() => navigate('/admin/jobs')} />
        <StatsCard label="WO Pending Review" value={stats.pendingReview} icon="📋" color="purple"
          onClick={() => navigate('/admin/work-orders')} />
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
