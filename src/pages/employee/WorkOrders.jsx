import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import WorkOrderItem from '../../components/employee/WorkOrderItem'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import {
  listWorkOrders,
  createWorkOrder,
  completeWorkOrder,
  uploadPhoto,
} from '../../api/workOrders'

export default function WorkOrders() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const fileRef = useRef(null)
  const [uploadingFor, setUploadingFor] = useState(null)

  const load = () => {
    setLoading(true)
    listWorkOrders({ job_id: jobId })
      .then((d) => setWorkOrders(d.work_orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [jobId])

  const handleComplete = async (id, notes) => {
    await completeWorkOrder(id, notes)
    load()
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await createWorkOrder({
        job_id: jobId,
        title: newTitle,
        area: newArea,
        description: newDesc,
        source: 'field',
      })
      setShowNew(false)
      setNewTitle(''); setNewArea(''); setNewDesc('')
      load()
    } finally {
      setCreating(false)
    }
  }

  const handlePhotoUpload = (woId) => {
    setUploadingFor(woId)
    fileRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingFor) return
    try {
      await uploadPhoto(uploadingFor, file)
      load()
    } catch {
      alert('Photo upload failed.')
    }
    e.target.value = ''
    setUploadingFor(null)
  }

  const open = workOrders.filter((w) => w.status !== 'completed' && w.status !== 'cancelled')
  const done = workOrders.filter((w) => w.status === 'completed' || w.status === 'cancelled')

  return (
    <div className="px-4 pt-6 pb-6 flex flex-col gap-4 max-w-lg mx-auto">
      <div>
        <button onClick={() => navigate('/jobs')} className="text-brand-500 text-sm mb-3">← Jobs</button>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Work Orders</h1>
          <Button size="sm" onClick={() => setShowNew(true)}>+ Quick WO</Button>
        </div>
      </div>

      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {open.length === 0 && done.length === 0 && (
            <p className="text-center text-gray-400 py-12 text-sm">No work orders for this job.</p>
          )}
          <div className="flex flex-col gap-3">
            {open.map((wo) => (
              <WorkOrderItem
                key={wo.id}
                workOrder={wo}
                onComplete={handleComplete}
                onPhotoUpload={handlePhotoUpload}
              />
            ))}
          </div>
          {done.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Completed</p>
              <div className="flex flex-col gap-3 opacity-60">
                {done.map((wo) => (
                  <WorkOrderItem key={wo.id} workOrder={wo} onComplete={() => {}} onPhotoUpload={() => {}} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Quick Work Order">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
            📋 Field-created — will be marked Pending Office Review
          </p>
          <Input label="Title *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Replace outlet cover" />
          <Input label="Area" value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="e.g. Master Bedroom" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
              rows={3}
              placeholder="What needs to be done?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div className="flex gap-3 mt-1">
            <Button variant="secondary" fullWidth onClick={() => setShowNew(false)}>Cancel</Button>
            <Button fullWidth loading={creating} onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
