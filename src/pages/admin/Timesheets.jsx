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
import { listJobs } from '../../api/jobs'
import { listEstimates } from '../../api/estimates'
import { getDailyMileage } from '../../api/gps'
import { formatTime } from '../../utils/format'
import { groupJobsByCompany } from '../../utils/jobs'

const EXISTING_VISIT_OPTIONS = [
  { value: 'work_order', label: 'Work Order' },
  { value: 'estimate',   label: 'Estimate' },
]
const NEW_LOCATION_VISIT_OPTIONS = [
  { value: 'regular',          label: 'Regular' },
  { value: 'estimate_unknown', label: 'Estimate (# unknown)' },
  { value: 'add_on',           label: 'Add-On' },
  { value: 'emergency',        label: 'Emergency' },
  { value: 'warranty',         label: 'Warranty' },
]
const ESTIMATE_SUBTYPE_OPTIONS = [
  { value: 'regular',   label: 'Regular' },
  { value: 'add_on',    label: 'Add-On' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'warranty',  label: 'Warranty' },
]

const VISIT_CATEGORY_LABELS = {
  work_order: 'Work Order', estimate: 'Estimate', regular: 'Regular',
  estimate_unknown: 'Estimate (# unknown)', add_on: 'Add-On', emergency: 'Emergency', warranty: 'Warranty',
}
const VISIT_CATEGORY_COLORS = {
  work_order: 'bg-blue-100 text-blue-700', estimate: 'bg-indigo-100 text-indigo-700',
  regular: 'bg-gray-100 text-gray-600', estimate_unknown: 'bg-indigo-50 text-indigo-600',
  add_on: 'bg-purple-100 text-purple-700', emergency: 'bg-red-100 text-red-700', warranty: 'bg-teal-100 text-teal-700',
}

// Retained only to label/color entries logged before this restructure
const VISIT_TYPE_LABELS = {
  estimate: 'Estimate', emergency: 'Emergency', new_work_order: 'New WO (legacy)', warranty: 'Warranty', other: 'Other (legacy)',
}
const VISIT_TYPE_COLORS = {
  estimate: 'bg-indigo-100 text-indigo-700', emergency: 'bg-red-100 text-red-700',
  new_work_order: 'bg-blue-100 text-blue-700', warranty: 'bg-teal-100 text-teal-700', other: 'bg-gray-100 text-gray-500',
}

function describeVisit(entry) {
  if (entry.visit_category) {
    if (entry.visit_category === 'work_order') {
      return entry.work_order_number ? `WO #${entry.work_order_number}` : 'Work Order'
    }
    if (entry.visit_category === 'estimate') {
      const base = entry.estimate_number ? `Est. #${entry.estimate_number}` : 'Estimate'
      const sub  = entry.estimate_subtype && entry.estimate_subtype !== 'regular'
        ? ` · ${VISIT_CATEGORY_LABELS[entry.estimate_subtype] ?? entry.estimate_subtype}` : ''
      return base + sub
    }
    return VISIT_CATEGORY_LABELS[entry.visit_category] ?? entry.visit_category
  }
  if (entry.visit_type) {
    if (entry.visit_type === 'estimate' && entry.estimate_number) return `Est. #${entry.estimate_number}`
    return VISIT_TYPE_LABELS[entry.visit_type] ?? entry.visit_type
  }
  return null
}

function visitColor(entry) {
  if (entry.visit_category) return VISIT_CATEGORY_COLORS[entry.visit_category] ?? 'bg-gray-100 text-gray-500'
  if (entry.visit_type)     return VISIT_TYPE_COLORS[entry.visit_type] ?? 'bg-gray-100 text-gray-500'
  return 'bg-gray-100 text-gray-500'
}

const STATUS_OPTIONS = [
  { value: 'working',   label: 'Working' },
  { value: 'traveling', label: 'Traveling' },
]

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
  return Math.max(0, differenceInMinutes(new Date(entry.end_time), new Date(entry.start_time), { roundingMethod: 'round' }))
}

