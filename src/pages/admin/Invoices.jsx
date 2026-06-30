import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listInvoices, createInvoice, updateInvoice, deleteInvoice } from '../../api/invoices'
import { listJobs } from '../../api/jobs'
import { listWorkOrders } from '../../api/workOrders'
import { formatCurrency, formatDate } from '../../utils/format'

const EMPTY = { job_id: '', work_order_id: '', amount: '', due_date: '', notes: '' }

const STATUS_FLOW = { draft: 'sent', sent: 'paid', paid: 'paid' }
const STATUS_LABELS = { draft: 'Mark Sent', sent: 'Mark Paid', paid: 'Paid ✓' }

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([])
  const [jobs, setJobs] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([listInvoices(), listJobs()])
      .then(([inv, j]) => { setInvoices(inv.invoices ?? []); setJobs(j.jobs ?? []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const loadWOs = async (jobId) => {
    if (!jobId) { setWorkOrders([]); return }
    const d = await listWorkOrders({ job_id: jobId }).catch(() => ({ work_orders: [] }))
    setWorkOrders(d.work_orders ?? [])
  }

  const openCreate = () => { setForm(EMPTY); setWorkOrders([]); setModal('create') }

  const handleSave = async () => {
    setSaving(true)
    try { await createInvoice(form); setModal(null); load() }
    finally { setSaving(false) }
  }

  const handleStatusChange = async (invoice) => {
    if (invoice.status === 'paid') return
    await updateInvoice(invoice.id, { status: STATUS_FLOW[invoice.status] })
    load()
  }

  const set = (k) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [k]: val }))
    if (k === 'job_id') loadWOs(val)
  }

  const columns = [
    { key: 'invoice_number', label: 'Invoice #', render: (v) => <span className="font-mono text-xs font-semibold">{v}</span> },
    { key: 'job_name', label: 'Job' },
    { key: 'work_order_title', label: 'Work Order' },
    { key: 'amount', label: 'Amount', render: (v) => formatCurrency(v) },
    { key: 'due_date', label: 'Due', render: (v) => v ? formatDate(v + 'T00:00:00') : '—' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={v === 'paid' ? 'approved' : v === 'sent' ? 'active' : 'pending'}>{v}</Badge> },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-2">
        {row.status !== 'paid' && (
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleStatusChange(row) }}>
            {STATUS_LABELS[row.status]}
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteInvoice(row.id).then(load) }}>
          Delete
        </Button>
      </div>
    )},
  ]

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Invoices"
        subtitle="Track billing and invoice status"
        actions={<Button onClick={openCreate}>+ New Invoice</Button>}
      />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
        : <DataTable columns={columns} data={invoices} emptyMessage="No invoices yet." />}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title="New Invoice">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Job *</label>
            <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
              value={form.job_id} onChange={set('job_id')}>
              <option value="">Select a job…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name} — {j.client_name}</option>)}
            </select>
          </div>
          {workOrders.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Work Order (optional)</label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
                value={form.work_order_id} onChange={set('work_order_id')}>
                <option value="">Entire job</option>
                {workOrders.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            </div>
          )}
          <Input label="Amount ($) *" type="number" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" />
          <Input label="Due Date" type="date" value={form.due_date} onChange={set('due_date')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none"
              rows={2} value={form.notes} onChange={set('notes')} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Create Invoice</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
