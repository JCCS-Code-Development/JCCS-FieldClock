import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { listChecks, updateCheck, voidCheck, previewNetAmountFix, applyNetAmountFix } from '../../api/checks'
import { formatCurrency } from '../../utils/format'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

const STATUS_META = {
  issued:               { label: 'Issued',           color: 'bg-blue-100 text-blue-700'    },
  processed_online:     { label: 'Processed Online',  color: 'bg-green-100 text-green-700'  },
  processed_in_person:  { label: 'Processed In Person', color: 'bg-emerald-100 text-emerald-700' },
  voided:               { label: 'Voided',            color: 'bg-red-100 text-red-700'      },
}

const STATUS_OPTIONS = [
  { value: 'issued',              label: 'Issued' },
  { value: 'processed_online',    label: 'Processed Online' },
  { value: 'processed_in_person', label: 'Processed In Person' },
  { value: 'voided',              label: 'Void This Check' },
]

const TABS = [
  { value: '',                    label: 'All'        },
  { value: 'issued',              label: 'Issued'     },
  { value: 'processed_online',    label: 'Online'     },
  { value: 'processed_in_person', label: 'In Person'  },
  { value: 'voided',              label: 'Voided'     },
]

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${m.color}`}>
      {m.label}
    </span>
  )
}

function UpdateModal({ check, onClose, onSaved }) {
  const [status, setStatus] = useState(check.status)
  const [notes, setNotes]   = useState(check.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await updateCheck({ id: check.id, status, notes })
      onSaved(res.check)
      onClose()
    } catch {
      setError('Failed to update. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{check.payee_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Check #{check.check_number} · {formatCurrency(parseFloat(check.amount))}
          </p>
          <p className="text-xs text-gray-400">
            {check.pay_period_start} – {check.pay_period_end} · Issued {check.issued_date}
          </p>
        </div>
        <StatusBadge status={check.status} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Update Status</label>
        <div className="grid grid-cols-1 gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setStatus(opt.value)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-sm font-medium text-left transition-colors
                ${status === opt.value
                  ? opt.value === 'voided' ? 'border-red-400 bg-red-50 text-red-700' : 'border-brand-400 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors
                ${status === opt.value
                  ? opt.value === 'voided' ? 'border-red-500 bg-red-500' : 'border-brand-500 bg-brand-500'
                  : 'border-gray-300'}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="e.g. deposited at Chase branch on Main St"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 resize-none outline-none focus:border-brand-400 transition-colors" />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors
            ${status === 'voided' ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-500 hover:bg-brand-600'}
            disabled:opacity-50`}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function NetFixModal({ onClose, onApplied }) {
  const [loading, setLoading] = useState(true)
  const [corrections, setCorrections] = useState([])
  const [totalDelta, setTotalDelta] = useState(0)
  const [error, setError]     = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(null) // null | { applied, total_delta }

  useEffect(() => {
    previewNetAmountFix()
      .then(res => {
        setCorrections(res.corrections ?? [])
        setTotalDelta(res.total_delta ?? 0)
      })
      .catch(() => setError('Failed to load preview. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const handleApply = async () => {
    setApplying(true)
    setError('')
    try {
      const res = await applyNetAmountFix()
      setApplied(res)
      onApplied()
    } catch {
      setError('Failed to apply corrections. Please try again.')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Spinner size="lg" /></div>
  }

  if (applied) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
          Corrected {applied.applied} check{applied.applied === 1 ? '' : 's'}
          {applied.applied > 0 && <> — total reduced by {formatCurrency(applied.total_delta)}</>}.
        </div>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Finds 1099 checks where a loan deduction applied that period but the registered amount
        still shows the pre-deduction (gross) figure instead of what the check actually paid.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {corrections.length === 0
        ? <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">No corrections needed — everything already matches.</p>
        : (
          <>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-gray-500 uppercase tracking-wide text-[10px]">
                    <th className="text-left px-3 py-2">Check #</th>
                    <th className="text-left px-3 py-2">Payee</th>
                    <th className="text-right px-3 py-2">Old</th>
                    <th className="text-right px-3 py-2">Loan Ded.</th>
                    <th className="text-right px-3 py-2">New</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map(c => (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-semibold text-gray-900">#{c.check_number}</td>
                      <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{c.payee_name}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(c.old_amount)}</td>
                      <td className="px-3 py-2 text-right text-red-500">−{formatCurrency(c.loan_deduction)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(c.new_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              {corrections.length} check{corrections.length === 1 ? '' : 's'} · total reduction {formatCurrency(totalDelta)}
            </p>
          </>
        )
      }

      <div className="flex gap-2 pt-1">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          {corrections.length === 0 ? 'Close' : 'Cancel'}
        </button>
        {corrections.length > 0 && (
          <button onClick={handleApply} disabled={applying}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {applying ? 'Applying…' : `Apply ${corrections.length} Correction${corrections.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  )
}

export default function CheckRegistry() {
  const [checks, setChecks]   = useState([])
  const [counts, setCounts]   = useState({ total: 0, issued: 0, voided: 0, processed_online: 0, processed_in_person: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('')
  const [search, setSearch]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [selected, setSelected] = useState(null)
  const [netFixOpen, setNetFixOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (tab)      params.status    = tab
      if (search)   params.search    = search
      if (dateFrom) params.date_from = dateFrom
      if (dateTo)   params.date_to   = dateTo
      const data = await listChecks(params)
      setChecks(data.checks ?? [])
      setCounts(data.counts ?? counts)
    } catch {}
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const handleSaved = (updated) => {
    setChecks(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    load()
  }

  const formatPeriod = (start, end) => {
    try {
      return `${format(new Date(start + 'T12:00'), 'MMM d')} – ${format(new Date(end + 'T12:00'), 'MMM d, yyyy')}`
    } catch { return `${start} – ${end}` }
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Check Registry</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and update check status</p>
        </div>
        <button onClick={() => setNetFixOpen(true)}
          className="text-xs font-semibold text-brand-600 border border-brand-200 rounded-full px-3.5 py-2 hover:bg-brand-50 transition-colors whitespace-nowrap">
          Fix Historical Net Amounts
        </button>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: 'issued',              label: 'Issued',       color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { key: 'processed_online',    label: 'Online',       color: 'text-green-600',   bg: 'bg-green-50'   },
          { key: 'processed_in_person', label: 'In Person',    color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { key: 'voided',              label: 'Voided',       color: 'text-red-600',     bg: 'bg-red-50'     },
        ].map(s => (
          <button key={s.key} onClick={() => setTab(s.key === tab ? '' : s.key)}
            className={`rounded-2xl border-2 p-3 text-left transition-colors
              ${tab === s.key ? `${s.bg} border-current ${s.color}` : 'bg-white border-gray-100 text-gray-700 hover:border-gray-200'}`}>
            <p className={`text-2xl font-bold ${tab === s.key ? s.color : 'text-gray-900'}`}>{counts[s.key] ?? 0}</p>
            <p className="text-xs font-medium text-gray-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search check # or payee name…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400 transition-colors"
        />
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors
                ${tab === t.value
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600'}`}>
              {t.label}
              {t.value === '' && counts.total > 0 && <span className="ml-1 opacity-60">{counts.total}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-colors" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400 transition-colors" />
        </div>
      </div>

      {/* List */}
      {loading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : checks.length === 0
          ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm font-medium">No checks found</p>
              <p className="text-xs mt-1">Checks are registered when printing payroll</p>
            </div>
          )
          : (
            <div className="flex flex-col gap-2">
              {checks.map(check => (
                <button key={check.id} onClick={() => setSelected(check)}
                  className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3 text-left hover:border-brand-200 hover:shadow-sm transition-all">
                  {/* Check number */}
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Check</p>
                    <p className="text-base font-bold text-gray-900 leading-tight">#{check.check_number}</p>
                  </div>
                  <div className="w-px self-stretch bg-gray-100 shrink-0" />
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{check.payee_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatPeriod(check.pay_period_start, check.pay_period_end)}</p>
                    {check.notes && <p className="text-xs text-gray-400 italic truncate mt-0.5">{check.notes}</p>}
                  </div>
                  {/* Amount + status */}
                  <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(parseFloat(check.amount))}</p>
                    <StatusBadge status={check.status} />
                  </div>
                </button>
              ))}
            </div>
          )
      }

      {/* Update modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)}
        title={selected ? `Check #${selected.check_number}` : ''}>
        {selected && (
          <UpdateModal
            check={selected}
            onClose={() => setSelected(null)}
            onSaved={handleSaved}
          />
        )}
      </Modal>

      {/* Net-pay correction modal */}
      <Modal isOpen={netFixOpen} onClose={() => setNetFixOpen(false)} title="Fix Historical Net Amounts">
        {netFixOpen && (
          <NetFixModal
            onClose={() => setNetFixOpen(false)}
            onApplied={load}
          />
        )}
      </Modal>
    </div>
  )
}