function totalMins(entries) {
  return entries
    .filter(e => e.cost_category !== 'day_end')
    .reduce((s, e) => s + entryMins(e), 0)
}

// ── Entry edit / create modal ────────────────────────────────────
function EntryModal({ entry, defaultDate, weekDays, userId, jobs, onSave, onClose }) {
  const isNew    = !entry?.id
  const isAnyDay = defaultDate === '__any__'

  const initDate  = isAnyDay
    ? (weekDays?.[0] ?? '')
    : (defaultDate && defaultDate !== '__any__')
      ? defaultDate
      : (entry?.start_time ? format(new Date(entry.start_time), 'yyyy-MM-dd') : '')
  const initStart = isNew ? '08:00' : (entry?.start_time ? format(new Date(entry.start_time), 'HH:mm') : '')
  const initEnd   = isNew ? '17:00' : (entry?.end_time   ? format(new Date(entry.end_time),   'HH:mm') : '')

  const [statusLabel, setStatusLabel] = useState(entry?.status_label ?? 'working')
  const [entryDate,   setEntryDate]   = useState(initDate)
  const [startTime,   setStartTime]   = useState(initStart)
  const [endTime,     setEndTime]     = useState(initEnd)
  const [jobId,       setJobId]       = useState(entry?.job_id ? String(entry.job_id) : '')
  const [notes,       setNotes]       = useState(entry?.notes ?? '')
  const [error,       setError]       = useState('')
  const [saving,      setSaving]      = useState(false)

  const [visitCategory,     setVisitCategory]     = useState(entry?.visit_category ?? '')
  const [estimateId,        setEstimateId]        = useState(entry?.estimate_id ? String(entry.estimate_id) : '')
  const [estimateSubtype,   setEstimateSubtype]   = useState(entry?.estimate_subtype ?? '')
  const [workOrderNumber,   setWorkOrderNumber]   = useState(entry?.work_order_number ?? '')
  const [engineerName,      setEngineerName]      = useState(entry?.engineer_name ?? '')
  const [visitDescription,  setVisitDescription]  = useState(entry?.visit_description ?? '')
  const [estimates,   setEstimates]   = useState([])
  const [loadingEstimates, setLoadingEstimates] = useState(false)

  const isNewLocationCategory = visitCategory && visitCategory !== 'work_order' && visitCategory !== 'estimate'

  // Fetch the selected job's estimates whenever the job changes
  useEffect(() => {
    if (!jobId) { setEstimates([]); return }
    setLoadingEstimates(true)
    listEstimates({ job_id: jobId, active: 1 })
      .then((d) => setEstimates(d.estimates ?? []))
      .catch(() => setEstimates([]))
      .finally(() => setLoadingEstimates(false))
  }, [jobId])

  const duration = useMemo(() => {
    if (!startTime || !endTime) return null
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins <= 0) return null
    const h = Math.floor(mins / 60), m = mins % 60
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
  }, [startTime, endTime])

  const handleSave = async () => {
    if (!entryDate) { setError('Please select a day.'); return }
    if (!startTime) { setError('Start time is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        status_label: statusLabel,
        start_time:   `${entryDate} ${startTime}:00`,
        end_time:     endTime ? `${entryDate} ${endTime}:00` : null,
        job_id:             jobId ? parseInt(jobId) : null,
        notes:              notes.trim() || null,
        visit_category:     visitCategory || null,
        estimate_id:        visitCategory === 'estimate' && estimateId ? parseInt(estimateId) : null,
        estimate_subtype:   visitCategory === 'estimate' ? (estimateSubtype || null) : null,
        work_order_number:  visitCategory === 'work_order' ? (workOrderNumber.trim() || null) : null,
        engineer_name:      isNewLocationCategory ? (engineerName.trim() || null) : null,
        visit_description:  isNewLocationCategory ? (visitDescription.trim() || null) : null,
      }
      await onSave(isNew ? { ...payload, user_id: userId } : { ...payload, id: entry.id })
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Day indicator / picker */}
      {isAnyDay ? (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Select Day</label>
          <div className="grid grid-cols-7 gap-1">
            {(weekDays ?? []).map(d => (
              <button key={d} onClick={() => setEntryDate(d)}
                className={`py-2 rounded-xl text-center border-2 transition-colors ${
                  entryDate === d ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600 hover:border-brand-300'
                }`}>
                <p className="text-[10px] font-bold uppercase leading-tight">{format(parseISO(d), 'EEE')}</p>
                <p className="text-sm font-bold">{format(parseISO(d), 'd')}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-brand-50 rounded-2xl px-4 py-3 text-center">
          <p className="text-xs text-brand-400 font-semibold uppercase tracking-widest mb-0.5">
            {isNew ? 'New Entry' : 'Edit Entry'}
          </p>
          <p className="text-base font-bold text-brand-900">
            {entryDate ? format(parseISO(entryDate), 'EEEE, MMMM d') : ''}
          </p>
        </div>
      )}

      {/* Entry type */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setStatusLabel(opt.value)}
              className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                statusLabel === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Clock In</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
            className="w-full rounded-2xl border-2 border-gray-200 px-3 py-3.5 text-xl font-bold text-gray-900 text-center outline-none focus:border-brand-500 transition-colors" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Clock Out</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
            className="w-full rounded-2xl border-2 border-gray-200 px-3 py-3.5 text-xl font-bold text-gray-900 text-center outline-none focus:border-brand-500 transition-colors" />
        </div>
      </div>

      {/* Duration pill */}
      {duration && (
        <div className="flex justify-center">
          <span className="bg-green-50 text-green-700 font-semibold text-sm px-5 py-1.5 rounded-full border border-green-200">
            {duration} total
          </span>
        </div>
      )}

      {/* Job */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Project / Job</label>
        <div className="relative">
          <select value={jobId} onChange={e => setJobId(e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 pr-8 text-sm outline-none focus:border-brand-500 appearance-none bg-white transition-colors">
            <option value="">— No project assigned —</option>
            {groupJobsByCompany(jobs).map(({ company, jobs: groupJobs }) => (
              <optgroup key={company} label={company}>
                {groupJobs.map(j => (
                  <option key={j.id} value={j.id}>{j.name}{j.client_name ? ` · ${j.client_name}` : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
        </div>
      </div>

      {/* Visit category */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
          Visit Category (optional) {jobId ? '' : '— new/unlisted location'}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(jobId ? EXISTING_VISIT_OPTIONS : NEW_LOCATION_VISIT_OPTIONS).map(opt => (
            <button key={opt.value}
              onClick={() => setVisitCategory(visitCategory === opt.value ? '' : opt.value)}
              className={`py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
                visitCategory === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {visitCategory === 'estimate' && (
          <>
            <div className="relative mt-2">
              <select value={estimateId} onChange={e => setEstimateId(e.target.value)}
                disabled={loadingEstimates}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 pr-8 text-sm outline-none focus:border-brand-500 appearance-none bg-white transition-colors disabled:opacity-60">
                <option value="">{loadingEstimates ? 'Loading estimates…' : '— Select an estimate —'}</option>
                {estimates.map(est => (
                  <option key={est.id} value={est.id}>#{est.estimate_number}{est.description ? ` · ${est.description}` : ''}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {ESTIMATE_SUBTYPE_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => setEstimateSubtype(opt.value)}
                  className={`py-1.5 rounded-xl text-[11px] font-semibold border-2 transition-colors ${
                    estimateSubtype === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {visitCategory === 'work_order' && (
          <input value={workOrderNumber} onChange={e => setWorkOrderNumber(e.target.value)} placeholder="Work Order #"
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-2" />
        )}

        {isNewLocationCategory && (
          <div className="flex flex-col gap-2 mt-2">
            <input value={engineerName} onChange={e => setEngineerName(e.target.value)} placeholder="Engineer"
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            <textarea rows={2} value={visitDescription} onChange={e => setVisitDescription(e.target.value)}
              placeholder={visitCategory === 'add_on' ? 'Original Estimate Description' : 'Description'}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none" />
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Adjustment Note</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Employee forgot to clock out"
          className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors" />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-3 pt-1">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={saving} onClick={handleSave}>{isNew ? 'Add Entry' : 'Save Changes'}</Button>
      </div>
    </div>
  )
}

// ── Day group ────────────────────────────────────────────────────
function DayGroup({ day, entries, miles, onEdit, onDelete, onAdd }) {
  const dayMins   = totalMins(entries)
  const dayLabel  = format(parseISO(day), 'EEEE, MMMM d')
  const isWeekend = [0, 6].includes(parseISO(day).getDay())

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden${isWeekend && entries.length === 0 ? ' opacity-60' : ''}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${isWeekend ? 'bg-gray-50/70' : 'bg-gray-50'}`}>
        <div>
          <p className="text-sm font-bold text-gray-900">{dayLabel}</p>
          {isWeekend && <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-none mt-0.5">Weekend</p>}
        </div>
        <div className="flex items-center gap-3">
          {miles > 0 && (
            <span className="text-sm font-semibold text-sky-600">{miles.toFixed(1)} mi</span>
          )}
          {dayMins > 0 && (
            <span className="text-sm font-semibold text-brand-600">{fmtDur(dayMins)} total</span>
          )}
          <button onClick={() => onAdd(day)}
            className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 font-semibold transition-colors bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg">
            <PlusIcon /> Add
          </button>
        </div>
      </div>
      {entries.length === 0 && (
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-300">No entries — tap Add to log a shift</p>
        </div>
      )}
      {entries.length > 0 && (
        <>
          {/* ── Mobile entry cards ── */}
          <div className="md:hidden divide-y divide-gray-50">
            {entries.map(entry => {
              const mins     = entryMins(entry)
              const isDayEnd = entry.cost_category === 'day_end'
              const isTravel = entry.status_label === 'traveling'
              const loc      = entry.job_name ?? (entry.notes?.startsWith('Location:') ? entry.notes.replace('Location: ', '') : null)
              const comment  = entry.notes?.startsWith('Adjustment:') ? entry.notes.replace('Adjustment: ', '')
                             : entry.notes?.startsWith('Location:')   ? ''
                             : (entry.notes ?? '')
              return (
                <div key={entry.id} className={`flex items-center gap-2.5 px-4 py-3 ${isDayEnd ? 'opacity-40' : ''}`}>
                  {isTravel && (
                    <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold shrink-0 bg-sky-100 text-sky-700">
                      Traveling
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-700">
                      {formatTime(entry.start_time)}{' → '}
                      {entry.end_time ? formatTime(entry.end_time) : <span className="text-orange-500 not-font-mono">Active</span>}
                    </p>
                    {(loc || comment) && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{loc || comment}</p>
                    )}
                    {describeVisit(entry) && (
                      <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{describeVisit(entry)}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 shrink-0 w-10 text-right">{isDayEnd ? '' : fmtDur(mins)}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => onEdit(entry)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                      <EditIcon />
                    </button>
                    <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Desktop table ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-40">Location</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Visit</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Start</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">End</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-16">Hrs</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Comment</th>
                  <th className="px-4 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map(entry => {
                  const mins     = entryMins(entry)
                  const isDayEnd = entry.cost_category === 'day_end'
                  const isTravel = entry.status_label === 'traveling'
                  const loc      = entry.job_name ?? (entry.notes?.startsWith('Location:') ? entry.notes.replace('Location: ', '') : null)
                  const comment  = entry.notes?.startsWith('Adjustment:') ? entry.notes.replace('Adjustment: ', '')
                                 : entry.notes?.startsWith('Location:')   ? ''
                                 : (entry.notes ?? '')
                  return (
                    <tr key={entry.id} className={`group ${isDayEnd ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-2.5 text-gray-600 text-xs truncate max-w-0">
                        <span className="inline-flex items-center gap-1.5">
                          {isTravel && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 bg-sky-100 text-sky-700">
                              Traveling
                            </span>
                          )}
                          <span className="truncate">{loc || <span className="text-gray-300">—</span>}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {describeVisit(entry) ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${visitColor(entry)}`}>
                            {describeVisit(entry)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 font-mono text-xs whitespace-nowrap">{formatTime(entry.start_time)}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                        {entry.end_time
                          ? <span className="text-gray-700 font-mono">{formatTime(entry.end_time)}</span>
                          : <span className="text-orange-500 font-medium">Active</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap">{isDayEnd ? '—' : fmtDur(mins)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[180px] truncate" title={comment}>
                        {comment || <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onEdit(entry)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"><EditIcon /></button>
                          <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><TrashIcon /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  const [weekMiles,   setWeekMiles]   = useState({})
  const [allJobs,     setAllJobs]     = useState([])

  useEffect(() => {
    listEmployees().then(d => {
      const emps = d.employees ?? []
      setEmployees(emps)
      if (emps.length > 0) setSelectedEmp(emps[0])
    })
    listJobs().then(d => setAllJobs(d.jobs ?? [])).catch(() => {})
    loadRequests()
    loadTimeOff()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!selectedEmp) return
    loadEntries(selectedEmp.id, dateFrom, dateTo)
    // Fetch mileage for each day in the week
    const days = []
    let d = new Date(dateFrom)
    while (d.toISOString().slice(0,10) <= dateTo) {
      days.push(d.toISOString().slice(0,10))
      d = new Date(d.getTime() + 86400000)
    }
    Promise.all(days.map(date =>
      getDailyMileage({ date, user_id: selectedEmp.id })
        .then(r => [date, r.daily_miles ?? 0])
        .catch(() => [date, 0])
    )).then(results => setWeekMiles(Object.fromEntries(results)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmp, dateFrom, dateTo])

  const weekDays = useMemo(() => {
    const days = []
    let d = parseISO(dateFrom)
    const end = parseISO(dateTo)
    while (d <= end) {
      days.push(format(d, 'yyyy-MM-dd'))
      d = new Date(d.getTime() + 86400000)
    }
    return days
  }, [dateFrom, dateTo])

  const dayEntriesMap = useMemo(() => {
    const map = {}
    for (const e of entries) {
      const day = format(new Date(e.start_time), 'yyyy-MM-dd')
      if (!map[day]) map[day] = []
      map[day].push(e)
    }
    return map
  }, [entries])
  const periodMins   = useMemo(() => totalMins(entries), [entries])
  const isSalary     = selectedEmp?.pay_structure === 'salary'
  const grossEst     = selectedEmp
    ? isSalary
      ? parseFloat(selectedEmp.pay_rate ?? 0).toFixed(2)
      : ((periodMins / 60) * (selectedEmp.pay_rate ?? 0)).toFixed(2)
    : '0.00'
  const hasGas     = selectedEmp?.gas_weekly_allowance != null && parseFloat(selectedEmp.gas_weekly_allowance) > 0
  const totalWeekMiles = Object.values(weekMiles).reduce((s, m) => s + m, 0)
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
    <div className="flex flex-col lg:flex-row gap-4 items-start w-full">

      {/* ── Employee list ────────────────────────────────────── */}
      <aside className="w-full lg:w-52 lg:shrink-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-120px)] bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Desktop: vertical scrollable list */}
        <div className="hidden lg:flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Employees</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-1">
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
                  <p className="text-xs text-gray-400 capitalize">
                    {emp.pay_structure === 'salary' ? 'Salary' : emp.pay_type}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
        {/* Mobile: horizontal chip picker */}
        <div className="lg:hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Employees</p>
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 py-2.5" style={{ scrollbarWidth: 'none' }}>
            {employees.map(emp => (
              <button key={emp.id} onClick={() => setSelectedEmp(emp)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  selectedEmp?.id === emp.id
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  selectedEmp?.id === emp.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {emp.name?.charAt(0).toUpperCase()}
                </span>
                {emp.name.split(' ')[0]}
              </button>
            ))}
          </div>
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
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 leading-tight">{selectedEmp.name}</h2>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{selectedEmp.pay_type} · {selectedEmp.role}</p>
                </div>
                {hasGas && (
                  <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl text-xs font-semibold shrink-0">
                    <GasIcon /> ${selectedEmp.gas_weekly_allowance}/wk
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Hours</p>
                  {isSalary
                    ? <p className="text-xs font-semibold text-brand-500 mt-1.5">Fixed</p>
                    : <p className="text-lg font-bold text-gray-900">{(periodMins / 60).toFixed(1)}h</p>
                  }
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Rate</p>
                  <p className="text-base font-bold text-gray-900 leading-tight">${selectedEmp.pay_rate ?? 0}</p>
                  <p className="text-[10px] text-gray-400">{isSalary ? 'per week' : 'per hour'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">{isSalary ? 'Weekly Pay' : 'Gross Est.'}</p>
                  <p className="text-lg font-bold text-green-600">${grossEst}</p>
                </div>
                {totalWeekMiles > 0 && (
                  <div className="bg-sky-50 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-[10px] text-sky-500 uppercase tracking-wide font-semibold mb-0.5">Miles</p>
                    <p className="text-lg font-bold text-sky-600">{totalWeekMiles.toFixed(1)} mi</p>
                  </div>
                )}
              </div>
            </div>

            {/* Week navigator + tabs */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl overflow-hidden self-start">
                <button onClick={() => setWeekOffset(w => w - 1)}
                  className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors text-sm font-medium">‹</button>
                <span className="px-3 py-2 text-sm font-semibold text-gray-900 min-w-[120px] text-center border-x border-gray-200">
                  {weekLabel}
                </span>
                <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${weekOffset < 0 ? 'text-gray-500 hover:bg-gray-50' : 'text-gray-300 cursor-default'}`}
                  disabled={weekOffset >= 0}>›</button>
              </div>
              <span className="text-xs text-gray-400">{dateFrom} – {dateTo}</span>
              <div className="sm:flex-1" />
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => setTab('log')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${tab === 'log' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Time Log
                </button>
                <button onClick={() => setTab('changes')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${tab === 'changes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Changes
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">{pendingCount}</span>
                  )}
                </button>
                <button onClick={() => setTab('timeoff')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${tab === 'timeoff' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
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
              isSalary
                ? <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-2xl">💼</div>
                    <p className="text-sm font-semibold text-brand-600">Fixed Salary Employee</p>
                    <p className="text-xs text-gray-400 text-center max-w-xs">
                      {selectedEmp.name} is on a fixed weekly salary of ${selectedEmp.pay_rate ?? 0}.<br />
                      Hours are not tracked for salaried employees.
                    </p>
                  </div>
                : loadingEnt
                  ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
                  : <div className="flex flex-col gap-3">
                      <button onClick={() => setAddDate('__any__')}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-brand-200 text-brand-500 font-semibold text-sm hover:bg-brand-50 hover:border-brand-300 active:bg-brand-100 transition-colors">
                        <PlusIcon /> Add Shift for Any Day
                      </button>
                      {weekDays.map(day => (
                        <DayGroup key={day} day={day} entries={dayEntriesMap[day] ?? []}
                          miles={weekMiles[day] ?? 0}
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
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)}
        title={editModal ? `Edit Entry — ${format(new Date(editModal.start_time), 'EEE, MMM d')}` : 'Edit Entry'}>
        {editModal && (
          <EntryModal entry={editModal} weekDays={weekDays} userId={selectedEmp?.id} jobs={allJobs}
            onSave={handleSave} onClose={() => setEditModal(null)} />
        )}
      </Modal>

      {/* Add modal */}
      <Modal isOpen={!!addDate} onClose={() => setAddDate(null)}
        title={addDate === '__any__' ? 'Add Shift' : addDate ? `New Entry — ${format(parseISO(addDate), 'EEE, MMM d')}` : 'Add Entry'}>
        {addDate && (
          <EntryModal entry={null} defaultDate={addDate} weekDays={weekDays} userId={selectedEmp?.id} jobs={allJobs}
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
