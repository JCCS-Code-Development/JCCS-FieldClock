import { useState } from 'react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

export default function WorkOrderItem({ workOrder, onComplete, onPhotoUpload }) {
  const [showComplete, setShowComplete] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const handleComplete = async () => {
    setLoading(true)
    try {
      await onComplete(workOrder.id, notes)
      setShowComplete(false)
    } finally {
      setLoading(false)
    }
  }

  const isFieldCreated = workOrder.source === 'field'
  const isDone = workOrder.status === 'completed' || workOrder.status === 'cancelled'

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1">
              <Badge variant={workOrder.status === 'completed' ? 'completed' : workOrder.status === 'in_progress' ? 'active' : 'pending'}>
                {workOrder.status.replace('_', ' ')}
              </Badge>
              {isFieldCreated && workOrder.review_status === 'pending_review' && (
                <Badge variant="pending_review">Pending Review</Badge>
              )}
            </div>
            <p className="font-semibold text-gray-900">{workOrder.title}</p>
            {workOrder.area && (
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mt-0.5">
                {workOrder.area}
              </p>
            )}
            {workOrder.description && (
              <p className="text-sm text-gray-600 mt-1 leading-snug">{workOrder.description}</p>
            )}
          </div>
        </div>

        {/* Photos strip */}
        {workOrder.photos?.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {workOrder.photos.map((photo) => (
              <img
                key={photo.id}
                src={`${import.meta.env.VITE_API_BASE_URL.replace('/api', '')}/${photo.file_path}`}
                alt={photo.caption || 'Work order photo'}
                className="h-16 w-16 rounded-lg object-cover shrink-0"
              />
            ))}
          </div>
        )}

        {!isDone && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="secondary" onClick={() => onPhotoUpload?.(workOrder.id)}>
              📷 Photo
            </Button>
            <Button size="sm" onClick={() => setShowComplete(true)}>
              ✓ Mark Complete
            </Button>
          </div>
        )}
      </div>

      <Modal
        isOpen={showComplete}
        onClose={() => setShowComplete(false)}
        title="Mark Work Order Complete"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            <strong>{workOrder.title}</strong>
            {workOrder.area && ` · ${workOrder.area}`}
          </p>
          <textarea
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
            rows={4}
            placeholder="Completion notes (optional)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setShowComplete(false)}>
              Cancel
            </Button>
            <Button fullWidth loading={loading} onClick={handleComplete}>
              Complete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
