export default function StatsCard({ label, value, icon, color = 'blue', onClick }) {
  const colors = {
    blue:   'bg-blue-50   text-blue-600',
    green:  'bg-green-50  text-green-600',
    amber:  'bg-amber-50  text-amber-600',
    red:    'bg-red-50    text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    sky:    'bg-sky-50    text-sky-600',
  }
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-brand-300 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${colors[color] ?? colors.blue}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
