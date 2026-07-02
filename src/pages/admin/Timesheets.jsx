import { useState, useEffect, useMemo } from 'react'
import { format, parseISO, differenceInMinutes, differenceInCalendarDays, startOfWeek, endOfWeek, addWeeks, isSameYear } from 'date-fns'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import {
  getEntries, getChangeRequests, reviewChangeRequest,
  adminCreateEntry, adminUpdateEntry, adminDeleteEntry,
} from '../../api/timeclock'
import { getTimeOffRequests, reviewTimeOffRequest } from '../../api/timeoff'
import { listEmployees } from '../../api/employees'
import { formatTime } from '../../utils/format'

const STATUS_OPTIONS = [
  { value: 'working',      label: 'Working' },
  { value: 'lunch',        label: 'Lunch' },
  { value: 'material_run', label: 'Material Run' },
  { value: 'waiting',      label: 'Waiting' },
  { value: 'traveling',    label: 'Traveling' },
  { value: 'done',         label: 'Day End' },
]

const STATUS_COLORS = {
  working:      'bg-green-100 text-green-700',
  lunch:        'bg-amber-100 text-amber-700',
  material_run: 'bg-violet-100 text-violet-700',
  waiting:      'bg-orange-100 text-orange-700',
  traveling:    'bg-sky-100 text-sky-700',
  done:         'bg-gray-100 text-gray-500',
}

const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
)
const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>
)
const PlusIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
  </svg>
)
const GasIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h13v12H3zM16 8l2-2 2 2v9a1 1 0 01-1 1h-2a1 1 0 01-1-1V8z"/>
    <path strokeLinecap="round" d="M7 6V4M10 6V4"/>
  </svg>
)

