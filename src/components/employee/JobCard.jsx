import Badge from '../ui/Badge'

export default function JobCard({ job, onSelect, selected = false, showDistance = true }) {
  const directionsUrl = `https://maps.google.com/?daddr=${encodeURIComponent(job.address)}`

  return (
    <div
      className={`
        bg-white rounded-2xl border-2 p-4 transition-colors cursor-pointer
        ${selected ? 'border-brand-500 bg-brand-100' : 'border-gray-100 hover:border-brand-300'}
      `}
      onClick={() => onSelect?.(job)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{job.name}</p>
          <p className="text-sm text-gray-500 truncate">{job.client_name}</p>
          <p className="text-sm text-gray-600 mt-1 leading-snug">{job.address}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="active">{job.status}</Badge>
          {showDistance && job.distance_miles != null && (
            <span className="text-xs text-gray-400">
              {job.distance_miles < 0.1
                ? `${Math.round(job.distance_miles * 5280)} ft`
                : `${job.distance_miles.toFixed(1)} mi`}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-brand-500 font-medium hover:underline flex items-center gap-1"
        >
          📍 Get Directions
        </a>
        {job.notes && (
          <span className="text-xs text-gray-400 truncate">· {job.notes}</span>
        )}
      </div>
    </div>
  )
}
