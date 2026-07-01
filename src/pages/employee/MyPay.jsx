import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { getMyPay } from '../../api/payroll'
import { getEntries, createChangeRequest, getChangeRequests } from '../../api/timeclock'
import { formatCurrency, formatHours, formatDate, formatTime } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'

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

  const p = periods[selectedPeriod]

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getMyPay({ start: p.start, end: p.end }).catch(() => null),
      getEntries({ start: p.start, end: p.end }).catch(() => ({ entries: [] })),
      getChangeRequests().catch(() => ({ requests: [] })),
    ]).then(([pay, ent, reqs]) => {
      setData(pay)
      setEntries(ent?.entries ?? [])
      setMyRequests(reqs?.requests ?? [])
    }).finally(() => setLoading(false))
  }, [selectedPeriod])

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

  const TABS = [
    ['pay', t('pay.tabs.summary')],
    ['log', t('pay.tabs.log')],
    ['requests', t('pay.tabs.requests')],
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

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {tab === 'pay' && (
            !data
              ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.noData')}</p>
              : <>
                  <Card title={t('pay.hoursSummary')}>
                    <div className="flex flex-col gap-3">
                      <Row label={t('pay.approvedHours')} value={formatHours(data.approved_hours ?? 0)} />
                      {data.pay_type === 'w2' && <>
                        <Row label={t('pay.regularHours')} value={formatHours(data.regular_hours ?? 0)} />
                        {(data.overtime_hours ?? 0) > 0 && <Row label={t('pay.overtimeHours')} value={formatHours(data.overtime_hours)} accent />}
                      </>}
                    </div>
                  </Card>
                  <Card title={t('pay.breakdown')}>
                    <div className="flex flex-col gap-3">
                      <Row label={t('pay.basePay')} value={formatCurrency(data.base_pay ?? 0)} />
                      {(data.gas_allowance ?? 0) > 0 && <Row label={t('pay.gasAllowance')} value={formatCurrency(data.gas_allowance)} />}
                      {data.adjustments?.map((adj, i) => (
                        <Row key={i}
                          label={adj.type.replace('_',' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                          value={formatCurrency(adj.amount)} note={adj.description} />
                      ))}
                      <div className="border-t border-gray-100 pt-3 mt-1">
                        <Row label={t('pay.estimatedTotal')} value={formatCurrency(data.estimated_total ?? 0)} bold />
                      </div>
                    </div>
                  </Card>
                  {data.pay_type === 'w2' && <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-700">{t('pay.w2Notice')}</div>}
                  {data.pay_type === '1099' && <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">{t('pay.1099Notice')}</div>}
                </>
          )}

          {tab === 'log' && (
            entries.length === 0
              ? <p className="text-center text-gray-400 py-12 text-sm">{t('pay.noEntries')}</p>
              : <div className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const hasRequest = myRequests.some((r) => r.entry_id == entry.id && r.status === 'pending')
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
        </>
      )}

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
