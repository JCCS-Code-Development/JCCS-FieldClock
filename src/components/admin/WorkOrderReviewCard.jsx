import Badge from '../ui/Badge'
import Button from '../ui/Button'

export default function WorkOrderReviewCard({ workOrder, onApprove, onEdit, onReject, onInvoice }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-orange-200 p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1">
            <Badge variant="pending_review">Pending Review</Badge>
            <Badge variant="active">{workOrder.job_name}</Badge>
          </div>
          <p className="font-semibold text-gray-900">{workOrder.title}</p>
          {workOrder.area && (
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{workOrder.area}</p>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{workOrder.employee_name}</span>
      </div>

      {workOrder.description && (
        <p className="text-sm text-gray-600 mb-3">{workOrder.description}</p>
      )}

      {workOrder.photos?.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {workOrder.photos.map((p) => (
            <img
              key={p.id}
              src={`${import.meta.env.VITE_API_BASE_URL.replace('/api', '')}/${p.file_path}`}
              alt=""
              className="h-16 w-16 rounded-lg object-cover shrink-0"
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onApprove(workOrder.id)}>✓ Approve</Button>
        <Button size="sm" variant="secondary" onClick={() => onEdit(workOrder)}>✏️ Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => onInvoice(workOrder)}>🧾 Invoice</Button>
        <Button size="sm" variant="danger" onClick={() => onReject(workOrder.id)}>✕ Reject</Button>
      </div>
    </div>
  )
}
