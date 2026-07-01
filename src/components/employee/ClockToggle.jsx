import { useState, useEffect } from 'react'

const PlayIcon = () => (
  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z"/>
  </svg>
)
const StopIcon = () => (
  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" rx="1"/>
  </svg>
)
const WrenchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
  </svg>
)
const ForkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18"/>
  </svg>
)
const TruckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
)
const ClockWaitIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9"/>
    <path strokeLinecap="round" d="M12 7v5l3 3"/>
  </svg>
)

import { useTimeclockStore } from '../../store/timeclockStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useGPS } from '../../hooks/useGPS'
import { dayStart, dayEnd, setWorking, setLunch, setMaterialRun, setWaiting } from '../../api/timeclock'
import { getNearbyJobs, listJobs } from '../../api/jobs'
import Spinner from '../ui/Spinner'

const STATUS_CONFIG = {
  working:      { label: 'Working',      color: 'bg-green-500',  text: 'text-green-700'  },
  traveling:    { label: 'Traveling',    color: 'bg-sky-500',    text: 'text-sky-700'    },
  lunch:        { label: 'Lunch',        color: 'bg-amber-500',  text: 'text-amber-700'  },
  material_run: { label: 'Material Run', color: 'bg-violet-500', text: 'text-violet-700' },
  waiting:      { label: 'Waiting',      color: 'bg-orange-500', text: 'text-orange-700' },
  done:         { label: 'Done',         color: 'bg-gray-400',   text: 'text-gray-500'   },
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

function formatElapsed(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const a = data.address ?? {}
    return [a.city || a.town || a.village || a.county, a.state].filter(Boolean).join(', ')
  } catch {
    return null
  }
}

export default function ClockToggle() {
  const { statusLabel, currentEntry, activeJob, dayStarted, setTimeclockData } = useTimeclockStore()
  const isOnline = useOnlineStatus()
  const { position, loading: gpsLoading, getPosition } = useGPS()

  const [loading, setLoading]       = useState(false)
  const [jobs, setJobs]             = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [locationLabel, setLocationLabel] = useState(null)
  const [loadingJobs, setLoadingJobs] = useState(false)

  const elapsed     = useLiveTimer(currentEntry?.start_time)
  const isClockedIn = dayStarted && statusLabel !== 'done' && statusLabel !== null

  // Get GPS + jobs on mount
  useEffect(() => { getPosition() }, [])

  useEffect(() => {
    if (!position) return
    reverseGeocode(position.lat, position.lng).then(setLocationLabel)
    setLoadingJobs(true)
    getNearbyJobs({ lat: position.lat, lng: position.lng, radius: 50 })
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => listJobs({ assigned: true, status: 'active' }).then((d) => setJobs(d.jobs ?? [])))
      .finally(() => setLoadingJobs(false))
  }, [position])

  // Fall back to all assigned jobs if no GPS
  useEffect(() => {
    if (position) return
    if (!gpsLoading) {
      setLoadingJobs(true)
      listJobs({ assigned: true, status: 'active' })
        .then((d) => setJobs(d.jobs ?? []))
        .finally(() => setLoadingJobs(false))
    }
  }, [gpsLoading, position])

  // Pre-select active job if already clocked in
  useEffect(() => {
    if (activeJob?.id) setSelectedJobId(String(activeJob.id))
  }, [activeJob])

  const handleToggle = async () => {
    if (!isOnline) return
    setLoading(true)
    try {
      if (!isClockedIn) {
        const data = await dayStart({ job_id: selectedJobId ? parseInt(selectedJobId) : null })
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
    <div className="flex flex-col items-center gap-5 py-6 w-full">

      {/* Location indicator */}
      <div className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 min-h-5">
        {gpsLoading
          ? <><Spinner size="sm" /><span>Finding location…</span></>
          : locationLabel
            ? <><span className="text-base">📍</span><span className="font-medium text-gray-700">{locationLabel}</span></>
            : <span className="text-gray-400">📍 Location unavailable</span>
        }
      </div>

      {/* Job / Location selector */}
      <div className="w-full max-w-sm">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">
          {isClockedIn ? 'Current Location' : 'Select Location'}
        </label>
        <div className="relative">
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={isClockedIn || loadingJobs}
            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 disabled:opacity-60 appearance-none"
          >
            <option value="">— No specific location —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}{j.distance_meters != null ? ` (${j.distance_meters < 1000 ? Math.round(j.distance_meters) + 'm' : (j.distance_meters/1000).toFixed(1) + 'km'})` : ''}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
        </div>
        {loadingJobs && <p className="text-xs text-gray-400 mt-1">Loading nearby locations…</p>}
      </div>

      {/* Live timer */}
      <div className={`text-5xl font-mono font-bold tabular-nums transition-colors ${isClockedIn ? 'text-gray-900' : 'text-gray-300'}`}>
        {formatElapsed(isClockedIn ? elapsed : 0)}
      </div>

      {/* Status badge */}
      {config && statusLabel !== 'done' && (
        <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold ${config.text} bg-current/5 border border-current/20`}>
          <span className={`w-2 h-2 rounded-full ${config.color} animate-pulse`} />
          {config.label}
          {activeJob && <span className="opacity-60">· {activeJob.name}</span>}
        </span>
      )}

      {/* Main clock in/out button */}
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
            {isClockedIn ? <StopIcon /> : <PlayIcon />}
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
              { key: 'working',      label: 'Working',      icon: <WrenchIcon /> },
              { key: 'lunch',        label: 'Lunch',        icon: <ForkIcon /> },
              { key: 'material_run', label: 'Material Run', icon: <TruckIcon /> },
              { key: 'waiting',      label: 'Waiting',      icon: <ClockWaitIcon /> },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => handleStatus(key)}
                disabled={loading || statusLabel === key}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2
                  ${statusLabel === key
                    ? `${STATUS_CONFIG[key].text} border-current/40 bg-current/5`
                    : 'text-gray-600 border-gray-200 hover:border-gray-300 bg-white'
                  }`}
              >
                {icon} {label}
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
