const variants = {
  pending:        'bg-yellow-100 text-yellow-800',
  approved:       'bg-green-100 text-green-800',
  rejected:       'bg-red-100 text-red-800',
  active:         'bg-blue-100 text-blue-800',
  completed:      'bg-gray-100 text-gray-700',
  pending_review: 'bg-orange-100 text-orange-800',
  on_hold:        'bg-purple-100 text-purple-800',
  cancelled:      'bg-gray-100 text-gray-500',
  // timeclock statuses
  traveling:      'bg-sky-100 text-sky-800',
  working:        'bg-green-100 text-green-800',
  lunch:          'bg-amber-100 text-amber-800',
  material_run:   'bg-violet-100 text-violet-800',
  waiting:        'bg-orange-100 text-orange-800',
  done:           'bg-gray-100 text-gray-600',
}

export default function Badge({ variant = 'pending', children, className = '' }) {
  const style = variants[variant] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style} ${className}`}>
      {children}
    </span>
  )
}