function fmtDur(mins) {
  if (mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function entryMins(entry) {
  if (!entry.end_time) return 0
  return Math.max(0, differenceInMinutes(new Date(entry.end_time), new Date(entry.start_time)))
}

function totalMins(entries) {
  return entries
    .filter(e => e.cost_category !== 'day_end')
    .reduce((s, e) => s + entryMins(e), 0)
}

function groupByDay(entries) {
  const map = {}
  for (const e of entries) {
    const day = format(new Date(e.start_time), 'yyyy-MM-dd')
    if (!map[day]) map[day] = []
    map[day].push(e)
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
}

// ── Entry edit / create modal ────────────────────────────────────
function EntryModal({ entry, defaultDate, userId, onSave, onClose }) {
  const isNew = !entry?.id
  const toLocal = (dt) => dt ? format(new Date(dt), "yyyy-MM-dd'T'HH:mm") : ''

  const [statusLabel, setStatusLabel] = useState(entry?.status_label ?? 'working')
  const [startTime,   setStartTime]   = useState(isNew ? (defaultDate ? defaultDate + 'T08:00' : '') : toLocal(entry.start_time))
  const [endTime,     setEndTime]     = useState(isNew ? (defaultDate ? defaultDate + 'T17:00' : '') : toLocal(entry.end_time))
  const [notes,       setNotes]       = useState(entry?.notes ?? '')
  const [error,       setError]       = useState('')
  const [saving,      setSaving]      = useState(false)

  const handleSave = async () => {
    if (!startTime) { setError('Start time is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        status_label: statusLabel,
        start_time:   startTime.replace('T', ' ') + ':00',
        end_time:     endTime ? endTime.replace('T', ' ') + ':00' : null,
        notes:        notes.trim() || null,
      }
      await onSave(isNew ? { ...payload, user_id: userId } : { ...payload, id: entry.id })
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Type</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setStatusLabel(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${statusLabel === opt.value
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Clock In</label>
          <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Clock Out</label>
          <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
          Adjustment Comment
        </label>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Reason for adjustment (e.g. Employee forgot to clock out)"
          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-1">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={saving} onClick={handleSave}>{isNew ? 'Add Entry' : 'Save Changes'}</Button>
      </div>
    </div>
  )
}

// ── Day group ────────────────────────────────────────────────────
function DayGroup({ day, entries, onEdit, onDelete, onAdd }) {
  const dayMins  = totalMins(entries)
  const dayLabel = format(parseISO(day), 'EEEE, MMMM d')

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-900">{dayLabel}</p>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${dayMins > 0 ? 'text-brand-600' : 'text-gray-400'}`}>
            {fmtDur(dayMins)} total
          </span>
          <button onClick={() => onAdd(day)}
            className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 font-semibold transition-colors bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg">
            <PlusIcon /> Add
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Type</th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Location</th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Start</th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">End</th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-16">Hrs</th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Comment</th>
              <th className="px-4 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map(entry => {
              const mins    = entryMins(entry)
              const isDayEnd = entry.cost_category === 'day_end'
              const loc     = entry.job_name ?? (entry.notes?.startsWith('Location:') ? entry.notes.replace('Location: ', '') : null)
              const comment = entry.notes?.startsWith('Adjustment:') ? entry.notes.replace('Adjustment: ', '')
                            : entry.notes?.startsWith('Location:')   ? ''
                            : (entry.notes ?? '')

              return (
                <tr key={entry.id} className={`group ${isDayEnd ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_COLORS[entry.status_label] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_OPTIONS.find(o => o.value === entry.status_label)?.label ?? entry.status_label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[140px] truncate">{loc || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">{formatTime(entry.start_time)}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {entry.end_time
                      ? <span className="text-gray-700 font-mono">{formatTime(entry.end_time)}</span>
                      : <span className="text-orange-500 font-medium">Active</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">{isDayEnd ? '—' : fmtDur(mins)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[180px] truncate" title={comment}>
                    {comment || <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(entry)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                        <EditIcon />
                      </button>
                      <button onClick={() => onDelete(entry.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Change requests panel ────────────────────────────────────────
function ChangeRequestsPanel({ requests, onReview, loading }) {
  const [modal,   setModal]   = useState(null)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const handleReview = async (action) => {
    setSaving(true)
    try { await onReview({ request_id: modal.id, action, note }); setModal(null); setNote('') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (requests.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center py-16">
      <p className="text-gray-400 text-sm">No pending change requests.</p>
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-2">
        {requests.map(req => (
          <div key={req.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-gray-900">{req.employee_name}</p>
                <span className="text-xs text-gray-400">{format(new Date(req.entry_start), 'MMM d, h:mm a')}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{req.reason}</p>
            </div>
            <Button size="sm" onClick={() => { setModal(req); setNote('') }}>Review</Button>
          </div>
        ))}
      </div>

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title="Review Time Change Request">
        {modal && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm flex flex-col gap-1.5">
              <p><span className="font-medium text-gray-600">Employee:</span> {modal.employee_name}</p>
              <p><span className="font-medium text-gray-600">Original:</span> {format(new Date(modal.entry_start), 'MMM d h:mm a')} → {modal.entry_end ? format(new Date(modal.entry_end), 'h:mm a') : 'open'}</p>
              {modal.requested_start && <p><span className="font-medium text-gray-600">New start:</span> {format(new Date(modal.requested_start), 'MMM d h:mm a')}</p>}
              {modal.requested_end   && <p><span className="font-medium text-gray-600">New end:</span> {format(new Date(modal.requested_end), 'h:mm a')}</p>}
              <p><span className="font-medium text-gray-600">Reason:</span> {modal.reason}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Admin Note (optional)</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Verified with employee"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
              <Button variant="danger" fullWidth loading={saving} onClick={() => handleReview('reject')}>Reject</Button>
              <Button fullWidth loading={saving} onClick={() => handleReview('approve')}>Approve</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function useWeek(offset) {
  const base  = addWeeks(new Date(), offset)
  const start = startOfWeek(base, { weekStartsOn: 1 })
  const end   = endOfWeek(base,   { weekStartsOn: 1 })
  const from  = format(start, 'yyyy-MM-dd')
  const to    = format(end,   'yyyy-MM-dd')

  let label
  if (offset === 0)       label = 'This Week'
  else if (offset === -1) label = 'Last Week'
  else {
    const yr = isSameYear(start, new Date()) ? '' : `, ${format(start, 'yyyy')}`
    label = `${format(start, 'MMM d')} – ${format(end, 'MMM d')}${yr}`
  }

  return { from, to, label, start, end }
}

// ── Main page ────────────────────────────────────────────────────
export default function AdminTimesheets() {
  const [employees,   setEmployees]   = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [entries,     setEntries]     = useState([])
  const [requests,      setRequests]      = useState([])
  const [timeOffReqs,   setTimeOffReqs]   = useState([])
  const [loadingTO,     setLoadingTO]     = useState(false)
  const [toReviewModal, setToReviewModal] = useState(null)
  const [toNote,        setToNote]        = useState('')
  const [toReviewing,   setToReviewing]   = useState(false)
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [tab,           setTab]           = useState('log')
  const { from: dateFrom, to: dateTo, label: weekLabel } = useWeek(weekOffset)
  const [loadingEnt,  setLoadingEnt]  = useState(false)
  const [loadingReq,  setLoadingReq]  = useState(false)
  const [editModal,   setEditModal]   = useState(null)
  const [addDate,     setAddDate]     = useState(null)
  const [deleteId,    setDeleteId]    = useState(null)
  const [deleting,    setDeleting]    = useState(false)

  useEffect(() => {
    listEmployees().then(d => {
      const emps = d.employees ?? []
      setEmployees(emps)
      if (emps.length > 0) setSelectedEmp(emps[0])
    })
    loadRequests()
    loadTimeOff()
  }, [])

  const loadRequests = () => {
    setLoadingReq(true)
    getChangeRequests({ status: 'pending' })
      .then(d => setRequests(d.requests ?? []))
      .finally(() => setLoadingReq(false))
  }

  const loadTimeOff = () => {
    setLoadingTO(true)
    getTimeOffRequests().then(d => setTimeOffReqs(d.requests ?? [])).finally(() => setLoadingTO(false))
  }

  const handleTimeOffReview = async (action) => {
    setToReviewing(true)
    try {
      await reviewTimeOffRequest({ id: toReviewModal.id, action, admin_note: toNote.trim() || null })
      setToReviewModal(null); setToNote('')
      loadTimeOff()
    } finally { setToReviewing(false) }
  }

  const loadEntries = (empId, from, to) => {
    if (!empId) return
    setLoadingEnt(true)
    getEntries({ user_id: empId, start: from, end: to })
      .then(d => setEntries(d.entries ?? []))
      .finally(() => setLoadingEnt(false))
  }

  useEffect(() => {
    if (selectedEmp) loadEntries(selectedEmp.id, dateFrom, dateTo)
  }, [selectedEmp, dateFrom, dateTo])

  const dayGroups  = useMemo(() => groupByDay(entries), [entries])
  const periodMins = useMemo(() => totalMins(entries), [entries])
  const grossEst   = selectedEmp ? ((periodMins / 60) * (selectedEmp.pay_rate ?? 0)).toFixed(2) : '0.00'
  const hasGas     = selectedEmp?.gas_weekly_allowance != null && parseFloat(selectedEmp.gas_weekly_allowance) > 0
  const pendingCount = requests.length

  const handleSave = async (payload) => {
    if (payload.id) await adminUpdateEntry(payload)
    else await adminCreateEntry(payload)
    loadEntries(selectedEmp.id, dateFrom, dateTo)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await adminDeleteEntry(deleteId); setDeleteId(null); loadEntries(selectedEmp.id, dateFrom, dateTo) }
    finally { setDeleting(false) }
  }

  const handleReview = async (data) => {
    await reviewChangeRequest(data)
    loadRequests()
  }

  return (
    <div className="flex gap-4 items-start w-full">

      {/* ── Employee list ────────────────────────────────────── */}
      <aside className="w-52 shrink-0 sticky top-0 max-h-[calc(100vh-120px)] bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Employees</p>
        </div>
        <div className="overflow-y-auto py-1">
          {employees.map(emp => (
            <button key={emp.id} onClick={() => setSelectedEmp(emp)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors ${
                selectedEmp?.id === emp.id ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'
              }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                selectedEmp?.id === emp.id ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {emp.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight truncate">{emp.name}</p>
                <p className="text-xs text-gray-400 capitalize">{emp.pay_type}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Timesheet detail ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {!selectedEmp ? (
          <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center py-24">
            <p className="text-gray-400 text-sm">Select an employee to view timesheets</p>
          </div>
        ) : (
          <>
            {/* Employee header */}
            <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{selectedEmp.name}</h2>
                <p className="text-xs text-gray-400 capitalize">{selectedEmp.pay_type} · {selectedEmp.role}</p>
              </div>
              <div className="flex flex-wrap gap-5">
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Period Hours</p>
                  <p className="text-xl font-bold text-gray-900">{(periodMins / 60).toFixed(1)}h</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Pay Rate</p>
                  <p className="text-xl font-bold text-gray-900">${selectedEmp.pay_rate ?? 0}/hr</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Gross Est.</p>
                  <p className="text-xl font-bold text-green-600">${grossEst}</p>
                </div>
                {hasGas && (
                  <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl text-xs font-semibold self-center">
                    <GasIcon /> Gas ${selectedEmp.gas_weekly_allowance}/wk
                  </div>
                )}
              </div>
            </div>

            {/* Week navigator + tabs */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setWeekOffset(w => w - 1)}
                  className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors text-sm font-medium">‹</button>
                <span className="px-3 py-2 text-sm font-semibold text-gray-900 min-w-[160px] text-center border-x border-gray-200">
                  {weekLabel}
                </span>
                <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${weekOffset < 0 ? 'text-gray-500 hover:bg-gray-50' : 'text-gray-300 cursor-default'}`}
                  disabled={weekOffset >= 0}>›</button>
              </div>
              <span className="text-xs text-gray-400">{dateFrom} – {dateTo}</span>
              <div className="flex-1" />
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                <button onClick={() => setTab('log')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === 'log' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Time Log
                </button>
                <button onClick={() => setTab('changes')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${tab === 'changes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Change Requests
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{pendingCount}</span>
                  )}
                </button>
                <button onClick={() => setTab('timeoff')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${tab === 'timeoff' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Time Off
                  {timeOffReqs.filter(r => r.status === 'pending').length > 0 && (
                    <span className="bg-amber-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {timeOffReqs.filter(r => r.status === 'pending').length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Time log */}
            {tab === 'log' && (
              loadingEnt
                ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
                : dayGroups.length === 0
                  ? <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center py-16">
                      <div className="text-center">
                        <p className="text-gray-400 text-sm mb-3">No entries for this period</p>
                        <Button size="sm" onClick={() => setAddDate(dateTo)}>Add Entry</Button>
                      </div>
                    </div>
                  : <div className="flex flex-col gap-3">
                      {dayGroups.map(([day, dayEntries]) => (
                        <DayGroup key={day} day={day} entries={dayEntries}
                          onEdit={setEditModal} onDelete={setDeleteId} onAdd={setAddDate} />
                      ))}
                    </div>
            )}

            {/* Change requests */}
            {tab === 'changes' && (
              <ChangeRequestsPanel requests={requests} onReview={handleReview} loading={loadingReq} />
            )}

            {/* Time off requests */}
            {tab === 'timeoff' && (
              loadingTO
                ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
                : timeOffReqs.length === 0
                  ? <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center py-16">
                      <p className="text-gray-400 text-sm">No time off requests.</p>
                    </div>
                  : <div className="flex flex-col gap-2">
                      {timeOffReqs.map(req => {
                        const days = differenceInCalendarDays(parseISO(req.end_date), parseISO(req.start_date)) + 1
                        return (
                          <div key={req.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <p className="text-sm font-semibold text-gray-900">{req.employee_name}</p>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs font-semibold text-gray-600 capitalize">{req.type.replace('_',' ')}</span>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-500">{days} {days === 1 ? 'day' : 'days'}</span>
                              </div>
                              <p className="text-xs text-gray-500">{format(parseISO(req.start_date), 'MMM d')} – {format(parseISO(req.end_date), 'MMM d, yyyy')}</p>
                              {req.reason && <p className="text-xs text-gray-400 mt-0.5">{req.reason}</p>}
                              {req.admin_note && <p className="text-xs text-gray-400 italic mt-0.5">Note: {req.admin_note}</p>}
                            </div>
                            <div className="shrink-0">
                              {req.status === 'pending'
                                ? <Button size="sm" onClick={() => { setToReviewModal(req); setToNote('') }}>Review</Button>
                                : <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                    req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                                  }`}>{req.status === 'approved' ? 'Approved' : 'Denied'}</span>
                              }
                            </div>
                          </div>
                        )
                      })}
                    </div>
            )}
          </>
        )}
      </div>

      {/* Time off review modal */}
      <Modal isOpen={!!toReviewModal} onClose={() => setToReviewModal(null)} title="Review Time Off Request">
        {toReviewModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm flex flex-col gap-1.5">
              <p><span className="font-medium text-gray-600">Employee:</span> {toReviewModal.employee_name}</p>
              <p><span className="font-medium text-gray-600">Type:</span> <span className="capitalize">{toReviewModal.type.replace('_',' ')}</span></p>
              <p><span className="font-medium text-gray-600">Dates:</span> {format(parseISO(toReviewModal.start_date), 'MMM d')} – {format(parseISO(toReviewModal.end_date), 'MMM d, yyyy')}</p>
              {toReviewModal.reason && <p><span className="font-medium text-gray-600">Reason:</span> {toReviewModal.reason}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Admin Note (optional)</label>
              <input type="text" value={toNote} onChange={e => setToNote(e.target.value)}
                placeholder="e.g. Approved — enjoy your time off!"
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setToReviewModal(null)}>Cancel</Button>
              <Button variant="danger" fullWidth loading={toReviewing} onClick={() => handleTimeOffReview('reject')}>Deny</Button>
              <Button fullWidth loading={toReviewing} onClick={() => handleTimeOffReview('approve')}>Approve</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit modal */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Edit Time Entry">
        {editModal && (
          <EntryModal entry={editModal} userId={selectedEmp?.id}
            onSave={handleSave} onClose={() => setEditModal(null)} />
        )}
      </Modal>

      {/* Add modal */}
      <Modal isOpen={!!addDate} onClose={() => setAddDate(null)} title="Add Time Entry">
        {addDate && (
          <EntryModal entry={null} defaultDate={addDate} userId={selectedEmp?.id}
            onSave={handleSave} onClose={() => setAddDate(null)} />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Entry">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this entry? This cannot be undone.</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
