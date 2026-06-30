import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { getEntries } from '../../api/timeclock'
import { approveEntries, rejectEntry } from '../../api/approvals'
import { listEmployees } from '../../api/employees'
import { formatDate, formatTime, formatDuration, formatPhone } from '../../utils/format'
import { format, subDays } from 'date-fns'

const COST_LABELS = {
  travel: 'Travel', direct_labor: 'Direct Labor', paid_lunch: 'Paid Lunch',
  waiting_time: 'Waiting', material_pickup: 'Material Run',
  admin_photos: 'Admin/Photos', rework: 'Rework', day_end: 'Day End',
}

export default function AdminTimesheets() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

  const [entries, setEntries] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [dateFrom, setDateFrom] = useState(weekAgo)
  const [dateTo, setDateTo] = useState(today)
  const [selected, setSelected] = useState([])
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listEmployees().then((d) => setEmployees(d.employees ?? []))
  }, [])

  const load = () => {
    setLoading(true)
    getEntries({ user_id: userId || undefined, start: dateFrom, end: dateTo })
      .then((d) => { setEntries(d.entries ?? []); setSelected([]) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [userId, dateFrom, dateTo])

  const toggleSelect = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  const allSelected = entries.length > 0 && selected.length === entries.filter((e) => e.end_time && e.approval_status === 'pending').length

  const handleApprove = async (ids) => {
    setSubmitting(true)
    try { await approveEntries(ids); load() } finally { setSubmitting(false) }
  }

  const handleReject = async () => {
    if (!rejectModal) return
    setSubmitting(true)
    try { await rejectEntry(rejectModal, rejectReason); setRejectModal(null); setRejectReason(''); load() }
    finally { setSubmitting(false) }
  }

  const pendingIds = entries.filter((e) => e.end_time && e.approval_status === 'pending').map((e) => e.id)

  const columns = [
    { key: 'id', label: '', render: (_, row) => row.end_time && row.approval_status === 'pending'
      ? <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} className="accent-brand-500" />
      : null
    },
    { key: 'user_name', label: 'Employee' },
    { key: 'start_time', label: 'Date', render: (v) => formatDate(v) },
    { key: 'status_label', label: 'Activity', render: (v) => <Badge variant={v ?? 'pending'}>{v?.replace('_', ' ') ?? '—'}</Badge> },
    { key: 'cost_category', label: 'Category', render: (v) => COST_LABELS[v] ?? v ?? '—' },
    { key: 'job_name', label: 'Job' },
    { key: 'start_time', label: 'Start', render: (v) => formatTime(v) },
    { key: 'end_time', label: 'End', render: (v) => v ? formatTime(v) : <span className="text-orange-500 text-xs">In progress</span> },
    { key: 'duration', label: 'Duration', render: (_, row) => row.end_time ? formatDuration(row.start_time, row.end_time) : '—' },
    { key: 'approval_status', label: 'Status', render: (v) => <Badge variant={v}>{v}</Badge> },
    { key: 'id', label: '', render: (id, row) => row.end_time && row.approval_status === 'pending'
      ? <div className="flex gap-1">
          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleApprove([id]) }}>✓</Button>
          <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setRejectModal(id) }}>✕</Button>
        </div>
      : null
    },
  ]

  return (
    <div className="w-full">
      <PageHeader title="Timesheets" subtitle="Review and approve employee time entries" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500"
          value={userId} onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">All Employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500" />
      </div>

      {/* Bulk approve */}
      {pendingIds.length > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-amber-800 cursor-pointer">
            <input type="checkbox" checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : pendingIds)}
              className="accent-amber-600" />
            Select all pending ({pendingIds.length})
          </label>
          {selected.length > 0 && (
            <Button size="sm" loading={submitting} onClick={() => handleApprove(selected)}>
              Approve {selected.length} selected
            </Button>
          )}
        </div>
      )}

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : <DataTable columns={columns} data={entries} emptyMessage="No entries found." />}

      <Modal isOpen={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Entry">
        <div className="flex flex-col gap-4">
          <textarea
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none"
            rows={3} placeholder="Reason for rejection…"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={submitting} onClick={handleReject}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
