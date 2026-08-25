import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { getMyPay } from '../../api/payroll'
import { getEntries, createChangeRequest, getChangeRequests } from '../../api/timeclock'
import { listMyLoans, getMyPeriodLoanDeduction } from '../../api/loans'
import { listPaychecks } from '../../api/paychecks'
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '../../api/push'
import PayPieChart from '../../components/ui/PayPieChart'
import { getTimeOffRequests, createTimeOffRequest, reviewTimeOffRequest } from '../../api/timeoff'
import { formatCurrency, formatHours, formatDate, formatTime } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks, differenceInCalendarDays, parseISO, eachDayOfInterval } from 'date-fns'
import { es as esLocale, enUS } from 'date-fns/locale'
import i18n from '../../i18n'

// Module-level (buildPeriods runs outside the component) — reads the current
// language fresh each call so weekday/month names follow the app's language
// instead of always rendering in English.
const dfLocale = () => (i18n.language?.startsWith('es') ? esLocale : enUS)

const buildPeriods = (t) => Array.from({ length: 4 }, (_, i) => {
  const w     = i + 1 // start from last week, skip current week
  const now   = new Date()
  const start = startOfWeek(subWeeks(now, w), { weekStartsOn: 1 })
  const end   = endOfWeek(subWeeks(now, w), { weekStartsOn: 1 })
  return {
    label: i === 0 ? t('pay.lastWeek') : `${format(start, 'MMM d', { locale: dfLocale() })} – ${format(end, 'MMM d', { locale: dfLocale() })}`,
    start: format(start, 'yyyy-MM-dd'),
    end:   format(end,   'yyyy-MM-dd'),
  }
})

