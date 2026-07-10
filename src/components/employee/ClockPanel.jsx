import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { useTimeclockStore } from '../../store/timeclockStore'
import { useAuthStore } from '../../store/authStore'
import { useGPS } from '../../hooks/useGPS'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { getStatus, dayStart, dayEnd, setWorking, setLunch, setMaterialRun, setWaiting, getEntries } from '../../api/timeclock'
import { getNearbyJobs, listJobs } from '../../api/jobs'
import Spinner from '../ui/Spinner'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: '', iconRetinaUrl: '', shadowUrl: '' })

const dotMarker = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#16a34a;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const PlayIcon = () => (
  <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
)
const StopIcon = () => (
  <svg className="w-11 h-11" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
)
const LocationPinIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
)
const WrenchIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
  </svg>
)
const ForkIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18"/>
  </svg>
)
const TruckIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect strokeLinecap="round" x="1" y="3" width="15" height="13" rx="1"/>
    <path strokeLinecap="round" d="M16 8h4l3 3v5h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
)
const WaitIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/>
  </svg>
)

const STATUS_CONFIG = {
  working:      { text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  traveling:    { text: 'text-sky-700',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  lunch:        { text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  material_run: { text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  waiting:      { text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  done:         { text: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200' },
}

const STATUS_BUTTON_KEYS = [
  { key: 'working',      icon: <WrenchIcon /> },
  { key: 'lunch',        icon: <ForkIcon /> },
  { key: 'material_run', icon: <TruckIcon /> },
  { key: 'waiting',      icon: <WaitIcon /> },
]

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const a = data.address ?? {}
    return [a.city || a.town || a.village || a.county, a.state].filter(Boolean).join(', ')
  } catch { return null }
}

function formatElapsed(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function formatDur(start, end) {
  const ms = (end ? new Date(end) : new Date()) - new Date(start)
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return '< 1m'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? (mins % 60) + 'm' : ''}`
}

function useTodayData(statusLabel) {
  const [entries, setEntries] = useState([])
  const [completedSeconds, setCompletedSeconds] = useState(0)
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    getEntries({ start: today, end: today }).then((d) => {
      const list = d.entries ?? []
      setEntries(list)
      const finished = list.filter((e) => e.end_time && e.cost_category !== 'day_end')
      const total = finished.reduce(
        (sum, e) => sum + (new Date(e.end_time) - new Date(e.start_time)) / 1000, 0
      )
      setCompletedSeconds(Math.floor(total))
    }).catch(() => {})
  }, [statusLabel])
  return { entries, completedSeconds }
}

function useLiveElapsed(isClockedIn, currentEntry) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isClockedIn || !currentEntry?.start_time) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(currentEntry.start_time)) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isClockedIn, currentEntry?.start_time])
  return elapsed
}

export default function ClockPanel() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()
  const firstName = user?.name?.split(' ')[0] ?? ''
  const { statusLabel, currentEntry, activeJob, dayStarted, setTimeclockData } = useTimeclockStore()

  // Always sync with server on mount so the UI reflects actual DB state
  useEffect(() => {
    getStatus().then(setTimeclockData).catch(() => {})
  }, [setTimeclockData])
  const isOnline = useOnlineStatus()
  const { position, loading: gpsLoading, getPosition } = useGPS()

  const [loading, setLoading]               = useState(false)
  const [activityOpen, setActivityOpen]     = useState(false)
  const [jobs, setJobs]                     = useState([])
  const [selectedJobId, setSelectedJobId]   = useState('')
  const [locationLabel, setLocationLabel]   = useState(null)
  const [loadingJobs, setLoadingJobs]       = useState(false)
  const [showManual, setShowManual]         = useState(false)
  const [manualLocation, setManualLocation] = useState('')
  const [error, setError]                   = useState('')

  const isClockedIn = dayStarted && statusLabel !== 'done' && statusLabel !== null
  const liveElapsed = useLiveElapsed(isClockedIn, currentEntry)
  const { entries: todayEntries, completedSeconds } = useTodayData(statusLabel)
  const dayTotal = completedSeconds + liveElapsed

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    if (position || gpsLoading) return
    setLoadingJobs(true)
    listJobs({ assigned: true, status: 'active' })
      .then((d) => setJobs(d.jobs ?? []))
      .finally(() => setLoadingJobs(false))
  }, [gpsLoading, position])

  useEffect(() => {
    if (activeJob?.id) setSelectedJobId(String(activeJob.id))
  }, [activeJob])

  const handleToggle = async () => {
    if (!isOnline || loading) return
    setError('')
    if (!isClockedIn) {
      if (!selectedJobId && !manualLocation.trim()) {
        setShowManual(true)
        setError(t('home.noLocation'))
        return
      }
      setLoading(true)
      try {
        const data = await dayStart({
          job_id:   selectedJobId ? parseInt(selectedJobId) : null,
          notes:    !selectedJobId && manualLocation.trim() ? `Location: ${manualLocation.trim()}` : null,
          lat:      position?.lat      ?? null,
          lng:      position?.lng      ?? null,
          accuracy: position?.accuracy ?? null,
        })
        setTimeclockData({ statusLabel: data.statusLabel, currentEntry: data.currentEntry, activeJob: data.activeJob, dayStarted: true })
        setShowManual(false)
        setManualLocation('')
      } catch (err) {
        setError(err?.response?.data?.error ?? t('home.clockInError'))
      } finally { setLoading(false) }
    } else {
      setLoading(true)
      try {
        await dayEnd({ lat: position?.lat, lng: position?.lng })
        setTimeclockData({ statusLabel: 'done', currentEntry: null, activeJob: null, dayStarted: true })
      } finally { setLoading(false) }
    }
  }

  const handleStatus = async (key) => {
    if (!isOnline || !isClockedIn || loading) return
    setLoading(true)
    try {
      const fn = { working: setWorking, lunch: setLunch, material_run: setMaterialRun, waiting: setWaiting }[key]
      if (!fn) return
      const data = await fn({ lat: position?.lat, lng: position?.lng })
      setTimeclockData({ statusLabel: data.statusLabel, currentEntry: data.currentEntry, activeJob: data.activeJob, dayStarted: true })
    } finally { setLoading(false) }
  }

  const dateFnsLocale = i18n.language.startsWith('es') ? es : enUS
  const now      = new Date()
  const dayName  = format(now, 'EEEE',   { locale: dateFnsLocale })
  const monthDay = format(now, 'MMMM d', { locale: dateFnsLocale })
  const mapPos   = position ? [position.lat, position.lng] : null
  const config   = STATUS_CONFIG[statusLabel] ?? null

  const displayLocation = activeJob?.name
    ?? (currentEntry?.notes ? currentEntry.notes.replace('Location: ', '') : null)
    ?? locationLabel

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-6 w-full">

      {/* ── CLOCK SECTION — full width on mobile, left col on desktop ── */}
      <div className="flex flex-col items-center gap-4 lg:gap-8 lg:py-2">

        {/* Welcome */}
        <p className="text-base font-semibold text-gray-700 lg:text-lg self-start lg:self-center">
          {t('home.welcome', { name: firstName })}
        </p>

        {/* Date */}
        <div className="text-center select-none">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">{dayName}</p>
          <p className="text-3xl lg:text-5xl font-extralight text-gray-900 mt-0.5 leading-none tracking-tight">{monthDay}</p>
        </div>

        {/* Clock button */}
        <div className="relative flex items-center justify-center">
          {isClockedIn && <span className="absolute w-44 h-44 lg:w-60 lg:h-60 rounded-full animate-ping bg-red-400/20" />}
          <button
            onClick={handleToggle}
            disabled={loading || !isOnline}
            className={`relative w-36 h-36 lg:w-52 lg:h-52 rounded-full flex flex-col items-center justify-center gap-2 text-white font-semibold shadow-2xl transition-all duration-300 active:scale-95 disabled:opacity-50 ring-[10px]
              ${isClockedIn
                ? 'bg-red-500 ring-red-100 shadow-red-300/50'
                : 'bg-brand-500 ring-brand-100 shadow-brand-300/50'
              }`}
          >
            {loading
              ? <Spinner size="lg" />
              : <>
                  {isClockedIn
                    ? <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    : <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  }
                  <span className="text-base font-bold tracking-wide">
                    {isClockedIn ? t('home.clockOut') : t('home.clockIn')}
                  </span>
                </>
            }
          </button>
        </div>

        {/* Status badge */}
        {isClockedIn && config && statusLabel !== 'done' && (
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border ${config.text} ${config.bg} ${config.border}`}>
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            {t(`status.${statusLabel}`)}
          </span>
        )}

        {/* Today's total */}
        <div className="text-center">
          <p className="text-[10px] tracking-widest text-gray-400 uppercase font-semibold mb-1.5">{t('home.todaysTotal')}</p>
          <p className={`text-5xl font-mono font-bold tabular-nums leading-none ${dayTotal > 0 ? 'text-gray-900' : 'text-gray-200'}`}>
            {formatElapsed(dayTotal)}
          </p>
        </div>

        {/* Status change buttons — shown when clocked in */}
        {isClockedIn && (
          <div className="w-full">
            <p className="text-[10px] text-gray-400 text-center mb-3 uppercase tracking-widest font-semibold">{t('home.changeStatus')}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {STATUS_BUTTON_KEYS.map(({ key, icon }) => (
                <button key={key} onClick={() => handleStatus(key)}
                  disabled={loading || statusLabel === key}
                  className={`flex items-center justify-center gap-2 px-3 py-3.5 rounded-2xl text-sm font-semibold transition-all border-2
                    ${statusLabel === key
                      ? `${STATUS_CONFIG[key].text} ${STATUS_CONFIG[key].border} ${STATUS_CONFIG[key].bg}`
                      : 'text-gray-600 border-gray-200 active:border-brand-300 bg-white'
                    }`}>
                  {icon} {t(`status.${key}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isOnline && (
          <p className="text-xs text-amber-600 font-medium bg-amber-50 px-4 py-2.5 rounded-xl w-full text-center">
            {t('home.offline')}
          </p>
        )}
        {error && <p className="text-xs text-red-600 font-medium text-center">{error}</p>}
      </div>

      {/* ── MAP + ACTIVITY SECTION — below on mobile, right col on desktop ── */}
      <div className="flex flex-col gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">

          <div className="h-44 lg:h-52 bg-gray-50 relative">
            {mapPos ? (
              <MapContainer
                center={mapPos} zoom={15}
                zoomControl={false} attributionControl={false}
                dragging={false} touchZoom={false}
                scrollWheelZoom={false} doubleClickZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <Marker position={mapPos} icon={dotMarker} />
              </MapContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                {gpsLoading
                  ? <><Spinner size="sm" /><p className="text-xs text-gray-400">{t('home.locating')}</p></>
                  : <><LocationPinIcon /><p className="text-xs text-gray-400">{t('home.locationUnavailable')}</p></>
                }
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">
              {isClockedIn ? t('home.clockedInAt') : t('home.selectLocation')}
            </p>
            {isClockedIn ? (
              <div>
                <p className="text-sm font-semibold text-gray-900">{displayLocation ?? t('home.unknown')}</p>
                {locationLabel && displayLocation !== locationLabel && (
                  <p className="text-xs text-gray-400 mt-0.5">{locationLabel}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <select
                    value={selectedJobId}
                    onChange={(e) => { setSelectedJobId(e.target.value); setShowManual(false); setError('') }}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 appearance-none"
                  >
                    <option value="">{t('home.selectJobSite')}</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}{j.distance_meters != null
                          ? ` · ${j.distance_meters < 1000 ? Math.round(j.distance_meters) + 'm' : (j.distance_meters / 1000).toFixed(1) + 'km'}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                </div>
                {loadingJobs && <p className="text-xs text-gray-400">{t('home.loadingLocations')}</p>}
                {(showManual || (!loadingJobs && jobs.length === 0)) ? (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder={t('home.typeSiteName')}
                      value={manualLocation}
                      onChange={(e) => { setManualLocation(e.target.value); setError('') }}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                      autoFocus={showManual}
                    />
                    {position ? (
                      <p className="text-xs text-gray-400">
                        {t('home.gpsCapture', { coords: `${position.lat.toFixed(4)}°, ${position.lng.toFixed(4)}°` })}
                        {locationLabel && ` · ${locationLabel}`}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-500">{t('home.gpsUnavailable')}</p>
                    )}
                  </div>
                ) : (
                  !selectedJobId && !loadingJobs && jobs.length > 0 && (
                    <button onClick={() => setShowManual(true)}
                      className="text-xs text-gray-400 hover:text-brand-500 transition-colors text-left">
                      {t('home.notListed')}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Today's activity — collapsible */}
          {(() => {
            const visible = todayEntries.filter((e) => e.cost_category !== 'day_end')
            return (
              <div>
                <button onClick={() => setActivityOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{t('home.todaysActivity')}</p>
                    {visible.length > 0 && (
                      <span className="text-[10px] font-bold bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full">{visible.length}</span>
                    )}
                  </div>
                  <svg className={`w-4 h-4 text-gray-300 transition-transform ${activityOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {activityOpen && (
                  <div className="px-4 pb-3">
                    {visible.length === 0
                      ? <p className="text-sm text-gray-300 text-center py-4">{t('home.noActivity')}</p>
                      : <div className="flex flex-col divide-y divide-gray-50 max-h-40 lg:max-h-64 overflow-y-auto">
                          {visible.map((entry, i) => {
                            const cfg = STATUS_CONFIG[entry.status_label]
                            const loc = entry.job_name ?? (entry.notes ? entry.notes.replace('Location: ', '') : null)
                            return (
                              <div key={i} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    {cfg && (
                                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                        entry.status_label === 'working'      ? 'bg-green-500'  :
                                        entry.status_label === 'lunch'        ? 'bg-amber-500'  :
                                        entry.status_label === 'material_run' ? 'bg-violet-500' :
                                        entry.status_label === 'waiting'      ? 'bg-orange-500' :
                                        entry.status_label === 'traveling'    ? 'bg-sky-500'    : 'bg-gray-400'
                                      }`} />
                                    )}
                                    <p className="text-xs font-semibold text-gray-800 capitalize">
                                      {entry.status_label?.replace('_', ' ')}
                                    </p>
                                  </div>
                                  {loc && <p className="text-xs text-gray-400 truncate pl-3.5">{loc}</p>}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-gray-500">
                                    {format(new Date(entry.start_time), 'h:mm a')}
                                    {' → '}
                                    {entry.end_time
                                      ? format(new Date(entry.end_time), 'h:mm a')
                                      : <span className="text-brand-500 font-medium">{t('home.now')}</span>
                                    }
                                  </p>
                                  <p className="text-xs font-bold text-gray-700 mt-0.5">
                                    {formatDur(entry.start_time, entry.end_time)}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                    }
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

    </div>
  )
}
