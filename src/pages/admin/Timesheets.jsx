import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { getEntries, getChangeRequests, reviewChangeRequest } from '../../api/timeclock'
import { listEmployees } from '../../api/employees'
import { formatDate, formatTime, formatDuration } from '../../utils/format'
import { format, subDays } from 'date-fns'

const COST_LABELS = {
  travel: 'Travel', direct_labor: 'Direct Labor', paid_lunch: 'Paid Lunch',
  waiting_time: 'Waiting', material_pickup: 'Material Run',
  admin_photos: 'Admin/Photos', rework: 'Rework', day_end: 'Day End',
}

export default function AdminTimesheets() {
  const today   = format(new Date(), 'yyyy-MM-dd')
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

  const [activeTab, setActiveTab]   = useState('log')
  const [entries, setEntries]       = useState([])
  const [requests, setRequests]     = useState([])
  const [employees, setEmployees]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [userId, setUserId]         = useState('')
  const [dateFrom, setDateFrom]     = useState(weekAgo)
  const [dateTo, setDateTo]         = useState(today)
  const [reviewModal, setReviewModal] = useState(null)
  const [reviewNote, setReviewNote]   = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    listEmployees().then((d) => setEmployees(d.employees ?? []))
    loadRequests()
  }, [])

  const loadLog = () => {
    setLoading(true)
    getEntries({ user_id: userId || undefined, start: dateFrom, end: dateTo })
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false))
  }

  const loadRequests = () => {
    getChangeRequests({ status: 'pending' })
      .then((d) => { setRequests(d.requests ?? []); setPendingCount(d.requests?.length ?? 0) })
  }

  useEffect(() => { if (activeTab === 'log') loadLog() }, [activeTab, userId, dateFrom, dateTo])
  useEffect(() => { if (activeTab === 'changes') loadRequests() }, [activeTab])

  const handleReview = async (action) => {
    if (!reviewModal) return
    setSubmitting(true)
    try {
      await reviewChangeRequest({ request_id: reviewModal.id, action, note: reviewNote })
      setReviewModal(null)
      setReviewNote('')
      loadRequests()
    } finally { setSubmitting(false) }
  }

  const logColumns = [
    { key: 'user_name',    label: 'Employee' },
    { key: 'start_time',   label: 'Date',     render: (v) => formatDate(v) },
    { key: 'status_label', label: 'Activity', render: (v) => <Badge variant={v ?? 'pending'}>{v?.replace('_',' ') ?? '—'}</Badge> },
    { key: 'cost_category',label: 'Category', render: (v) => COST_LABELS[v] ?? v ?? '—' },
    { key: 'job_name',     label: 'Location', render: (v) => v || <span className="text-gray-400">—</span> },
    { key: 'start_time',   label: 'Start',    render: (v) => formatTime(v) },
    { key: 'end_time',     label: 'End',      render: (v) => v ? formatTime(v) : <span className="text-orange-500 text-xs font-medium">In progress</span> },
    { key: 'duration',     label: 'Duration', render: (_, row) => row.end_time ? formatDuration(row.start_time, row.end_time) : '—' },
  ]

  const reqColumns = [
    { key: 'employee_name',  label: 'Employee' },
    { key: 'entry_start',    label: 'Original Clock In', render: (v) => formatDate(v) + ' ' + formatTime(v) },
    { key: 'entry_end',      label: 'Original Clock Out', render: (v) => v ? formatDate(v) + ' ' + formatTime(v) : '—' },
    { key: 'requested_start', label: 'Requested Start', render: (v) => v ? formatDate(v) + ' ' + formatTime(v) : <span className="text-gray-400">No change</span> },
    { key: 'requested_end',   label: 'Requested End',   render: (v) => v ? formatDate(v) + ' ' + formatTime(v) : <span className="text-gray-400">No change</span> },
    { key: 'reason',          label: 'Reason' },
    { key: 'created_at',      label: 'Submitted', render: (v) => formatDate(v) },
    { key: 'id', label: '', render: (_, row) => (
      <Button size="sm" onClick={(e) => { e.stopPropagation(); setReviewModal(row); setReviewNote('') }}>
        Review
      </Button>
    )},
  ]

  return (
    <div className="w-full">
      <PageHeader title="Timesheets" subtitle="Time log and correction requests" />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('log')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'log' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Time Log
        </button>
        <button onClick={() => setActiveTab('changes')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'changes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Change Requests
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingCount}</span>
          )}
        </button>
      </div>

      {activeTab === 'log' && (
        <>
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
          {loading
            ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            : <DataTable columns={logColumns} data={entries} emptyMessage="No entries found." />}
        </>
      )}

      {activeTab === 'changes' && (
        <>
          {requests.length === 0
            ? <div className="text-center py-16 text-gray-400">No pending change requests.</div>
            : <DataTable columns={reqColumns} data={requests} emptyMessage="No pending requests." />}
        </>
      )}

      {/* Review modal */}
      <Modal isOpen={!!reviewModal} onClose={() => setReviewModal(null)} title="Review Time Change Request">
        {reviewModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-sm flex flex-col gap-2">
              <p><span className="font-medium text-gray-600">Employee:</span> {reviewModal.employee_name}</p>
              <p><span className="font-medium text-gray-600">Original:</span> {formatDate(reviewModal.entry_start)} {formatTime(reviewModal.entry_start)} → {reviewModal.entry_end ? formatTime(reviewModal.entry_end) : 'open'}</p>
              {reviewModal.requested_start && <p><span className="font-medium text-gray-600">New start:</span> {formatDate(reviewModal.requested_start)} {formatTime(reviewModal.requested_start)}</p>}
              {reviewModal.requested_end   && <p><span className="font-medium text-gray-600">New end:</span> {formatDate(reviewModal.requested_end)} {formatTime(reviewModal.requested_end)}</p>}
              <p><span className="font-medium text-gray-600">Reason:</span> {reviewModal.reason}</p>
            </div>
            <Input label="Note (optional)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="e.g. Verified with employee" />
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setReviewModal(null)}>Cancel</Button>
              <Button variant="danger" fullWidth loading={submitting} onClick={() => handleReview('reject')}>Reject</Button>
              <Button fullWidth loading={submitting} onClick={() => handleReview('approve')}>Approve & Apply</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
