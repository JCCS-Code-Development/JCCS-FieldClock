import { useState, useEffect, useRef } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listJobs, createJob, updateJob, deleteJob, assignEmployees } from '../../api/jobs'
import { listEmployees } from '../../api/employees'
import { listEstimates, createEstimate, updateEstimate } from '../../api/estimates'
import JobsMap from '../../components/admin/JobsMap'
import { groupJobsByCompany } from '../../utils/jobs'

const EMPTY = { name: '', client_name: '', company: '', address: '', latitude: '', longitude: '', clock_in_radius_meters: 300, status: 'active', notes: '', is_recurring_maintenance: false }

async function searchAddresses(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&countrycodes=us&q=${encodeURIComponent(query)}`
  const res  = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'JCCS-FieldClock/1.0' } })
  return res.json()
}

export default function AdminJobs() {
  const [jobs, setJobs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | job object
  const [form, setForm] = useState(EMPTY)
  const [assignedIds, setAssignedIds] = useState([])
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [sugLoading, setSugLoading]   = useState(false)
  const [showSug, setShowSug]         = useState(false)
  const addrRef = useRef(null)

  // Estimates (per job, shown only when editing an existing job)
  const [estimates, setEstimates]     = useState([])
  const [loadingEst, setLoadingEst]   = useState(false)
  const [newEstNumber, setNewEstNumber] = useState('')
  const [newEstDesc, setNewEstDesc]   = useState('')
  const [savingEst, setSavingEst]     = useState(false)
  const [estError, setEstError]       = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([listJobs(), listEmployees()])
      .then(([j, e]) => { setJobs(j.jobs ?? []); setEmployees(e.employees ?? []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const loadEstimates = (jobId) => {
    setLoadingEst(true)
    listEstimates({ job_id: jobId })
      .then((d) => setEstimates(d.estimates ?? []))
      .finally(() => setLoadingEst(false))
  }

  const openCreate = () => { setForm(EMPTY); setAssignedIds([]); setEstimates([]); setFormError(''); setModal('create') }
  const openEdit = (job) => {
    setForm({ ...job })
    setAssignedIds(job.assigned_user_ids ?? [])
    setNewEstNumber(''); setNewEstDesc(''); setEstError(''); setFormError('')
    loadEstimates(job.id)
    setModal(job)
  }

  const handleAddEstimate = async () => {
    if (!newEstNumber.trim()) { setEstError('Enter an estimate number.'); return }
    setSavingEst(true); setEstError('')
    try {
      await createEstimate({ job_id: modal.id, estimate_number: newEstNumber.trim(), description: newEstDesc.trim() })
      setNewEstNumber(''); setNewEstDesc('')
      loadEstimates(modal.id)
    } catch (err) {
      setEstError(err?.response?.data?.error ?? 'Could not add estimate.')
    } finally {
      setSavingEst(false)
    }
  }

  const handleRemoveEstimate = async (est) => {
    if (!confirm(`Remove estimate #${est.estimate_number}?`)) return
    try {
      await updateEstimate(est.id, { is_active: false })
      loadEstimates(modal.id)
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not remove estimate.')
    }
  }

  // Debounced address autocomplete
  useEffect(() => {
    const q = form.address.trim()
    if (q.length < 4) { setSuggestions([]); setShowSug(false); return }
    const timer = setTimeout(async () => {
      setSugLoading(true)
      try {
        const data = await searchAddresses(q)
        setSuggestions(data)
        setShowSug(data.length > 0)
      } catch { setSuggestions([]) }
      finally { setSugLoading(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [form.address])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (addrRef.current && !addrRef.current.contains(e.target)) setShowSug(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectSuggestion = (s) => {
    setForm(f => ({ ...f, address: s.display_name, latitude: parseFloat(s.lat), longitude: parseFloat(s.lon) }))
    setSuggestions([])
    setShowSug(false)
  }

  const handleSave = async () => {
    setSaving(true); setFormError('')
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
    } catch (err) {
      setFormError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this job?')) return
    try {
      await deleteJob(id)
      load()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not delete. Try again.')
    }
  }

  const handleApprove = async () => {
    setSaving(true); setFormError('')
    try {
      await updateJob(modal.id, { ...form, status: 'active' })
      if (assignedIds.length > 0) await assignEmployees(modal.id, assignedIds)
      setModal(null)
      load()
    } catch (err) {
      setFormError(err?.response?.data?.error ?? 'Could not approve. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async () => {
    if (!confirm('Reject this location? It stays on file (marked cancelled) so any time already logged against it is preserved.')) return
    setSaving(true); setFormError('')
    try {
      await updateJob(modal.id, { ...form, status: 'cancelled' })
      setModal(null)
      load()
    } catch (err) {
      setFormError(err?.response?.data?.error ?? 'Could not reject. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleAssign = (id) =>
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const pendingJobs = jobs.filter((j) => j.status === 'pending_review')
  const listedJobs   = jobs.filter((j) => j.status !== 'pending_review')
  const groupedJobs  = groupJobsByCompany(listedJobs)

  const columns = [
    { key: 'name', label: 'Job Title', className: 'w-44' },
    { key: 'client_name', label: 'Client', className: 'w-40', render: (v) => v || <span className="text-gray-300">—</span> },
    { key: 'address', label: 'Address' },
    { key: 'status', label: 'Status', className: 'w-24', render: (v) => <Badge variant={v}>{v}</Badge> },
    { key: 'id', label: '', className: 'w-44', render: (_, row) => (
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

      {!loading && pendingJobs.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            {pendingJobs.length} location{pendingJobs.length === 1 ? '' : 's'} awaiting review
          </p>
          <div className="flex flex-col gap-2">
            {pendingJobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-3 bg-white rounded-xl px-4 py-2.5 border border-amber-100">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{j.name}</p>
                  <p className="text-xs text-gray-400">
                    Registered by {j.registered_by_name ?? 'an employee'} on {new Date(j.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" onClick={() => openEdit(j)}>Review</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && listedJobs.length > 0 && (
        <JobsMap jobs={listedJobs} onJobClick={openEdit} />
      )}

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : groupedJobs.length === 0 ? (
          <p className="text-center text-gray-400 py-16 text-sm">No jobs yet.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {groupedJobs.map(({ company, jobs: groupJobs }) => (
              <div key={company}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">{company}</h3>
                <DataTable columns={columns} data={groupJobs} fixed />
              </div>
            ))}
          </div>
        )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Job' : 'Edit Job'} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Job Title *" value={form.name} onChange={set('name')} className="col-span-2" />
            <Input label="Company" value={form.company} onChange={set('company')} className="col-span-2"
              helperText="The hospital/business this job belongs to — used to group jobs on lists" />
            <Input label="Client Name *" value={form.client_name} onChange={set('client_name')} className="col-span-2" />
            <div className="col-span-2 flex flex-col gap-1" ref={addrRef}>
              <label className="text-sm font-medium text-gray-700">Address *</label>
              <div className="relative">
                <div className="flex gap-2 items-center">
                  <input
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    value={form.address}
                    onChange={(e) => { setForm(f => ({ ...f, address: e.target.value })); setShowSug(true) }}
                    onFocus={() => suggestions.length > 0 && setShowSug(true)}
                    placeholder="Start typing an address…"
                    autoComplete="off"
                  />
                  {sugLoading && <Spinner size="sm" />}
                </div>

                {/* Autocomplete dropdown */}
                {showSug && suggestions.length > 0 && (
                  <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                    {suggestions.map((s) => (
                      <li
                        key={s.place_id}
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}
                        className="px-4 py-3 text-sm text-gray-800 hover:bg-brand-50 cursor-pointer border-b border-gray-100 last:border-0 leading-snug"
                      >
                        <span className="font-medium">
                          {s.address?.house_number ? `${s.address.house_number} ` : ''}
                          {s.address?.road ?? s.address?.pedestrian ?? ''}
                        </span>
                        {s.address?.road && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {[s.address?.city ?? s.address?.town ?? s.address?.village, s.address?.state, s.address?.postcode].filter(Boolean).join(', ')}
                          </span>
                        )}
                        {!s.address?.road && (
                          <span className="block text-xs text-gray-400 mt-0.5 truncate">{s.display_name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
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
            <label className="col-span-2 flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.is_recurring_maintenance}
                onChange={(e) => setForm((f) => ({ ...f, is_recurring_maintenance: e.target.checked }))}
                className="accent-brand-500 w-4 h-4"
              />
              <span className="text-sm text-gray-700">Recurring maintenance location</span>
              <span className="text-xs text-gray-400">— skips the Work Order/Estimate picker at clock-in by default</span>
            </label>
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

          {/* Estimates — only manageable once the job exists */}
          {modal && modal !== 'create' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Estimates</p>
              {loadingEst ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto mb-3">
                  {estimates.length === 0 && (
                    <p className="text-xs text-gray-400">No estimates on file for this job yet.</p>
                  )}
                  {estimates.map((est) => (
                    <div key={est.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-800">#{est.estimate_number}</span>
                        {est.description && <span className="text-xs text-gray-400 ml-2">{est.description}</span>}
                      </div>
                      <button
                        onClick={() => handleRemoveEstimate(est)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="w-32 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  placeholder="Estimate #"
                  value={newEstNumber}
                  onChange={(e) => setNewEstNumber(e.target.value)}
                />
                <input
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  placeholder="Description (optional)"
                  value={newEstDesc}
                  onChange={(e) => setNewEstDesc(e.target.value)}
                />
                <Button size="sm" loading={savingEst} onClick={handleAddEstimate}>+ Add</Button>
              </div>
              {estError && <p className="text-xs text-red-600 mt-1.5">{estError}</p>}
            </div>
          )}

          {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}

          {modal && modal !== 'create' && modal.status === 'pending_review' ? (
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-xs text-gray-400">
                Confirm the client name/address/radius above, then approve this location so it appears
                for everyone, or reject it if it was registered in error.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" fullWidth onClick={handleReject} disabled={saving}>Reject</Button>
                <Button fullWidth loading={saving} onClick={handleApprove}>Approve Location</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
              <Button fullWidth loading={saving} onClick={handleSave}>Save Job</Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
