import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import WorkOrderReviewCard from '../../components/admin/WorkOrderReviewCard'
import Spinner from '../../components/ui/Spinner'
import { listWorkOrders, updateWorkOrder, deleteWorkOrder } from '../../api/workOrders'
import { listJobs } from '../../api/jobs'
import { listEmployees } from '../../api/employees'
import { formatDate } from '../../utils/format'

export default function AdminWorkOrders() {
  const [tab, setTab] = useState('review')
  const [workOrders, setWorkOrders] = useState([])
  const [jobs, setJobs] = useState([])
  const [_employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [editModal, setEditModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [filterJob, setFilterJob] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      listWorkOrders({ job_id: filterJob || undefined, status: filterStatus || undefined }),
      listJobs(),
      listEmployees(),
    ]).then(([wo, j, e]) => {
      setWorkOrders(wo.work_orders ?? [])
      setJobs(j.jobs ?? [])
      setEmployees(e.employees ?? [])
    }).finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filterJob, filterStatus])

  const openEdit = (wo) => { setForm({ ...wo }); setEditModal(wo) }

  const handleSave = async () => {
    setSaving(true)
    try { await updateWorkOrder(editModal.id, form); setEditModal(null); load() }
    finally { setSaving(false) }
  }

  const handleApprove = async (id) => {
    await updateWorkOrder(id, { review_status: 'approved' }); load()
  }
  const handleReject = async (id) => {
    await updateWorkOrder(id, { review_status: 'rejected', status: 'cancelled' }); load()
  }

  const pending = workOrders.filter((w) => w.review_status === 'pending_review')
  const all = workOrders.filter((w) => w.review_status !== 'pending_review')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const columns = [
    { key: 'job_name', label: 'Job' },
    { key: 'title', label: 'Work Order' },
    { key: 'area', label: 'Area' },
    { key: 'employee_name', label: 'Assigned' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={v}>{v.replace('_', ' ')}</Badge> },
    { key: 'created_at', label: 'Created', render: (v) => formatDate(v) },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</Button>
        <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) { deleteWorkOrder(row.id).then(load) } }}>Delete</Button>
      </div>
    )},
  ]

  return (
    <div className="w-full">
      <PageHeader title="Work Orders" subtitle="Review field-created and manage all work orders" />

      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {[['review', `Pending Review${pending.length > 0 ? ` (${pending.length})` : ''}`], ['all', 'All Work Orders']].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'review' && (
        loading ? <div className="flex justify-center py-16"><Spinner /></div> :
        pending.length === 0 ? <p className="text-center text-gray-400 py-16 text-sm">No work orders pending review.</p> :
        <div className="flex flex-col gap-4">
          {pending.map((wo) => (
            <WorkOrderReviewCard
              key={wo.id}
              workOrder={wo}
              onApprove={handleApprove}
              onEdit={openEdit}
              onReject={handleReject}
              onInvoice={(wo) => openEdit({ ...wo, _openInvoice: true })}
            />
          ))}
        </div>
      )}

      {tab === 'all' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <select className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500"
              value={filterJob} onChange={(e) => setFilterJob(e.target.value)}>
              <option value="">All Jobs</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
            <select className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500"
              value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['open', 'in_progress', 'completed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          {loading ? <div className="flex justify-center py-16"><Spinner /></div>
            : <DataTable columns={columns} data={all} emptyMessage="No work orders found." />}
        </>
      )}

      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Edit Work Order">
        <div className="flex flex-col gap-4">
          <Input label="Title" value={form.title ?? ''} onChange={set('title')} />
          <Input label="Area" value={form.area ?? ''} onChange={set('area')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none"
              rows={3} value={form.description ?? ''} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
                value={form.status ?? 'open'} onChange={set('status')}>
                {['open', 'in_progress', 'completed', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Review Status</label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
                value={form.review_status ?? 'approved'} onChange={set('review_status')}>
                <option value="approved">Approved</option>
                <option value="pending_review">Pending Review</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setEditModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
