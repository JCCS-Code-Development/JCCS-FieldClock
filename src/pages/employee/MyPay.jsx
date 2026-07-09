import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../../components/ui/Card'
import StatsCard from '../../components/admin/StatsCard'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { getMyPay } from '../../api/payroll'
import { getEntries, createChangeRequest, getChangeRequests } from '../../api/timeclock'
import { listLoans, getMyPeriodLoanDeduction } from '../../api/loans'
import { listPaychecks } from '../../api/paychecks'
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '../../api/push'
import { getDailyMileage } from '../../api/gps'
import PayPieChart from '../../components/ui/PayPieChart'
import { getTimeOffRequests, createTimeOffRequest, reviewTimeOffRequest } from '../../api/timeoff'
import { formatCurrency, formatHours, formatDate, formatTime } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks, differenceInCalendarDays, parseISO } from 'date-fns'

const buildPeriods = (t) => Array.from({ length: 4 }, (_, i) => {
  const now = new Date()
  const start = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
  const end   = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
  return {
    label: i === 0 ? t('pay.thisWeek') : i === 1 ? t('pay.lastWeek') : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
    start: format(start, 'yyyy-MM-dd'),
    end:   format(end,   'yyyy-MM-dd'),
  }
})

export default function MyPay() {
  const { t } = useTranslation()
  const periods = buildPeriods(t)

  const [selectedPeriod, setSelectedPeriod] = useState(0)
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [entries, setEntries]     = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [tab, setTab]             = useState('pay')

  const [corrModal, setCorrModal]   = useState(null)
  const [corrStart, setCorrStart]   = useState('')
  const [corrEnd, setCorrEnd]       = useState('')
  const [corrReason, setCorrReason] = useState('')
  const [corrSaving, setCorrSaving] = useState(false)
  const [corrError, setCorrError]   = useState('')

  const [myLoans, setMyLoans]           = useState([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [periodLoanDed, setPeriodLoanDed] = useState(0)

  const [timeOffRequests, setTimeOffRequests] = useState([])
  const [toModal, setToModal]       = useState(false)
  const [toType, setToType]         = useState('vacation')
  const [toStart, setToStart]       = useState('')
  const [toEnd, setToEnd]           = useState('')
  const [toReason, setToReason]     = useState('')
  const [toSaving, setToSaving]     = useState(false)
  const [toError, setToError]       = useState('')

  // Paycheck status + push notifications
  const [paychecks,   setPaychecks]   = useState([])
  const [pushSub,     setPushSub]     = useState(null)
  const [pushLoading, setPushLoading] = useState(false)

  // Mileage
  const [todayMiles, setTodayMiles] = useState(null)

  const p = periods[selectedPeriod]

  const loadTimeOff = () =>
    getTimeOffRequests().catch(() => ({ requests: [] })).then(d => setTimeOffRequests(d.requests ?? []))

  const loadLoans = () => {
    setLoadingLoans(true)
    listLoans().catch(() => ({ loans: [] })).then(d => setMyLoans(d.loans ?? [])).finally(() => setLoadingLoans(false))
  }

  const togglePush = async () => {
    setPushLoading(true)
    try {
      if (pushSub) { await unsubscribeFromPush(); setPushSub(null) }
      else { const sub = await subscribeToPush(); setPushSub(sub) }
    } catch {}
    setPushLoading(false)
  }

  useEffect(() => {
    listPaychecks().then((d) => setPaychecks(d.paychecks ?? [])).catch(() => {})
    getCurrentSubscription().then(setPushSub).catch(() => {})
    getDailyMileage().then((d) => setTodayMiles(d.daily_miles ?? 0)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getMyPay({ start: p.start, end: p.end }).catch(() => null),
      getEntries({ start: p.start, end: p.end }).catch(() => ({ entries: [] })),
      getChangeRequests().catch(() => ({ requests: [] })),
      getTimeOffRequests().catch(() => ({ requests: [] })),
      getMyPeriodLoanDeduction(p.start, p.end).catch(() => 0),
    ]).then(([pay, ent, reqs, toReqs, loanDed]) => {
      setData(pay)
      setEntries(ent?.entries ?? [])
      setMyRequests(reqs?.requests ?? [])
      setTimeOffRequests(toReqs?.requests ?? [])
      setPeriodLoanDed(loanDed ?? 0)
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod])

  useEffect(() => { if (tab === 'loans') loadLoans() }, [tab])

  const openCorrection = (entry) => {
    setCorrModal(entry)
    setCorrStart(entry.start_time ? entry.start_time.slice(0, 16) : '')
    setCorrEnd(entry.end_time   ? entry.end_time.slice(0, 16)   : '')
    setCorrReason('')
    setCorrError('')
  }

  const handleSubmitCorrection = async () => {
    if (!corrReason.trim()) { setCorrError(t('pay.correction.reasonRequired')); return }
    if (!corrStart && !corrEnd) { setCorrError(t('pay.correction.timeRequired')); return }
    setCorrSaving(true)
    setCorrError('')
    try {
      await createChangeRequest({
        entry_id: corrModal.id,
        requested_start: corrStart || null,
        requested_end:   corrEnd   || null,
        reason: corrReason,
      })
      setCorrModal(null)
      const reqs = await getChangeRequests().catch(() => ({ requests: [] }))
      setMyRequests(reqs.requests ?? [])
    } catch (err) {
      setCorrError(err?.response?.data?.error ?? t('pay.correction.submitError'))
    } finally { setCorrSaving(false) }
  }

  const handleSubmitTimeOff = async () => {
    if (!toStart || !toEnd) { setToError('Start and end dates are required.'); return }
    if (toEnd < toStart)    { setToError('End date must be after start date.'); return }
    setToSaving(true); setToError('')
    try {
      await createTimeOffRequest({ type: toType, start_date: toStart, end_date: toEnd, reason: toReason.trim() || null })
      setToModal(false); setToStart(''); setToEnd(''); setToReason(''); setToType('vacation')
      loadTimeOff()
    } catch (err) {
      setToError(err?.response?.data?.error ?? t('timeoff.submitError'))
    } finally { setToSaving(false) }
  }

  const handleCancelTimeOff = async (id) => {
    await reviewTimeOffRequest({ id, action: 'cancel' }).catch(() => null)
    loadTimeOff()
  }

  const TABS = [
    ['pay', t('pay.tabs.summary')],
    ['log', t('pay.tabs.log')],
    ['requests', t('pay.tabs.requests')],
    ['timeoff', t('timeoff.title')],
    ['loans', t('nav.loans')],
  ]

  return (
    <div className="px-4 pt-6 pb-6 flex flex-col gap-4 w-full">
      <h1 className="text-xl font-bold text-gray-900">{t('pay.title')}</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {periods.map((per, i) => (
          <button key={i} onClick={() => setSelectedPeriod(i)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              selectedPeriod === i ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}>
            {per.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {tab === 'pay' && (
            <>
              {/* ── Paycheck status ── */}
              {(() => {
                const latest = paychecks[0] ?? null
                const statusCfg = {
                  processing: { label: t('pay.paycheck.processing'), color: 'text-amber-700 bg-amber-50 border-amber-200' },
                  available:  { label: t('pay.paycheck.available'),  color: 'text-green-700 bg-green-50 border-green-200'  },
                  picked_up:  { label: t('pay.paycheck.pickedUp'),   color: 'text-gray-600  bg-gray-50  border-gray-200'   },
                }
                const cfg = latest ? (statusCfg[latest.status] ?? statusCfg.processing) : null
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base font-semibold text-gray-900">{t('pay.paycheck.title')}</h2>
                      <button
                        onClick={togglePush}
                        disabled={pushLoading}
                        title={pushSub ? t('pay.paycheck.notificationsOn') : t('pay.paycheck.enableNotifications')}
                        className={`p-2 rounded-xl transition-colors ${pushSub ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        <svg viewBox="0 0 24 24" fill={pushSub ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </button>
                    </div>
                    {!latest
                      ? <p className="text-sm text-gray-400">{t('pay.paycheck.none')}</p>
                      : (
                        <div className="space-y-3">
                          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${cfg.color}`}>
                            <div>
                              <p className="text-sm font-semibold">{cfg.label}</p>
                              <p className="text-xs opacity-70 mt-0.5">
                                {formatDate(latest.period_start)} – {formatDate(latest.period_end)}
                                {latest.amount ? ` · ${formatCurrency(parseFloat(latest.amount))}` : ''}
                              </p>
                              {latest.notes && <p className="text-xs opacity-60 mt-0.5">{latest.notes}</p>}
                            </div>
                            {latest.status === 'available' && (
                              <span className="text-2xl" title={t('pay.paycheck.available')}>🎉</span>
                            )}
                          </div>
                          {paychecks.length > 1 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('pay.paycheck.history')}</p>
                              <div className="space-y-1.5">
                                {paychecks.slice(1, 5).map((pc) => {
                                  const c = statusCfg[pc.status] ?? statusCfg.processing
                                  return (
                                    <div key={pc.id} className="flex items-center justify-between text-sm text-gray-600">
                                      <span>{formatDate(pc.period_start)} – {formatDate(pc.period_end)}</span>
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }
                  </div>
                )
              })()}

              {!data
                ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.noData')}</p>
                : (() => {
                    const gasAdj   = data.adjustments?.filter((a) => a.type === 'gas_allowance').reduce((s, a) => s + parseFloat(a.amount), 0) ?? 0
                    const bonusAdj = data.adjustments?.filter((a) => a.type !== 'gas_allowance').reduce((s, a) => s + parseFloat(a.amount), 0) ?? 0
                    const gas      = (data.gas_total ?? 0) + gasAdj
                    const isSalary = data.pay_structure === 'salary'
                    const isW2     = data.pay_type === 'w2'
                    const rate     = data.user?.pay_rate ?? 0
                    const otRate   = data.user?.overtime_rate ?? 0
                    return (
                      <>
                        {/* ── Stat cards ── */}
                      <div className="grid grid-cols-2 gap-2">
                        <StatsCard compact
                          label={t('pay.todayHours')}
                          value={formatHours(data.today_hours ?? 0)}
                          icon={ClockIcon}
                          color="blue"
                        />
                        <StatsCard compact
                          label={selectedPeriod === 0 ? t('pay.weekHours') : t('pay.approvedHours')}
                          value={formatHours(data.approved_hours ?? 0)}
                          icon={CalendarIcon}
                          color="indigo"
                        />
                        <StatsCard compact
                          label={t('pay.rate')}
                          value={isSalary ? formatCurrency(rate) : `${formatCurrency(rate)}/hr`}
                          icon={RateIcon}
                          color="purple"
                        />
                        <StatsCard compact
                          label={t('pay.estimatedGross')}
                          value={formatCurrency(data.estimated_total ?? 0)}
                          icon={GrossIcon}
                          color="green"
                        />
                        {todayMiles !== null && (
                          <StatsCard compact
                            label={t('pay.todayMiles')}
                            value={`${todayMiles.toFixed(1)} mi`}
                            icon={MileageIcon}
                            color="sky"
                          />
                        )}
                      </div>

                      {/* ── Pie chart ── */}
                      {(data.estimated_total ?? 0) > 0 && (
                        <Card title={t('pay.breakdown')}>
                          <PayPieChart
                            base={data.base_gross ?? 0}
                            gas={gas}
                            bonus={bonusAdj}
                            loan={periodLoanDed}
                            compact
                          />
                        </Card>
                      )}

                      {/* ── Breakdown detail ── */}
                      <Card title={t('pay.breakdownDetail')}>
                        <div className="flex flex-col gap-3">
                          {isSalary
                            ? <Row label={t('pay.weeklyRate')} value={formatCurrency(rate)} />
                            : <>
                                <Row label={`${t('pay.regularHours')} (${formatHours(data.regular_hours ?? 0)})`} value={formatCurrency((data.regular_hours ?? 0) * rate)} />
                                {(data.overtime_hours ?? 0) > 0 && (
                                  <Row label={`${t('pay.overtimeHours')} (${formatHours(data.overtime_hours ?? 0)})`} value={formatCurrency((data.overtime_hours ?? 0) * (otRate || rate * 1.5))} accent />
                                )}
                              </>
                          }
                          {gas > 0 && <Row label={t('pay.gasAllowance')} value={formatCurrency(gas)} />}
                          {data.adjustments?.filter((a) => a.type !== 'gas_allowance').map((adj, i) => (
                            <Row key={i}
                              label={adj.type.replace(/_/g,' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                              value={formatCurrency(adj.amount)}
                              note={adj.description}
                            />
                          ))}
                          {periodLoanDed > 0 && (
                            <Row label={t('pay.loanDeduction')} value={`−${formatCurrency(periodLoanDed)}`} accent />
                          )}
                          <div className="border-t border-gray-100 pt-3 mt-1">
                            <Row label={t('pay.estimatedTotal')} value={formatCurrency(data.estimated_total ?? 0)} bold />
                          </div>
                        </div>
                      </Card>

                      {isW2  && <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-700">{t('pay.w2Notice')}</div>}
                      {!isW2 && <div className="bg-blue-50  rounded-xl px-4 py-3 text-sm text-blue-700" >{t('pay.1099Notice')}</div>}
                    </>
                  )
                })()}
            </>
          )}

          {tab === 'log' && (
            entries.length === 0
              ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.noEntries')}</p>
              : <div className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const hasRequest = myRequests.some((r) => String(r.entry_id) === String(entry.id) && r.status === 'pending')
                    return (
                      <div key={entry.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400">{formatDate(entry.start_time)}</p>
                          <p className="text-sm font-medium text-gray-900 capitalize">{entry.status_label?.replace('_',' ')}</p>
                          <p className="text-xs text-gray-500">
                            {formatTime(entry.start_time)} → {entry.end_time ? formatTime(entry.end_time) : <span className="text-orange-500">{t('pay.inProgress')}</span>}
                            {entry.job_name && ` · ${entry.job_name}`}
                          </p>
                        </div>
                        {entry.end_time && (
                          hasRequest
                            ? <span className="text-xs text-amber-600 font-medium shrink-0">{t('pay.pendingReview')}</span>
                            : <Button size="sm" variant="secondary" onClick={() => openCorrection(entry)}>
                                {t('pay.requestCorrection')}
                              </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
          )}

          {tab === 'requests' && (
            myRequests.length === 0
              ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.noRequests')}</p>
              : <div className="flex flex-col gap-2">
                  {myRequests.map((req) => (
                    <div key={req.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900">{formatDate(req.entry_start)}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          req.status === 'pending'  ? 'bg-amber-100 text-amber-700'  :
                          req.status === 'approved' ? 'bg-green-100 text-green-700'  :
                                                      'bg-red-100 text-red-700'
                        }`}>{t(`pay.status.${req.status}`)}</span>
                      </div>
                      <p className="text-xs text-gray-500">{req.reason}</p>
                      {req.review_note && <p className="text-xs text-gray-400 mt-1">{t('pay.adminNote')}: {req.review_note}</p>}
                    </div>
                  ))}
                </div>
          )}

          {tab === 'loans' && (
            loadingLoans
              ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
              : myLoans.length === 0
                ? <p className="text-center text-gray-400 py-12 text-sm">No active loans on record.</p>
                : <div className="flex flex-col gap-3">
                    {myLoans.map((loan) => {
                      const pct = loan.amount > 0 ? Math.min((loan.paid_total / loan.amount) * 100, 100) : 0
                      const isPaidOff = loan.status === 'paid_off'
                      return (
                        <div key={loan.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900">{formatCurrency(loan.amount)} Loan</span>
                                {isPaidOff
                                  ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Paid Off</span>
                                  : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Active</span>}
                              </div>
                              {loan.description && <p className="text-xs text-gray-500 mt-0.5">{loan.description}</p>}
                              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                                <div className={`h-1.5 rounded-full ${isPaidOff ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-gray-400">Remaining</p>
                              <p className={`text-lg font-bold ${isPaidOff ? 'text-green-600' : 'text-gray-900'}`}>
                                {isPaidOff ? formatCurrency(0) : formatCurrency(loan.remaining)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(loan.paid_total)} paid</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <p className="text-xs text-center text-gray-400 mt-1">Loan deductions are processed each paycheck by your administrator.</p>
                  </div>
          )}

          {tab === 'timeoff' && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <Button onClick={() => { setToModal(true); setToError('') }}>{t('timeoff.request')}</Button>
              </div>
              {timeOffRequests.length === 0
                ? <p className="text-center text-gray-400 py-12 text-sm">{t('timeoff.noRequests')}</p>
                : timeOffRequests.map((req) => {
                    const days = differenceInCalendarDays(parseISO(req.end_date), parseISO(req.start_date)) + 1
                    return (
                      <div key={req.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{t(`timeoff.types.${req.type}`)}</span>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-500">{days} {days === 1 ? 'day' : 'days'}</span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            req.status === 'pending'  ? 'bg-amber-100 text-amber-700'  :
                            req.status === 'approved' ? 'bg-green-100 text-green-700'  :
                                                        'bg-red-100 text-red-700'
                          }`}>{t(`timeoff.status.${req.status}`)}</span>
                        </div>
                        <p className="text-xs text-gray-500">{format(parseISO(req.start_date), 'MMM d')} – {format(parseISO(req.end_date), 'MMM d, yyyy')}</p>
                        {req.reason && <p className="text-xs text-gray-400 mt-1">{req.reason}</p>}
                        {req.admin_note && <p className="text-xs text-gray-400 mt-1 italic">{t('timeoff.adminNote')}: {req.admin_note}</p>}
                        {req.status === 'pending' && (
                          <button onClick={() => handleCancelTimeOff(req.id)}
                            className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                            {t('timeoff.cancel')}
                          </button>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          )}
        </>
      )}

      <Modal isOpen={toModal} onClose={() => setToModal(false)} title={t('timeoff.request')}>
        <div className="flex flex-col gap-4">
          {/* Type */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {['vacation','sick','personal','unpaid'].map(type => (
                <button key={type} onClick={() => setToType(type)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${toType === type
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  {t(`timeoff.types.${type}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('timeoff.startDate')}</label>
              <input type="date" value={toStart} onChange={e => setToStart(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('timeoff.endDate')}</label>
              <input type="date" value={toEnd} onChange={e => setToEnd(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('timeoff.reason')}</label>
            <textarea rows={2} value={toReason} onChange={e => setToReason(e.target.value)}
              placeholder={t('timeoff.reasonPlaceholder')}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none" />
          </div>
          {toError && <p className="text-sm text-red-600">{toError}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setToModal(false)}>{t('common.cancel')}</Button>
            <Button fullWidth loading={toSaving} onClick={handleSubmitTimeOff}>{t('timeoff.submit')}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!corrModal} onClose={() => setCorrModal(null)} title={t('pay.correction.title')}>
        {corrModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600">
              <p className="font-medium mb-1">{t('pay.correction.originalEntry')}</p>
              <p>{t('pay.correction.start')}: {formatDate(corrModal.start_time)} {formatTime(corrModal.start_time)}</p>
              {corrModal.end_time && <p>{t('pay.correction.end')}: {formatDate(corrModal.end_time)} {formatTime(corrModal.end_time)}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t('pay.correction.correctedStart')}</label>
              <input type="datetime-local" value={corrStart} onChange={(e) => setCorrStart(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t('pay.correction.correctedEnd')}</label>
              <input type="datetime-local" value={corrEnd} onChange={(e) => setCorrEnd(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t('pay.correction.reason')} *</label>
              <textarea
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none"
                rows={3} placeholder={t('pay.correction.reasonPlaceholder')}
                value={corrReason} onChange={(e) => setCorrReason(e.target.value)}
              />
            </div>
            {corrError && <p className="text-sm text-red-600">{corrError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setCorrModal(null)}>{t('common.cancel')}</Button>
              <Button fullWidth loading={corrSaving} onClick={handleSubmitCorrection}>{t('pay.correction.submit')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const MileageIcon = <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 4"/></svg>
const ClockIcon  = <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>
const CalendarIcon = <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>
const RateIcon   = <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 .9-4 2s1.79 2 4 2 4 .9 4 2-1.79 2-4 2m0-8v1m0 9v1"/><circle cx="12" cy="12" r="9"/></svg>
const GrossIcon  = <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M2 10h20M6 15h4M14 15h4"/></svg>

function Row({ label, value, accent, bold, note }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className={`text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</span>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <span className={`text-sm font-semibold ${bold ? 'text-gray-900' : accent ? 'text-amber-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}
