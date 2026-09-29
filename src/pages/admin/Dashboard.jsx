import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import StatsCard from '../../components/admin/StatsCard'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import ClockPanel from '../../components/employee/ClockPanel'
import { getStatus, clearLunchLock } from '../../api/timeclock'
import { useTimeclockStore } from '../../store/timeclockStore'
import { useAuthStore } from '../../store/authStore'
import { getChangeRequests } from '../../api/timeclock'
import { format } from 'date-fns'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ clockedIn: [], pendingApprovals: 0 })
  const [lunchLocked, setLunchLocked] = useState([])
  const [clearingId, setClearingId] = useState(null)
  const [clearError, setClearError] = useState('')
  // The employee awaiting confirmation to clear, or null — replaces
  // window.confirm(), which renders as an ugly native browser dialog
  // showing the raw domain ("fieldclock.jccs-services.com says") instead of
  // fitting the app's own UI.
  const [clearLockTarget, setClearLockTarget] = useState(null)
  const { setTimeclockData } = useTimeclockStore()

  const loadStatus = () =>
    getStatus().catch(() => ({ active_employees: [], lunch_locked_employees: [] })).then((status) => {
      setTimeclockData({
        statusLabel:  status.statusLabel  ?? null,
        currentEntry: status.currentEntry ?? null,
        activeJob:    status.activeJob    ?? null,
        dayStarted:   status.dayStarted   ?? false,
      })
      setStats((s) => ({ ...s, clockedIn: status.active_employees ?? [] }))
      setLunchLocked(status.lunch_locked_employees ?? [])
    })

  useEffect(() => {
    Promise.all([
      loadStatus(),
      getChangeRequests({ status: 'pending' }).catch(() => ({ requests: [] }))
        .then((d) => setStats((s) => ({ ...s, pendingApprovals: d.requests?.length ?? 0 }))),
    ]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Currently Clocked In" (and the lunch-lock alert) reflect a snapshot from
  // whenever this loaded — someone starting/ending lunch, clocking in/out, or
  // getting auto locked-out doesn't push here. Refresh it the same way the
  // Clock page keeps its nearby-jobs list current: on regaining focus, plus a
  // periodic fallback for a screen just left open (e.g. on an office display).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadStatus() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(loadStatus, 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClearLock = async () => {
    const emp = clearLockTarget
    setClearingId(emp.id); setClearError('')
    try {
      await clearLunchLock(emp.id)
      await loadStatus()
      setClearLockTarget(null)
    } catch {
      setClearError(t('dashboard.clearLockError'))
    } finally { setClearingId(null) }
  }

  const STATUS_LABELS = {
    working: t('status.working'),
    lunch: t('status.lunch'), dinner: t('status.dinner'), material_run: t('status.material_run'),
    waiting: t('status.waiting'), done: t('status.done'),
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>

  const isSalaried = user?.pay_structure === 'salary'

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Your clock — hourly admins only; salaried admins don't clock in/out at all.
          Renders exactly like the employee Clock page (same card, greeting, and
          layout) instead of being boxed in an extra "Your Clock" wrapper card. */}
      {!isSalaried && <ClockPanel />}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatsCard label={t('dashboard.clockedIn')} value={stats.clockedIn.length} color="green"
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} />
        <StatsCard label={t('dashboard.changeRequests')} value={stats.pendingApprovals} color="amber"
          onClick={() => navigate('/admin/timesheets')}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>} />
      </div>

      {/* Meal-break lock alert — anyone auto clocked-out for going over the
          1-hour paid cap on lunch or dinner, waiting on an admin to let them
          clock back in */}
      {lunchLocked.length > 0 && (
        <div className="bg-red-50 rounded-2xl border border-red-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100">
            <h2 className="font-semibold text-red-700 text-sm">{t('dashboard.lunchLocked')}</h2>
          </div>
          <div className="divide-y divide-red-100/60">
            {lunchLocked.map((emp) => (
              <div key={emp.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {emp.name}
                    <span className="ml-1.5 text-xs font-semibold text-red-500 capitalize">
                      · {t(`status.${emp.meal === 'dinner' ? 'dinner' : 'lunch'}`)}
                    </span>
                  </p>
                  <p className="text-xs text-red-400">
                    {t('dashboard.lunchLockedSince', { time: format(new Date(emp.lunch_locked_at), 'MMM d, h:mm a') })}
                  </p>
                </div>
                <button
                  onClick={() => { setClearError(''); setClearLockTarget(emp) }}
                  disabled={clearingId === emp.id}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3.5 py-1.5 rounded-full transition-colors shrink-0"
                >
                  {clearingId === emp.id ? <Spinner size="sm" /> : t('dashboard.clearLock')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clear-lock confirmation — replaces window.confirm() (a native
          browser dialog that shows the raw domain and can't be styled). */}
      <Modal isOpen={!!clearLockTarget} onClose={() => !clearingId && setClearLockTarget(null)} title={t('dashboard.clearLock')}>
        {clearLockTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              {t('dashboard.clearLockConfirm', { name: clearLockTarget.name })}
            </p>
            {clearError && <p className="text-xs text-red-600 font-medium text-center">{clearError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth size="lg" onClick={() => setClearLockTarget(null)} disabled={!!clearingId}>
                {t('common.cancel')}
              </Button>
              <Button fullWidth size="lg" loading={!!clearingId} onClick={handleClearLock}>
                {t('dashboard.clearLock')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Clocked-in employees */}
      {stats.clockedIn.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">{t('dashboard.currentlyClockedIn')}</h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
            {stats.clockedIn.map((emp) => (
              <div key={emp.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
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