export default function MyPay() {
  const { t } = useTranslation()
  const periods = buildPeriods(t)

  const [selectedPeriod, setSelectedPeriod] = useState(0)
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false)
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
  const [detailSheet, setDetailSheet] = useState(null)
  const [corrStep, setCorrStep]       = useState(1)
  const [corrType, setCorrType]       = useState('')

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
  const [paycheckHistoryOpen, setPaycheckHistoryOpen] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const rootRef = useRef(null)
  const paycheckCardRef = useRef(null)
  const breakdownCardRef = useRef(null)

  // Same pattern as Today's Activity on the Clock page: expanding scrolls
  // the card comfortably into view, collapsing scrolls back up to the top.
  const toggleSection = (setOpen, cardRef) => {
    setOpen((wasOpen) => {
      const next = !wasOpen
      requestAnimationFrame(() => {
        if (next) {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        } else {
          rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
      return next
    })
  }

  const p = periods[selectedPeriod]

  const loadTimeOff = () =>
    getTimeOffRequests().catch(() => ({ requests: [] })).then(d => setTimeOffRequests(d.requests ?? []))

  const loadLoans = () => {
    setLoadingLoans(true)
    listMyLoans().catch(() => ({ loans: [] })).then(d => setMyLoans(d.loans ?? [])).finally(() => setLoadingLoans(false))
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
    // Fetched eagerly (not just when the Loans tab is opened) so we know
    // up-front whether to show that tab at all.
    loadLoans()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCorrStep(1)
    setCorrType('')
    setCorrStart(entry.start_time ? entry.start_time.slice(0, 16) : '')
    setCorrEnd(entry.end_time   ? entry.end_time.slice(0, 16)   : '')
    setCorrReason('')
    setCorrError('')
  }

  const handleSubmitCorrection = async () => {
    if (!corrReason.trim()) { setCorrError(t('pay.correctionModal.errors.reasonRequired')); return }
    if ((corrType === 'start' || corrType === 'both') && !corrStart) { setCorrError(t('pay.correctionModal.errors.startRequired')); return }
    if ((corrType === 'end'   || corrType === 'both') && !corrEnd)   { setCorrError(t('pay.correctionModal.errors.endRequired')); return }
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
    if (!toStart || !toEnd) { setToError(t('timeoff.errors.datesRequired')); return }
    if (toEnd < toStart)    { setToError(t('timeoff.errors.endBeforeStart')); return }
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
    // Only shown to employees who actually have a loan on record.
    ...(myLoans.length > 0 ? [['loans', t('nav.loans')]] : []),
  ]

  return (
    <div ref={rootRef} className="flex flex-col gap-4 w-full scroll-mt-4">
      <h1 className="text-xl font-bold text-gray-900">{t('pay.title')}</h1>

      <button onClick={() => setPeriodSheetOpen(true)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-white border border-gray-200 active:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            {CalendarIcon}
          </span>
          <span className="text-sm font-semibold text-gray-900 truncate">{periods[selectedPeriod]?.label}</span>
        </span>
        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      <div className="relative">
        <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1 overflow-x-auto scrollbar-hide snap-x snap-proximity">
          {TABS.map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)}
              className={`basis-1/4 shrink-0 snap-start flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-semibold text-center leading-tight transition-colors ${tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
              {TAB_ICONS[val]}
              {label}
            </button>
          ))}
        </div>
        {/* Only hints at more to scroll when Loans (the 5th tab) is present */}
        {TABS.length > 4 && (
          <div className="pointer-events-none absolute right-1 top-1 bottom-1 w-8 bg-gradient-to-l from-gray-100 to-transparent rounded-r-xl" />
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {tab === 'pay' && (
            <>
              {/* ── Paycheck status — compact; history tucked behind a tap ── */}
              {(() => {
                const latest = paychecks[0] ?? null
                const statusCfg = {
                  processing: { label: t('pay.paycheck.processing'), color: 'text-amber-700 bg-amber-50 border-amber-200' },
                  available:  { label: t('pay.paycheck.available'),  color: 'text-green-700 bg-green-50 border-green-200'  },
                  picked_up:  { label: t('pay.paycheck.pickedUp'),   color: 'text-gray-600  bg-gray-50  border-gray-200'   },
                  voided:     { label: t('pay.paycheck.voided'),     color: 'text-red-700   bg-red-50   border-red-200'   },
                }
                const cfg = latest ? (statusCfg[latest.status] ?? statusCfg.processing) : null
                const hasHistory = paychecks.length > 1
                return (
                  <div ref={paycheckCardRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-16 scroll-mb-36">
                    <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
                      <h2 className="text-sm font-semibold text-gray-900">{t('pay.paycheck.title')}</h2>
                      <button
                        onClick={togglePush}
                        disabled={pushLoading}
                        title={pushSub ? t('pay.paycheck.notificationsOn') : t('pay.paycheck.enableNotifications')}
                        className={`p-1.5 rounded-lg transition-colors ${pushSub ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        <svg viewBox="0 0 24 24" fill={pushSub ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </button>
                    </div>
                    {!latest
                      ? <p className="text-sm text-gray-400 px-4 pb-4">{t('pay.paycheck.none')}</p>
                      : (
                        <>
                          <button
                            onClick={() => hasHistory && toggleSection(setPaycheckHistoryOpen, paycheckCardRef)}
                            disabled={!hasHistory}
                            className="w-full flex items-center gap-2 px-4 pb-4 text-left disabled:cursor-default">
                            <div className={`flex-1 flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${cfg.color}`}>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{cfg.label}</p>
                                <p className="text-xs opacity-70 mt-0.5 truncate">
                                  {formatDate(latest.period_start)} – {formatDate(latest.period_end)}
                                  {latest.amount ? ` · ${formatCurrency(parseFloat(latest.amount))}` : ''}
                                </p>
                              </div>
                              {latest.status === 'available' && (
                                <span className="text-xl shrink-0 ml-2" title={t('pay.paycheck.available')}>🎉</span>
                              )}
                            </div>
                            {hasHistory && (
                              <svg className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${paycheckHistoryOpen ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                              </svg>
                            )}
                          </button>
                          {paycheckHistoryOpen && hasHistory && (
                            <div className="px-4 pb-4 border-t border-gray-50 pt-3">
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
                        </>
                      )
                    }
                  </div>
                )
              })()}

              {!data
                ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.noData')}</p>
                : (() => {
                    // data.gas_total is already the sum of gas_allowance adjustments
                    // (computed server-side in my-pay.php) — do not re-add them here,
                    // that was double-counting the gas allowance.
                    const bonusAdj = data.adjustments?.filter((a) => a.type !== 'gas_allowance').reduce((s, a) => s + parseFloat(a.amount), 0) ?? 0
                    const gas      = data.gas_total ?? 0
                    const isSalary = data.pay_structure === 'salary'
                    const isW2     = data.pay_type === 'w2'
                    const rate     = data.pay_rate ?? 0
                    return (
                      <>
                        {/* ── Stats — one card, 4 cells, no per-item chrome ── */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                            {[
                              [t('pay.todayHours'), formatHours(data.today_hours ?? 0), ClockIcon, 'bg-blue-50 text-blue-600'],
                              [selectedPeriod === 0 ? t('pay.weekHours') : t('pay.approvedHours'), formatHours(data.approved_hours ?? 0), CalendarIcon, 'bg-indigo-50 text-indigo-600'],
                              [t('pay.rate'), isSalary ? formatCurrency(rate) : `${formatCurrency(rate)}/hr`, RateIcon, 'bg-purple-50 text-purple-600'],
                              [t('pay.estimatedGross'), formatCurrency(data.estimated_total ?? 0), GrossIcon, 'bg-green-50 text-green-600'],
                            ].map(([label, value, icon, colorCls], i) => (
                              <div key={i} className="flex items-center gap-2.5 min-w-0">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorCls}`}>
                                  {icon}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{label}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ── Pie chart — always visible in the main view (only the
                            itemized dollar breakdown below is collapsible) ── */}
                        {(data.estimated_total ?? 0) > 0 && (
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <PayPieChart
                              base={data.base_gross ?? 0}
                              gas={gas}
                              bonus={bonusAdj}
                              loan={periodLoanDed}
                              compact
                            />
                          </div>
                        )}

                        {/* ── Pay Breakdown — collapsed by default, same pattern as
                            Today's Activity on the Clock page ── */}
                        <div ref={breakdownCardRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-16 scroll-mb-36">
                          <button onClick={() => toggleSection(setBreakdownOpen, breakdownCardRef)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-9 h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                                {GrossIcon}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{t('pay.breakdown')}</p>
                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                  {t('pay.estimatedTotal')} · {formatCurrency(data.estimated_total ?? 0)}
                                </p>
                              </div>
                            </div>
                            <svg className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${breakdownOpen ? 'rotate-180' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                            </svg>
                          </button>
                          {breakdownOpen && (
                            <div className="px-4 pb-4 border-t border-gray-50 pt-3 flex flex-col gap-4">
                              <div className="flex flex-col gap-3">
                                {isSalary
                                  ? <Row label={t('pay.weeklyRate')} value={formatCurrency(rate)} />
                                  : (() => {
                                      // This company pays no overtime — every hour is the
                                      // same rate (see my-pay.php) — so hours are shown as
                                      // one combined total, not split into a separate
                                      // Overtime row that would imply a premium that
                                      // doesn't exist.
                                      const totalHours = (data.regular_hours ?? 0) + (data.overtime_hours ?? 0)
                                      return <Row label={`${t('pay.regularHours')} (${formatHours(totalHours)})`} value={formatCurrency(totalHours * rate)} />
                                    })()
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
                              {isW2  && <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-700">{t('pay.w2Notice')}</div>}
                              {!isW2 && <div className="bg-blue-50  rounded-xl px-4 py-3 text-sm text-blue-700" >{t('pay.1099Notice')}</div>}
                            </div>
                          )}
                        </div>
                      </>
                    )
                  })()}
            </>
          )}

          {tab === 'log' && (() => {
            // Always walk every calendar day of the period, Monday through
            // Sunday, so days with nothing logged still show as a (dulled)
            // placeholder instead of just vanishing from the list.
            const days = eachDayOfInterval({ start: parseISO(p.start), end: parseISO(p.end) })
            const byDate = {}
            entries
              .filter((e) => e.cost_category !== 'day_end') // internal marker, not a real shift
              .forEach((e) => {
                const key = e.start_time.slice(0, 10)
                ;(byDate[key] ??= []).push(e)
              })
            Object.values(byDate).forEach((list) => list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)))

            return (
              <div className="flex flex-col gap-5">
                {days.map((day) => {
                  const key = format(day, 'yyyy-MM-dd')
                  const dayEntries = byDate[key] ?? []
                  const hasEntries = dayEntries.length > 0
                  return (
                    <div key={key}>
                      <div className={`flex items-baseline gap-2 px-1 pb-2 mb-2 border-b ${hasEntries ? 'border-gray-200' : 'border-gray-100'}`}>
                        <p className={`text-sm font-bold ${hasEntries ? 'text-gray-900' : 'text-gray-400'}`}>
                          {format(day, 'EEEE', { locale: dfLocale() })}
                        </p>
                        <p className={`text-xs font-medium ${hasEntries ? 'text-green-600' : 'text-gray-400'}`}>
                          {format(day, 'MMM d, yyyy', { locale: dfLocale() })}
                        </p>
                      </div>
                      {hasEntries && (
                        <div className="flex flex-col gap-2">
                          {dayEntries.map((entry) => {
                            const hasRequest = myRequests.some((r) => String(r.entry_id) === String(entry.id) && r.status === 'pending')
                            const dot = ENTRY_DOT[entry.status_label] ?? 'bg-gray-400'
                            const isOpen = !entry.end_time
                            return (
                              <button key={entry.id} onClick={() => setDetailSheet(entry)}
                                className={`w-full text-left bg-white rounded-xl border px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors ${isOpen ? 'border-orange-200' : 'border-gray-100'}`}>
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot} ${isOpen ? 'animate-pulse' : ''}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 capitalize">{entry.status_label?.replace('_',' ')}</p>
                                  <p className="text-xs text-gray-500">
                                    {formatTime(entry.start_time)} → {isOpen ? <span className="text-orange-500 font-medium">{t('pay.inProgress')}</span> : formatTime(entry.end_time)}
                                    {entry.job_name && ` · ${entry.job_name}`}
                                  </p>
                                </div>
                                {hasRequest && <span className="text-xs text-amber-600 font-medium shrink-0">{t('pay.pendingReview')}</span>}
                                <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

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
                ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.loans.noLoans')}</p>
                : <div className="flex flex-col gap-3">
                    {myLoans.map((loan) => {
                      const pct = loan.amount > 0 ? Math.min((loan.paid_total / loan.amount) * 100, 100) : 0
                      const isPaidOff = loan.status === 'paid_off'
                      return (
                        <div key={loan.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900">{formatCurrency(loan.amount)} {t('pay.loans.loan')}</span>
                                {isPaidOff
                                  ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">{t('pay.loans.paidOff')}</span>
                                  : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{t('pay.loans.active')}</span>}
                              </div>
                              {loan.description && <p className="text-xs text-gray-500 mt-0.5">{loan.description}</p>}
                              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                                <div className={`h-1.5 rounded-full ${isPaidOff ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-gray-400">{t('pay.loans.remaining')}</p>
                              <p className={`text-lg font-bold ${isPaidOff ? 'text-green-600' : 'text-gray-900'}`}>
                                {isPaidOff ? formatCurrency(0) : formatCurrency(loan.remaining)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{t('pay.loans.paidAmount', { amount: formatCurrency(loan.paid_total) })}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <p className="text-xs text-center text-gray-400 mt-1">{t('pay.loans.deductionNotice')}</p>
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
                            <span className="text-xs text-gray-500">{t('timeoff.days', { count: days })}</span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            req.status === 'pending'  ? 'bg-amber-100 text-amber-700'  :
                            req.status === 'approved' ? 'bg-green-100 text-green-700'  :
                                                        'bg-red-100 text-red-700'
                          }`}>{t(`timeoff.status.${req.status}`)}</span>
                        </div>
                        <p className="text-xs text-gray-500">{format(parseISO(req.start_date), 'MMM d', { locale: dfLocale() })} – {format(parseISO(req.end_date), 'MMM d, yyyy', { locale: dfLocale() })}</p>
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('timeoff.type')}</label>
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

      {/* ── Shift detail bottom sheet ───────────────────────────── */}
      {detailSheet && (() => {
        const e = detailSheet
        const hasReq = myRequests.some(r => String(r.entry_id) === String(e.id) && r.status === 'pending')
        const cfg = ENTRY_CFG[e.status_label] ?? ENTRY_CFG.done
        const durMs = e.end_time ? new Date(e.end_time) - new Date(e.start_time) : 0
        const durMins = Math.round(durMs / 60000)
        const dh = Math.floor(durMins / 60)
        const dm = durMins % 60
        return (
          <div className="fixed inset-0 z-[1100] flex flex-col justify-end" onClick={() => setDetailSheet(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden" onClick={ev => ev.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
              <div className="px-5 pt-3 pb-6 flex flex-col gap-4">
                {/* Status + date */}
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.text}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className="capitalize">{e.status_label?.replace('_', ' ')}</span>
                  </span>
                  <p className="text-sm text-gray-400 font-medium">{formatDate(e.start_time)}</p>
                </div>
                {/* Time block */}
                <div className="bg-gray-50 rounded-2xl px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">{t('pay.detail.clockIn')}</p>
                      <p className="text-2xl font-bold text-gray-900">{formatTime(e.start_time)}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">{t('pay.detail.clockOut')}</p>
                      <p className={`text-2xl font-bold ${e.end_time ? 'text-gray-900' : 'text-orange-400'}`}>
                        {e.end_time ? formatTime(e.end_time) : t('pay.inProgress')}
                      </p>
                    </div>
                  </div>
                  {durMs > 0 && (
                    <div className="border-t border-gray-200 pt-3 mt-3 text-center">
                      <p className="text-sm font-semibold text-gray-600">
                        {t('pay.detail.total', { time: dh > 0 ? `${dh}h ${dm}m` : `${dm}m` })}
                      </p>
                    </div>
                  )}
                </div>
                {/* Job */}
                {e.job_name && (
                  <div className="flex items-center gap-2 px-1">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    <p className="text-sm font-medium text-gray-700">{e.job_name}</p>
                  </div>
                )}
                {/* CTA */}
                {e.end_time && (
                  hasReq
                    ? <div className="bg-amber-50 rounded-2xl px-4 py-3.5 text-center">
                        <p className="text-sm font-semibold text-amber-700">{t('pay.detail.modificationPending')}</p>
                        <p className="text-xs text-amber-500 mt-0.5">{t('pay.detail.adminReviewing')}</p>
                      </div>
                    : <button onClick={() => { setDetailSheet(null); openCorrection(e) }}
                        className="w-full bg-brand-500 text-white font-semibold py-3.5 rounded-2xl text-sm active:bg-brand-600 transition-colors">
                        {t('pay.detail.requestModification')}
                      </button>
                )}
              </div>
              <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        )
      })()}

      {/* ── Modification request questionnaire ─────────────────── */}
      <Modal isOpen={!!corrModal} onClose={() => setCorrModal(null)} title={t('pay.detail.requestModification')}>
        {corrModal && (
          <div className="flex flex-col gap-4">
            {/* Entry summary strip */}
            <div className={`rounded-xl px-4 py-3 ${(ENTRY_CFG[corrModal.status_label] ?? ENTRY_CFG.done).bg}`}>
              <p className={`text-sm font-semibold capitalize ${(ENTRY_CFG[corrModal.status_label] ?? ENTRY_CFG.done).text}`}>
                {corrModal.status_label?.replace('_', ' ')} · {formatDate(corrModal.start_time)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatTime(corrModal.start_time)} → {corrModal.end_time ? formatTime(corrModal.end_time) : t('pay.inProgress')}
                {corrModal.job_name && ` · ${corrModal.job_name}`}
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {[1, 2].map(s => (
                <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= corrStep ? 'bg-brand-500' : 'bg-gray-200'}`} />
              ))}
            </div>

            {corrStep === 1 && (
              <>
                <p className="text-sm font-semibold text-gray-800">{t('pay.correctionModal.whatNeedsCorrection')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {CORR_TYPES.map(opt => (
                    <button key={opt.value} onClick={() => setCorrType(opt.value)}
                      className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border-2 text-sm font-semibold transition-colors text-left
                        ${corrType === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 active:border-gray-300 bg-white'}`}>
                      <span className="text-base">{opt.icon}</span>
                      <span className="leading-tight">{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" fullWidth onClick={() => setCorrModal(null)}>{t('common.cancel')}</Button>
                  <Button fullWidth disabled={!corrType} onClick={() => setCorrStep(2)}>{t('pay.correctionModal.next')}</Button>
                </div>
              </>
            )}

            {corrStep === 2 && (
              <>
                {(corrType === 'start' || corrType === 'both') && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('pay.correctionModal.correctClockIn')}</label>
                    <input type="datetime-local" value={corrStart} onChange={e => setCorrStart(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
                  </div>
                )}
                {(corrType === 'end' || corrType === 'both') && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('pay.correctionModal.correctClockOut')}</label>
                    <input type="datetime-local" value={corrEnd} onChange={e => setCorrEnd(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {corrType === 'job'   ? t('pay.correctionModal.jobSiteQuestion') :
                     corrType === 'other' ? t('pay.correctionModal.describeChange') :
                     t('pay.correctionModal.whyNeeded')}
                    {' *'}
                  </label>
                  <textarea rows={3} value={corrReason} onChange={e => setCorrReason(e.target.value)}
                    placeholder={
                      corrType === 'job'   ? t('pay.correctionModal.jobSitePlaceholder') :
                      corrType === 'other' ? t('pay.correctionModal.otherPlaceholder') :
                      t('pay.correctionModal.reasonPlaceholder')
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none" />
                </div>
                {corrError && <p className="text-sm text-red-600">{corrError}</p>}
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" fullWidth onClick={() => setCorrStep(1)}>{t('pay.correctionModal.back')}</Button>
                  <Button fullWidth loading={corrSaving} onClick={handleSubmitCorrection}>{t('pay.correctionModal.submit')}</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Period picker — bottom sheet ─────────────────────── */}
      {periodSheetOpen && (
        <div className="fixed inset-0 z-[1100] flex flex-col justify-end" onClick={() => setPeriodSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-t-3xl overflow-hidden" onClick={ev => ev.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
            <p className="text-center text-sm font-bold text-gray-900 pt-1 pb-3">{t('pay.selectPeriod')}</p>
            <div className="flex flex-col divide-y divide-gray-50 pb-2">
              {periods.map((per, i) => (
                <button key={i}
                  onClick={() => { setSelectedPeriod(i); setPeriodSheetOpen(false) }}
                  className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left active:bg-gray-50 transition-colors ${
                    selectedPeriod === i ? 'bg-brand-50' : ''
                  }`}>
                  <span className={`text-sm font-semibold ${selectedPeriod === i ? 'text-brand-700' : 'text-gray-800'}`}>
                    {per.label}
                  </span>
                  {selectedPeriod === i && (
                    <svg className="w-5 h-5 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
          </div>
        </div>
      )}

      {/* Extra trailing room so the last card's expanded content (e.g. Pay
          Breakdown) can scroll fully clear of the fixed bottom nav — the
          page-level bottom padding alone isn't enough once a card near the
          end of the page grows taller. */}
      <div className="h-24 shrink-0" />
    </div>
  )
}

const ENTRY_DOT = {
  working: 'bg-green-500', lunch: 'bg-amber-500',
  material_run: 'bg-violet-500', waiting: 'bg-orange-500', done: 'bg-gray-400',
}
const ENTRY_CFG = {
  working:      { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700'  },
  lunch:        { dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700'  },
  material_run: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' },
  waiting:      { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' },
  done:         { dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-500'   },
}
const CORR_TYPES = [
  { value: 'start', icon: '🕐', labelKey: 'pay.correctionModal.types.start' },
  { value: 'end',   icon: '🕑', labelKey: 'pay.correctionModal.types.end' },
  { value: 'both',  icon: '⏱', labelKey: 'pay.correctionModal.types.both' },
  { value: 'job',   icon: '📍', labelKey: 'pay.correctionModal.types.job' },
  { value: 'other', icon: '💬', labelKey: 'pay.correctionModal.types.other' },
]

// Icons for the sub-tab tiles (Pay Summary / Time Log / My Requests / Time
// Off / Loans) — sized smaller (w-5 h-5) than the shared w-6 h-6 set below,
// which is used in the roomier stat cards.
const TAB_ICONS = {
  pay: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M2 10h20M6 15h4M14 15h4"/></svg>,
  log: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>,
  requests: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z"/><rect x="5" y="6" width="14" height="15" rx="1.5" strokeLinecap="round" strokeLinejoin="round"/><path strokeLinecap="round" d="M9 12l2 2 4-4"/></svg>,
  timeoff: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>,
  loans: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10l9-6 9 6M4 10v9M20 10v9M8 10v9M16 10v9M2 19h20"/></svg>,
}

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
