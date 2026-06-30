import { useState, useEffect } from 'react'
import { useTimeclockStore } from '../../store/timeclockStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { dayStart, dayEnd, setWorking, setLunch, setMaterialRun, setWaiting, setTraveling } from '../../api/timeclock'
import Spinner from '../ui/Spinner'

const STATUS_CONFIG = {
  working:      { label: 'Working',       color: 'bg-green-500',  text: 'text-green-700',  ring: 'ring-green-300' },
  traveling:    { label: 'Traveling',     color: 'bg-sky-500',    text: 'text-sky-700',    ring: 'ring-sky-300' },
  lunch:        { label: 'Lunch',         color: 'bg-amber-500',  text: 'text-amber-700',  ring: 'ring-amber-300' },
  material_run: { label: 'Material Run',  color: 'bg-violet-500', text: 'text-violet-700', ring: 'ring-violet-300' },
  waiting:      { label: 'Waiting',       color: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-300' },
  done:         { label: 'Done',          color: 'bg-gray-400',   text: 'text-gray-600',   ring: 'ring-gray-200' },
}

function useLiveTimer(startTime) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])
  return elapsed
}

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ClockToggle() {
  const { statusLabel, currentEntry, dayStarted, setTimeclockData, clear } = useTimeclockStore()
  const isOnline = useOnlineStatus()
  const [loading, setLoading] = useState(false)
  const elapsed = useLiveTimer(currentEntry?.start_time)

  const isClockedIn = dayStarted && statusLabel !== 'done' && statusLabel !== null

  const handleToggle = async () => {
    if (!isOnline) return
    setLoading(true)
    try {
      if (!isClockedIn) {
        const data = await dayStart({})
        setTimeclockData({ statusLabel: data.statusLabel, currentEntry: data.currentEntry, activeJob: data.activeJob, dayStarted: true })
      } else {
        const data = await dayEnd({})
        setTimeclockData({ statusLabel: 'done', currentEntry: data.currentEntry, activeJob: null, dayStarted: true })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStatus = async (action) => {
    if (!isOnline || !isClockedIn) return
    setLoading(true)
    try {
      const fn = { working: setWorking, lunch: setLunch, material_run: setMaterialRun, waiting: setWaiting }[action]
      if (!fn) return
      const data = await fn({})
      setTimeclockData({ statusLabel: data.statusLabel, currentEntry: data.currentEntry, activeJob: data.activeJob, dayStarted: true })
    } finally {
      setLoading(false)
    }
  }

  const config = STATUS_CONFIG[statusLabel] ?? null

  return (
    <div className="flex flex-col items-center gap-6 py-8 w-full">

      {/* Live timer */}
      <div className={`text-5xl font-mono font-bold tabular-nums transition-colors ${isClockedIn ? 'text-gray-900' : 'text-gray-300'}`}>
        {formatElapsed(isClockedIn ? elapsed : 0)}
      </div>

      {/* Status badge */}
      {config && statusLabel !== 'done' && (
        <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold ${config.text} bg-opacity-10`}>
          <span className={`w-2 h-2 rounded-full ${config.color} animate-pulse`} />
          {config.label}
        </span>
      )}

      {/* Main toggle button */}
      <button
        onClick={handleToggle}
        disabled={loading || !isOnline}
        className={`w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 text-white font-bold text-lg shadow-xl transition-all active:scale-95 disabled:opacity-50
          ${isClockedIn
            ? 'bg-red-500 hover:bg-red-600 ring-8 ring-red-200'
            : 'bg-green-500 hover:bg-green-600 ring-8 ring-green-200'
          }`}
      >
        {loading ? <Spinner size="md" /> : (
          <>
            <span className="text-3xl">{isClockedIn ? '⏹' : '▶'}</span>
            <span>{isClockedIn ? 'Clock Out' : 'Clock In'}</span>
          </>
        )}
      </button>

      {/* Status selectors — only when clocked in */}
      {isClockedIn && statusLabel !== 'done' && (
        <div className="w-full max-w-sm">
          <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wide font-medium">Change Status</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'working',      label: 'Working',      emoji: '🔨' },
              { key: 'lunch',        label: 'Lunch',        emoji: '🍽' },
              { key: 'material_run', label: 'Material Run', emoji: '🚗' },
              { key: 'waiting',      label: 'Waiting',      emoji: '⏳' },
            ].map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => handleStatus(key)}
                disabled={loading || statusLabel === key}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2
                  ${statusLabel === key
                    ? `${STATUS_CONFIG[key].text} border-current bg-current/10`
                    : 'text-gray-600 border-gray-200 hover:border-gray-300 bg-white'
                  }`}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isOnline && (
        <p className="text-sm text-amber-600 font-medium">You must be online to clock in or out.</p>
      )}
    </div>
  )
}
