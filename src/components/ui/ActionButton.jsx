import Spinner from './Spinner'

const colorMap = {
  indigo:  { bg: 'bg-brand-500 hover:bg-brand-400 active:bg-brand-700', text: 'text-white' },
  sky:     { bg: 'bg-sky-500 hover:bg-sky-400 active:bg-sky-700', text: 'text-white' },
  green:   { bg: 'bg-green-600 hover:bg-green-500 active:bg-green-700', text: 'text-white' },
  amber:   { bg: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-700', text: 'text-white' },
  violet:  { bg: 'bg-violet-600 hover:bg-violet-500 active:bg-violet-700', text: 'text-white' },
  orange:  { bg: 'bg-orange-500 hover:bg-orange-400 active:bg-orange-700', text: 'text-white' },
  gray:    { bg: 'bg-gray-600 hover:bg-gray-500 active:bg-gray-700', text: 'text-white' },
  red:     { bg: 'bg-red-600 hover:bg-red-500 active:bg-red-700', text: 'text-white' },
}

export default function ActionButton({
  label,
  sublabel,
  icon,
  color = 'indigo',
  disabled = false,
  loading = false,
  onClick,
  className = '',
}) {
  const { bg, text } = colorMap[color] ?? colorMap.indigo
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center gap-1.5
        min-h-[88px] w-full rounded-2xl p-4
        font-semibold transition-colors select-none cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed
        ${bg} ${text} ${className}
      `}
    >
      {loading ? (
        <Spinner size="lg" />
      ) : (
        <>
          {icon && <span className="text-2xl leading-none">{icon}</span>}
          <span className="text-base leading-tight">{label}</span>
          {sublabel && (
            <span className="text-xs opacity-75 font-normal leading-tight">{sublabel}</span>
          )}
        </>
      )}
    </button>
  )
}
