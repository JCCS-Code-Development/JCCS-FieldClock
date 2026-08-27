import { useState, useEffect, useRef } from 'react'
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
import { getStatus, dayStart, dayEnd, getEntries, createChangeRequest, getChangeRequests } from '../../api/timeclock'
import { getNearbyJobs, listJobs } from '../../api/jobs'
import { listVisitStops, createVisitStop, deleteVisitStop } from '../../api/visitStops'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: '', iconRetinaUrl: '', shadowUrl: '' })

const dotMarker = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#16a34a;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const LocationPinIcon = ({ className = 'w-8 h-8' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
)
const ActivityIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h6"/>
  </svg>
)

const STATUS_CONFIG = {
  working: { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  done:    { text: 'text-gray-500',  bg: 'bg-gray-50',  border: 'border-gray-200' },
}

// Matches the m/km convention already used in the job-site dropdown below.
function formatDistanceLabel(m) {
  if (m == null) return ''
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
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
  const mins = Math.round(ms / 60000)
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

export default function ClockPanel({ showHeader = true }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()
  const firstName = user?.name?.split(' ')[0] ?? ''
  const { statusLabel, currentEntry, activeJob, dayStarted, setTimeclockData } = useTimeclockStore()

  // Always sync with server on mount so the UI reflects actual DB state
  useEffect(() => {
    getStatus().then(setTimeclockData).catch(() => {})
    getChangeRequests().then(d => setMyRequests(d.requests ?? [])).catch(() => {})
  }, [setTimeclockData])
  const isOnline = useOnlineStatus()
  const { position, loading: gpsLoading, getPosition } = useGPS()

  const [loading, setLoading]               = useState(false)
  const [activityOpen, setActivityOpen]     = useState(false)
  const rootRef         = useRef(null)
  const activityCardRef = useRef(null)

  // Expanding "Today's Activity" scrolls it comfortably into view; collapsing
  // it scrolls back up to the main clock view instead of leaving the user
  // stranded mid-page next to a now-empty card.
  const toggleActivity = () => {
    setActivityOpen((wasOpen) => {
      const next = !wasOpen
      requestAnimationFrame(() => {
        if (next) {
          activityCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        } else {
          rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
      return next
    })
  }
  const [jobs, setJobs]                     = useState([])
  const [selectedJobId, setSelectedJobId]   = useState('')
  const [locationLabel, setLocationLabel]   = useState(null)
  const [loadingJobs, setLoadingJobs]       = useState(false)
  const [manualLocation, setManualLocation] = useState('')
  const [error, setError]                   = useState('')
  // Set right after a clock-in whose GPS doesn't match the selected job site —
  // a non-blocking heads-up, not an error. Replaces the old traveling/arrival
  // flow: the clock-in always succeeds, this is just a flag on top of it.
  const [offSiteNotice, setOffSiteNotice]   = useState(null)

  // Clock-out confirmation: tapping the button no longer clocks out
  // immediately — it opens this so the employee can see the location that's
  // about to be recorded and optionally leave a note before confirming.
  const [clockOutModal, setClockOutModal] = useState(false)
  const [clockOutNote, setClockOutNote]   = useState('')

  // Additional Stops Today — a quick, no-approval-needed log of the extra
  // places (a suite, a room, a whole separate site) visited during the day
  // that are too minor/specific to ever be a real Job. Purely informational,
  // never touches job_id or pay — see api/visit-stops/.
  const [stops, setStops]             = useState([])
  const [loadingStops, setLoadingStops] = useState(false)
  const [addingStop, setAddingStop]   = useState(false)
  const [stopName, setStopName]       = useState('')
  const [stopNote, setStopNote]       = useState('')
  const [savingStop, setSavingStop]   = useState(false)
  const [stopError, setStopError]     = useState('')

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    setLoadingStops(true)
    listVisitStops({ start: today, end: today }).then((d) => setStops(d.stops ?? [])).finally(() => setLoadingStops(false))
  }, [])

  const handleAddStop = async () => {
    if (!stopName.trim()) { setStopError(t('home.stops.nameRequired')); return }
    setSavingStop(true); setStopError('')
    try {
      const res = await createVisitStop({ name: stopName.trim(), note: stopNote.trim() || undefined })
      setStops((s) => [res.stop, ...s])
      setStopName(''); setStopNote(''); setAddingStop(false)
    } catch (err) {
      setStopError(err?.response?.data?.error ?? t('home.stops.saveError'))
    } finally { setSavingStop(false) }
  }

  const handleDeleteStop = async (id) => {
    setStops((s) => s.filter((x) => x.id !== id))
    deleteVisitStop(id).catch(() => {})
  }

  const [myRequests, setMyRequests]   = useState([])
  const [detailSheet, setDetailSheet] = useState(null)
  const [corrModal, setCorrModal]     = useState(null)
  const [corrStep, setCorrStep]       = useState(1)
  const [corrType, setCorrType]       = useState('')
  const [corrStart, setCorrStart]     = useState('')
  const [corrEnd, setCorrEnd]         = useState('')
  const [corrReason, setCorrReason]   = useState('')
  const [corrSaving, setCorrSaving]   = useState(false)
  const [corrError, setCorrError]     = useState('')

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
    getNearbyJobs({ lat: position.lat, lng: position.lng, radius: 1 })
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

  // Keep the set-location list current for anyone who leaves this page open —
  // an admin adding/retiring one (e.g. a new permanent site) shouldn't require
  // a reload to show up. Refreshes when the tab/app regains focus, plus a
  // periodic fallback for a device that's just left sitting on this screen.
  useEffect(() => {
    const refresh = () => {
      const fetchJobs = position
        ? getNearbyJobs({ lat: position.lat, lng: position.lng, radius: 1 })
            .catch(() => listJobs({ assigned: true, status: 'active' }))
        : listJobs({ assigned: true, status: 'active' })
      fetchJobs.then((d) => setJobs(d.jobs ?? [])).catch(() => {})
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(refresh, 5 * 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(interval) }
  }, [position])

  useEffect(() => {
    if (activeJob?.id) setSelectedJobId(String(activeJob.id))
  }, [activeJob])

  // Auto-select this person's home job site (fixed or suggested) — still
  // overridable via the dropdown / the in-range card below.
  useEffect(() => {
    if (isClockedIn || selectedJobId || !user?.default_job_id) return
    if (jobs.some((j) => String(j.id) === String(user.default_job_id))) {
      setSelectedJobId(String(user.default_job_id))
    }
  }, [jobs, user?.default_job_id, isClockedIn, selectedJobId])

  const openCorrection = (entry) => {
    setCorrModal(entry)
    setCorrStep(1)
    setCorrType('')
    setCorrStart(entry.start_time ? entry.start_time.slice(0, 16) : '')
    setCorrEnd(entry.end_time     ? entry.end_time.slice(0, 16)   : '')
    setCorrReason('')
    setCorrError('')
  }

  const handleSubmitCorrection = async () => {
    if (!corrReason.trim()) { setCorrError(t('pay.correctionModal.errors.reasonRequired')); return }
    if ((corrType === 'start' || corrType === 'both') && !corrStart) { setCorrError(t('pay.correctionModal.errors.startRequired')); return }
    if ((corrType === 'end'   || corrType === 'both') && !corrEnd)   { setCorrError(t('pay.correctionModal.errors.endRequired')); return }
    setCorrSaving(true); setCorrError('')
    try {
      await createChangeRequest({
        entry_id: corrModal.id,
        requested_start: corrStart || null,
        requested_end:   corrEnd   || null,
        reason: corrReason,
      })
      setCorrModal(null)
      const reqs = await getChangeRequests().catch(() => ({ requests: [] }))
      setMyRequests(reqs.requests ?? [])
    } catch (err) {
      setCorrError(err?.response?.data?.error ?? t('pay.correction.submitError'))
    } finally { setCorrSaving(false) }
  }

  const handleToggle = async () => {
    if (!isOnline || loading) return
    setError('')
    if (!isClockedIn) {
      if (!selectedJobId && !manualLocation.trim()) {
        setError(t('home.noLocation'))
        return
      }
      performClockIn()
    } else {
      setClockOutNote('')
      setClockOutModal(true)
    }
  }

  const handleClockOut = async () => {
    setLoading(true)
    try {
      await dayEnd({
        lat: position?.lat, lng: position?.lng, accuracy: position?.accuracy,
        notes: clockOutNote.trim() || undefined,
      })
      setTimeclockData({ statusLabel: 'done', currentEntry: null, activeJob: null, dayStarted: true })
      setOffSiteNotice(null)
      setClockOutModal(false)
      setClockOutNote('')
    } finally { setLoading(false) }
  }

  // Clocking in always registers the shift immediately — no separate
  // "traveling" status or "I've arrived" step. If GPS shows the employee
  // isn't actually at the selected job site, the entry is just flagged
  // (via within_radius, computed server-side) rather than blocked.
  const performClockIn = async () => {
    setLoading(true)
    setOffSiteNotice(null)
    try {
      const jobId = selectedJobId ? parseInt(selectedJobId) : null
      // No job selected — instead of registering a new location that sits in
      // an admin review queue, just clock in unassigned and keep what they
      // typed as a note on the entry. Most one-off stops (a specific suite,
      // an errand) were never really new job sites; this keeps the record
      // without creating one.
      const data = await dayStart({
        job_id:   jobId,
        lat:      position?.lat      ?? null,
        lng:      position?.lng      ?? null,
        accuracy: position?.accuracy ?? null,
        notes:    !jobId && manualLocation.trim() ? manualLocation.trim() : undefined,
      })
      setTimeclockData({ statusLabel: data.statusLabel, currentEntry: data.currentEntry, activeJob: data.activeJob, dayStarted: true })
      setManualLocation('')
      if (data.within_radius === false) {
        setOffSiteNotice({ distanceMeters: data.distance_meters })
      }
    } catch (err) {
      setError(err?.response?.data?.error ?? t('home.clockInError'))
    } finally { setLoading(false) }
  }


  const dateFnsLocale = i18n.language.startsWith('es') ? es : enUS
  const now      = new Date()
  const mapPos   = position ? [position.lat, position.lng] : null
  const config   = STATUS_CONFIG[statusLabel] ?? null

  const displayLocation = activeJob?.name
    ?? (currentEntry?.notes ? currentEntry.notes.replace('Location: ', '') : null)
    ?? locationLabel

  // currentEntry.within_radius comes straight from the DB column (0/1/null via
  // PDO), so coerce loosely rather than assume a strict boolean.
  const isOffSite = isClockedIn
    && currentEntry?.within_radius !== null && currentEntry?.within_radius !== undefined
    && Number(currentEntry.within_radius) === 0

  // The nearest job whose own clock-in geofence the employee is actually
  // standing inside — not just "nearby" in the general sense used to populate
  // the dropdown. `jobs` is already distance-sorted by nearby.php, so the
  // first match is the closest one they're inside of.
  const inGeofence = (j) =>
    j.distance_meters != null && j.clock_in_radius_meters != null
    && j.distance_meters <= j.clock_in_radius_meters
  const inRangeJob = jobs.find(inGeofence)
  // Is the person's own home site one of the sites they're standing at? If so,
  // and they're "fixed", we don't nudge them toward a co-located job — see the
  // in-range card below.
  const atHomeSite = !!user?.default_job_id
    && jobs.some((j) => String(j.id) === String(user.default_job_id) && inGeofence(j))

  return (
    <div ref={rootRef} className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-6 w-full scroll-mt-4">

      {/* ── CLOCK SECTION — full width on mobile, left col on desktop ── */}
      <div className="flex flex-col items-center gap-4 lg:gap-8 lg:py-2">

        {/* Greeting/date + Today's Total (left column) and Clock button (right
            column, enlarged to balance the stacked text) on mobile;
            unchanged centered/stacked layout on desktop */}
        <div className="flex items-center w-full gap-4 lg:flex-col lg:gap-8 lg:justify-center">

          <div className="flex min-w-0 basis-0 grow-[3] flex-col items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4
            lg:grow-0 lg:gap-8 lg:w-full lg:bg-transparent lg:border-0 lg:shadow-none lg:px-0 lg:py-0">
            {showHeader && (
              <div className="select-none text-center w-full">
                <p className="text-xl lg:text-2xl font-bold text-gray-900 leading-tight">
                  {t('home.welcome', { name: firstName })}
                </p>
                <p className="text-sm lg:text-base text-brand-700 font-semibold mt-1">
                  {t('home.todayIs', { date: format(now, 'EEEE, MMMM d', { locale: dateFnsLocale }) })}
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-[10px] tracking-widest text-gray-400 uppercase font-semibold mb-1">{t('home.todaysTotal')}</p>
              <p className={`text-3xl lg:text-5xl font-bold tabular-nums leading-none ${dayTotal > 0 ? 'text-gray-900' : 'text-gray-200'}`}>
                {formatElapsed(dayTotal)}
              </p>
            </div>
          </div>

          <div className="relative flex basis-0 grow-[2] lg:grow-0 items-center justify-center">
            {isClockedIn && <span className="absolute w-40 h-40 lg:w-60 lg:h-60 rounded-full animate-ping bg-red-400/20" />}
            <button
              onClick={handleToggle}
              disabled={loading || !isOnline}
              className={`relative w-36 h-36 lg:w-52 lg:h-52 rounded-full flex flex-col items-center justify-center gap-1.5 lg:gap-2 text-white font-semibold shadow-2xl transition-all duration-300 active:scale-95 disabled:opacity-50 ring-8 lg:ring-[10px]
                ${isClockedIn
                  ? 'bg-red-500 ring-red-100 shadow-red-300/50'
                  : 'bg-brand-500 ring-brand-100 shadow-brand-300/50'
                }`}
            >
              {loading
                ? <Spinner size="lg" />
                : <>
                    {isClockedIn
                      ? <svg className="w-9 h-9 lg:w-12 lg:h-12" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                      : <svg className="w-9 h-9 lg:w-12 lg:h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    }
                    <span className="text-xs lg:text-base font-bold tracking-wide">
                      {isClockedIn ? t('home.clockOut') : t('home.clockIn')}
                    </span>
                  </>
              }
            </button>
          </div>
        </div>

        {/* Status badge + current location, when clocked in */}
        {isClockedIn && config && statusLabel !== 'done' && (
          <div className="flex flex-col items-center gap-1.5">
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border ${config.text} ${config.bg} ${config.border}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              {t(`status.${statusLabel}`)}
            </span>
            {displayLocation && <p className="text-xs text-gray-400">{displayLocation}</p>}
            {isOffSite && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                ⚠️ {t('home.offSiteBadge')}
              </span>
            )}
          </div>
        )}

        {/* One-time heads-up right after a clock-in whose GPS didn't match the
            selected job site — non-blocking, the clock-in already succeeded */}
        {offSiteNotice && (
          <p className="text-xs text-amber-700 font-medium bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl w-full text-center">
            ⚠️ {t('home.offSiteNotice', { distance: formatDistanceLabel(offSiteNotice.distanceMeters) })}
          </p>
        )}

        {!isOnline && (
          <p className="text-xs text-amber-600 font-medium bg-amber-50 px-4 py-2.5 rounded-xl w-full text-center">
            {t('home.offline')}
          </p>
        )}
        {error && <p className="text-xs text-red-600 font-medium text-center">{error}</p>}
      </div>

      {/* ── MAP + LOCATION + ACTIVITY SECTION — below on mobile, right col on desktop ── */}
      <div className="flex flex-col gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">

          <div className="h-40 lg:h-52 bg-gray-50 relative">
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

          <div className="px-4 py-3">
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
                {/* "Fixed" staff standing at their home site don't get nudged
                    toward a co-located job (e.g. Oficina + Carpinteria 1200 at
                    one building) — they can still pick it from the list for an
                    emergency. Everyone else (suggested staff, or a fixed person
                    who's actually somewhere else) gets the full nudge. */}
                {inRangeJob && (String(inRangeJob.id) === selectedJobId || !(user?.default_job_fixed && atHomeSite)) && (
                  String(inRangeJob.id) === selectedJobId ? (
                    <div className="flex items-center gap-2.5 bg-green-50 border-2 border-green-200 rounded-xl px-3 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</span>
                      <div className="min-w-0">
                        <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">{t('home.atThisLocation')}</p>
                        <p className="text-sm font-bold text-green-800 truncate">{inRangeJob.name}</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setSelectedJobId(String(inRangeJob.id)); setError('') }}
                      className="flex items-center gap-2.5 bg-brand-50 border-2 border-brand-300 rounded-xl px-3 py-2.5 text-left animate-pulse hover:animate-none active:scale-[0.99] transition-transform"
                    >
                      <LocationPinIcon className="w-6 h-6 text-brand-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-brand-600 font-semibold uppercase tracking-wide">{t('home.suggestedLocation')}</p>
                        <p className="text-sm font-bold text-brand-800 truncate">{inRangeJob.name}</p>
                      </div>
                    </button>
                  )
                )}
                <div className="relative">
                  <select
                    value={selectedJobId}
                    onChange={(e) => { setSelectedJobId(e.target.value); setError('') }}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 appearance-none"
                  >
                    <option value="">{t('home.selectJobSite')}</option>
                    {/* Grouped by proximity, not company — when standing at a
                        building with more than one active job (e.g. Oficina +
                        Carpinteria 1200) all of them show under "At this
                        location" so the choice is obvious. */}
                    {(() => {
                      const fmtDist = (m) => m == null ? '' : ` · ${m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(1) + 'km'}`
                      const inRange = jobs.filter((j) =>
                        j.distance_meters != null && j.clock_in_radius_meters != null
                        && j.distance_meters <= j.clock_in_radius_meters)
                      const inRangeIds = new Set(inRange.map((j) => j.id))
                      const rest = jobs.filter((j) => !inRangeIds.has(j.id))
                      return [
                        [t('home.atThisLocation'), inRange],
                        [t('home.nearbyJobs'), rest],
                      ].filter(([, list]) => list.length > 0).map(([label, list]) => (
                        <optgroup key={label} label={label}>
                          {list.map((j) => (
                            <option key={j.id} value={j.id}>{j.name}{fmtDist(j.distance_meters)}</option>
                          ))}
                        </optgroup>
                      ))
                    })()}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                </div>
                {loadingJobs && <p className="text-xs text-gray-400">{t('home.loadingLocations')}</p>}
                {/* Always available, not tucked behind a toggle — most stops are too
                    specific (a suite, a room, an errand) to ever be one of the few
                    set locations above. Typing here just leaves a note on the entry,
                    it doesn't register a new location for review. */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{t('home.orTypeLocation')}</p>
                  <input
                    type="text"
                    placeholder={t('home.typeSiteName')}
                    value={manualLocation}
                    onChange={(e) => { setManualLocation(e.target.value); setError('') }}
                    className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
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
              </div>
            )}
          </div>
        </div>

        {/* Additional Stops Today — quick, no-approval log of the extra
            places visited (a suite, a room, a whole separate site) that
            are too specific to ever be a real Job. Available any time of
            day, not just while clocked in — typing it in at day's end is
            exactly the point. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <LocationPinIcon className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">{t('home.stops.title')}</p>
                  {stops.length > 0 && (
                    <span className="text-[10px] font-bold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">{stops.length}</span>
                  )}
                </div>
                {!addingStop && <p className="text-xs text-gray-400 mt-0.5">{t('home.stops.subtitle')}</p>}
              </div>
            </div>
            {!addingStop && (
              <button onClick={() => { setAddingStop(true); setStopError('') }}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0">
                {t('home.stops.add')}
              </button>
            )}
          </div>

          {addingStop && (
            <div className="px-4 pb-4 flex flex-col gap-2">
              <input
                type="text"
                autoFocus
                placeholder={t('home.stops.namePlaceholder')}
                value={stopName}
                onChange={(e) => { setStopName(e.target.value); setStopError('') }}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              <input
                type="text"
                placeholder={t('home.stops.notePlaceholder')}
                value={stopNote}
                onChange={(e) => setStopNote(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              {stopError && <p className="text-xs text-red-600">{stopError}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" fullWidth
                  onClick={() => { setAddingStop(false); setStopName(''); setStopNote(''); setStopError('') }}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" fullWidth loading={savingStop} onClick={handleAddStop}>
                  {t('home.stops.save')}
                </Button>
              </div>
            </div>
          )}

          {!addingStop && !loadingStops && stops.length > 0 && (
            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {stops.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                    {s.note && <p className="text-xs text-gray-400 truncate">{s.note}</p>}
                  </div>
                  <button onClick={() => handleDeleteStop(s.id)}
                    className="text-gray-300 hover:text-red-500 shrink-0 px-1 text-sm leading-none">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's activity — its own card, collapsible, with a live preview so
            it's useful (and legible) at a glance even before tapping it open */}
        {(() => {
          const visible = todayEntries.filter((e) => e.cost_category !== 'day_end')
          const lastEntry = visible[visible.length - 1] ?? null
          return (
            <div ref={activityCardRef} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm scroll-mt-16 scroll-mb-36">
              <button onClick={toggleActivity}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <ActivityIcon />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{t('home.todaysActivity')}</p>
                      {visible.length > 0 && (
                        <span className="text-[10px] font-bold bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full">{visible.length}</span>
                      )}
                    </div>
                    {!activityOpen && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {lastEntry ? (
                          <>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${ENTRY_DOT[lastEntry.status_label] ?? 'bg-gray-400'}`} />
                            <span className="capitalize font-medium text-gray-600">{lastEntry.status_label?.replace('_', ' ')}</span>
                            {' · '}
                            {format(new Date(lastEntry.start_time), 'h:mm a', { locale: dateFnsLocale })}
                            {lastEntry.end_time ? ` – ${format(new Date(lastEntry.end_time), 'h:mm a', { locale: dateFnsLocale })}` : ` – ${t('home.now')}`}
                          </>
                        ) : t('home.noActivity')}
                      </p>
                    )}
                  </div>
                </div>
                <svg className={`w-4 h-4 text-gray-300 transition-transform shrink-0 ${activityOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {activityOpen && (
                <div className="px-4 pb-3 border-t border-gray-50 pt-1">
                  {visible.length === 0
                    ? <p className="text-sm text-gray-300 text-center py-4">{t('home.noActivity')}</p>
                    : <div className="flex flex-col divide-y divide-gray-50 max-h-40 lg:max-h-64 overflow-y-auto">
                        {visible.map((entry, i) => {
                          const dot = ENTRY_DOT[entry.status_label] ?? 'bg-gray-400'
                          const loc = entry.job_name ?? (entry.notes ? entry.notes.replace('Location: ', '') : null)
                          const hasReq = myRequests.some(r => String(r.entry_id) === String(entry.id) && r.status === 'pending')
                          return (
                            <button key={i} onClick={() => setDetailSheet(entry)}
                              className="w-full flex items-start justify-between gap-3 py-2.5 first:pt-0 text-left active:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                                  <p className="text-xs font-semibold text-gray-800 capitalize">
                                    {entry.status_label?.replace('_', ' ')}
                                  </p>
                                  {hasReq && <span className="text-[10px] text-amber-600 font-medium">· Pending</span>}
                                </div>
                                {loc && <p className="text-xs text-gray-400 truncate pl-3.5">{loc}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <p className="text-xs text-gray-500">
                                    {format(new Date(entry.start_time), 'h:mm a', { locale: dateFnsLocale })}
                                    {' → '}
                                    {entry.end_time
                                      ? format(new Date(entry.end_time), 'h:mm a', { locale: dateFnsLocale })
                                      : <span className="text-brand-500 font-medium">{t('home.now')}</span>
                                    }
                                  </p>
                                  <p className="text-xs font-bold text-gray-700 mt-0.5">
                                    {formatDur(entry.start_time, entry.end_time)}
                                  </p>
                                </div>
                                <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                              </div>
                            </button>
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

      {/* ── Shift detail bottom sheet ─────────────────────────── */}
      {detailSheet && (() => {
        const e = detailSheet
        const hasReq = myRequests.some(r => String(r.entry_id) === String(e.id) && r.status === 'pending')
        const cfg = ENTRY_CFG[e.status_label] ?? ENTRY_CFG.done
        const durMs = e.end_time ? new Date(e.end_time) - new Date(e.start_time) : 0
        const durMins = Math.round(durMs / 60000)
        const dh = Math.floor(durMins / 60)
        const dm = durMins % 60
        return (
          <div className="fixed inset-0 z-[1100] flex flex-col justify-end" onClick={() => setDetailSheet(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden" onClick={ev => ev.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
              <div className="px-5 pt-3 pb-3 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.text}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className="capitalize">{e.status_label?.replace('_', ' ')}</span>
                  </span>
                  <p className="text-sm text-gray-400 font-medium">{format(new Date(e.start_time), 'MMM d, yyyy', { locale: dateFnsLocale })}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">{t('pay.detail.clockIn')}</p>
                      <p className="text-2xl font-bold text-gray-900">{format(new Date(e.start_time), 'h:mm a', { locale: dateFnsLocale })}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">{t('pay.detail.clockOut')}</p>
                      <p className={`text-2xl font-bold ${e.end_time ? 'text-gray-900' : 'text-orange-400'}`}>
                        {e.end_time ? format(new Date(e.end_time), 'h:mm a', { locale: dateFnsLocale }) : t('pay.inProgress')}
                      </p>
                    </div>
                  </div>
                  {durMs > 0 && (
                    <div className="border-t border-gray-200 pt-3 mt-3 text-center">
                      <p className="text-sm font-semibold text-gray-600">{t('pay.detail.total', { time: dh > 0 ? `${dh}h ${dm}m` : `${dm}m` })}</p>
                    </div>
                  )}
                </div>
                {e.job_name && (
                  <div className="flex items-center gap-2 px-1">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    <p className="text-sm font-medium text-gray-700">{e.job_name}</p>
                  </div>
                )}
                {e.end_time && (
                  hasReq
                    ? <div className="bg-amber-50 rounded-2xl px-4 py-3.5 text-center">
                        <p className="text-sm font-semibold text-amber-700">{t('pay.detail.modificationPending')}</p>
                        <p className="text-xs text-amber-500 mt-0.5">{t('pay.detail.adminReviewing')}</p>
                      </div>
                    : <button onClick={() => { setDetailSheet(null); openCorrection(e) }}
                        className="w-full bg-brand-500 text-white font-semibold py-3.5 rounded-2xl text-sm active:bg-brand-600 transition-colors">
                        {t('pay.detail.requestModification')}
                      </button>
                )}
              </div>
              <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        )
      })()}

      {/* ── Clock-out confirmation ─────────────────────────────── */}
      <Modal isOpen={clockOutModal} onClose={() => !loading && setClockOutModal(false)} title={t('home.clockOutModal.title')}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-4 py-3">
            <LocationPinIcon className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-0.5">
                {t('home.clockOutModal.location')}
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {locationLabel ?? (gpsLoading ? t('home.locating') : t('home.locationUnavailable'))}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t('home.clockOutModal.noteLabel')}</label>
            <textarea
              value={clockOutNote}
              onChange={(e) => setClockOutNote(e.target.value)}
              placeholder={t('home.clockOutModal.notePlaceholder')}
              rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" fullWidth size="lg" onClick={() => setClockOutModal(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button fullWidth size="lg" loading={loading} onClick={handleClockOut}>
              {t('home.clockOut')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modification questionnaire ─────────────────────────── */}
      <Modal isOpen={!!corrModal} onClose={() => setCorrModal(null)} title={t('pay.detail.requestModification')}>
        {corrModal && (
          <div className="flex flex-col gap-4">
            <div className={`rounded-xl px-4 py-3 ${(ENTRY_CFG[corrModal.status_label] ?? ENTRY_CFG.done).bg}`}>
              <p className={`text-sm font-semibold capitalize ${(ENTRY_CFG[corrModal.status_label] ?? ENTRY_CFG.done).text}`}>
                {corrModal.status_label?.replace('_', ' ')} · {format(new Date(corrModal.start_time), 'MMM d, yyyy', { locale: dateFnsLocale })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {format(new Date(corrModal.start_time), 'h:mm a', { locale: dateFnsLocale })} → {corrModal.end_time ? format(new Date(corrModal.end_time), 'h:mm a', { locale: dateFnsLocale }) : t('pay.inProgress')}
                {corrModal.job_name && ` · ${corrModal.job_name}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2].map(s => (
                <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= corrStep ? 'bg-brand-500' : 'bg-gray-200'}`} />
              ))}
            </div>
            {corrStep === 1 && (
              <>
                <p className="text-sm font-semibold text-gray-800">{t('pay.correctionModal.whatNeedsCorrection')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {CORR_TYPES.map(opt => (
                    <button key={opt.value} onClick={() => setCorrType(opt.value)}
                      className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border-2 text-sm font-semibold transition-colors text-left
                        ${corrType === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 active:border-gray-300 bg-white'}`}>
                      <span className="text-base">{opt.icon}</span>
                      <span className="leading-tight">{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" fullWidth onClick={() => setCorrModal(null)}>{t('common.cancel')}</Button>
                  <Button fullWidth disabled={!corrType} onClick={() => setCorrStep(2)}>{t('pay.correctionModal.next')}</Button>
                </div>
              </>
            )}
            {corrStep === 2 && (
              <>
                {(corrType === 'start' || corrType === 'both') && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('pay.correctionModal.correctClockIn')}</label>
                    <input type="datetime-local" value={corrStart} onChange={e => setCorrStart(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
                  </div>
                )}
                {(corrType === 'end' || corrType === 'both') && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('pay.correctionModal.correctClockOut')}</label>
                    <input type="datetime-local" value={corrEnd} onChange={e => setCorrEnd(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {corrType === 'job'   ? t('pay.correctionModal.jobSiteQuestion') :
                     corrType === 'other' ? t('pay.correctionModal.describeChange') :
                     t('pay.correctionModal.whyNeeded')}{' *'}
                  </label>
                  <textarea rows={3} value={corrReason} onChange={e => setCorrReason(e.target.value)}
                    placeholder={
                      corrType === 'job'   ? t('pay.correctionModal.jobSitePlaceholder') :
                      corrType === 'other' ? t('pay.correctionModal.otherPlaceholder') :
                      t('pay.correctionModal.reasonPlaceholder')
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none" />
                </div>
                {corrError && <p className="text-sm text-red-600">{corrError}</p>}
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" fullWidth onClick={() => setCorrStep(1)}>{t('pay.correctionModal.back')}</Button>
                  <Button fullWidth loading={corrSaving} onClick={handleSubmitCorrection}>{t('pay.correctionModal.submit')}</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

const ENTRY_DOT = {
  working: 'bg-green-500', lunch: 'bg-amber-500',
  material_run: 'bg-violet-500', waiting: 'bg-orange-500', done: 'bg-gray-400',
}
const ENTRY_CFG = {
  working:      { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700'  },
  lunch:        { dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700'  },
  material_run: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' },
  waiting:      { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' },
  done:         { dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-500'   },
}
const CORR_TYPES = [
  { value: 'start', icon: '🕐', labelKey: 'pay.correctionModal.types.start' },
  { value: 'end',   icon: '🕑', labelKey: 'pay.correctionModal.types.end' },
  { value: 'both',  icon: '⏱',  labelKey: 'pay.correctionModal.types.both' },
  { value: 'job',   icon: '📍', labelKey: 'pay.correctionModal.types.job' },
  { value: 'other', icon: '💬', labelKey: 'pay.correctionModal.types.other' },
]
