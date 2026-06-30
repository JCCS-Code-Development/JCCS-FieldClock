import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listJobs, createJob, updateJob, deleteJob, assignEmployees } from '../../api/jobs'
import { listEmployees } from '../../api/employees'

const EMPTY = { name: '', client_name: '', address: '', latitude: '', longitude: '', clock_in_radius_meters: 300, status: 'active', notes: '' }

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  const data = await res.json()
  if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  return null
}

export default function AdminJobs() {
  const [jobs, setJobs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | job object
  const [form, setForm] = useState(EMPTY)
  const [assignedIds, setAssignedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([listJobs(), listEmployees()])
      .then(([j, e]) => { setJobs(j.jobs ?? []); setEmployees(e.employees ?? []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setAssignedIds([]); setModal('create') }
  const openEdit = (job) => {
    setForm({ ...job })
    setAssignedIds(job.assigned_user_ids ?? [])
    setModal(job)
  }

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    setGeocoding(true)
    const coords = await geocode(form.address).catch(() => null)
    if (coords) setForm((f) => ({ ...f, latitude: coords.lat, longitude: coords.lng }))
    setGeocoding(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let jobId
      if (modal === 'create') {
        const res = await createJob(form)
        jobId = res.id
      } else {
        await updateJob(modal.id, form)
        jobId = modal.id
      }
      if (assignedIds.length > 0 || modal !== 'create') {
        await assignEmployees(jobId, assignedIds)
      }
      setModal(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this job?')) return
    await deleteJob(id)
    load()
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleAssign = (id) =>
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const columns = [
    { key: 'name', label: 'Job Name' },
    { key: 'client_name', label: 'Client' },
    { key: 'address', label: 'Address' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={v}>{v}</Badge> },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</Button>
        <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}>Delete</Button>
      </div>
    )},
  ]

  return (
    <div className="w-full">
      <PageHeader
        title="Jobs"
        subtitle="Manage active job sites"
        actions={<Button onClick={openCreate}>+ New Job</Button>}
      />

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : <DataTable columns={columns} data={jobs} emptyMessage="No jobs yet." />}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Job' : 'Edit Job'} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Job Name *" value={form.name} onChange={set('name')} className="col-span-2" />
            <Input label="Client Name *" value={form.client_name} onChange={set('client_name')} className="col-span-2" />
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Address *</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  value={form.address}
                  onChange={set('address')}
                  onBlur={handleAddressBlur}
                  placeholder="123 Main St, City, State"
                />
                {geocoding && <div className="flex items-center"><Spinner size="sm" /></div>}
              </div>
              {form.latitude && (
                <p className="text-xs text-gray-400">
                  📍 {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Clock-in Radius: {form.clock_in_radius_meters}m
              </label>
              <input
                type="range" min="50" max="2000" step="50"
                value={form.clock_in_radius_meters}
                onChange={(e) => setForm((f) => ({ ...f, clock_in_radius_meters: Number(e.target.value) }))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>50m (strict)</span><span>2000m (lenient)</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
              <select
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
                value={form.status}
                onChange={set('status')}
              >
                {['active', 'on_hold', 'completed', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none"
                rows={2} value={form.notes} onChange={set('notes')}
              />
            </div>
          </div>

          {/* Employee assignment */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Assign Employees</p>
            <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
              {employees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignedIds.includes(emp.id)}
                    onChange={() => toggleAssign(emp.id)}
                    className="accent-brand-500 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">{emp.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{emp.pay_type.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Save Job</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
