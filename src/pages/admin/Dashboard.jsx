import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatsCard from '../../components/admin/StatsCard'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import ClockPanel from '../../components/employee/ClockPanel'
import { getStatus } from '../../api/timeclock'
import { useTimeclockStore } from '../../store/timeclockStore'
import { getPending } from '../../api/approvals'
import { listJobs } from '../../api/jobs'
import { getWorkOrderReview } from '../../api/reports'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
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
        clockedIn:        status.active_employees ?? [],
        pendingApprovals: approvals.entries?.length ?? 0,
        activeJobs:       jobs.jobs?.length ?? 0,
        pendingReview:    woReview.work_orders?.length ?? 0,
      })
    }).finally(() => setLoading(false))
  }, [])

  const STATUS_LABELS = {
    traveling: t('status.traveling'), working: t('status.working'),
    lunch: t('status.lunch'), material_run: t('status.material_run'),
    waiting: t('status.waiting'), done: t('status.done'),
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="flex flex-col gap-6 w-full">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.overview')}</p>
      </div>

      {/* Your clock */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t('dashboard.yourClock')}</p>
        <ClockPanel />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatsCard label={t('dashboard.clockedIn')} value={stats.clockedIn.length} color="green"
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} />
        <StatsCard label={t('dashboard.changeRequests')} value={stats.pendingApprovals} color="amber"
          onClick={() => navigate('/admin/timesheets')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>} />
        <StatsCard label={t('dashboard.activeJobs')} value={stats.activeJobs} color="blue"
          onClick={() => navigate('/admin/jobs')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>} />
        <StatsCard label={t('dashboard.pendingPayroll')} value={stats.pendingReview} color="violet"
          onClick={() => navigate('/admin/payroll')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M2 10h20M6 15h4M14 15h4"/></svg>} />
      </div>

      {/* Clocked-in employees */}
      {stats.clockedIn.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">{t('dashboard.currentlyClockedIn')}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.clockedIn.map((emp) => (
              <div key={emp.id} className="px-5 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{emp.name}</p>
                  {emp.job_name && <p className="text-xs text-gray-400">{emp.job_name}</p>}
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
