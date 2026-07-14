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
import { getStatus, dayStart, dayEnd, setTraveling, markArrival, getEntries, createChangeRequest, getChangeRequests } from '../../api/timeclock'
import { getNearbyJobs, listJobs, registerJob } from '../../api/jobs'
import { listEstimates } from '../../api/estimates'
import { groupJobsByCompany } from '../../utils/jobs'
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

const PlayIcon = () => (
  <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
)
const StopIcon = () => (
  <svg className="w-11 h-11" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
)
const LocationPinIcon = ({ className = 'w-8 h-8' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
)
const WrenchIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
  </svg>
)
const DocumentIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M13 3v5h5"/>
  </svg>
)
const ClipboardIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z"/>
    <rect x="5" y="6" width="14" height="15" rx="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path strokeLinecap="round" d="M9 12l2 2 4-4"/>
  </svg>
)
const PlusIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 8v8M8 12h8"/>
  </svg>
)
const AlertIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l9.5 16.5H2.5L12 3.5z"/>
    <path strokeLinecap="round" d="M12 10v4"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>
  </svg>
)
const ShieldIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/>
  </svg>
)

const STATUS_CONFIG = {
  working:   { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  traveling: { text: 'text-sky-700',   bg: 'bg-sky-50',   border: 'border-sky-200' },
  done:      { text: 'text-gray-500',  bg: 'bg-gray-50',  border: 'border-gray-200' },
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
    getChangeRequests().then(d => setMyRequests(d.requests ?? [])).catch(() => {})
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

  const [visitModal, setVisitModal]               = useState(false)
  const [visitStep, setVisitStep]                 = useState(1)
  const [visitEstimates, setVisitEstimates]       = useState([])
  const [loadingVisitEstimates, setLoadingVisitEstimates] = useState(false)
  const [visitCategory, setVisitCategory]         = useState(null)
  const [pickedEstimateId, setPickedEstimateId]   = useState(null)
  const [workOrderNumber, setWorkOrderNumber]     = useState('')
  const [fieldDescription, setFieldDescription]   = useState('')
  const [engineerName, setEngineerName]           = useState('')
  const [forceVisitPicker, setForceVisitPicker]   = useState(false)

  const resetVisitFields = () => {
    setVisitCategory(null)
    setPickedEstimateId(null)
    setWorkOrderNumber('')
    setFieldDescription('')
    setEngineerName('')
  }

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
    if (!corrReason.trim()) { setCorrError('Please provide an explanation.'); return }
    if ((corrType === 'start' || corrType === 'both') && !corrStart) { setCorrError('Please enter the corrected clock-in time.'); return }
    if ((corrType === 'end'   || corrType === 'both') && !corrEnd)   { setCorrError('Please enter the corrected clock-out time.'); return }
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
      setCorrError(err?.response?.data?.error ?? 'Failed to submit. Please try again.')
    } finally { setCorrSaving(false) }
  }

  const handleToggle = async () => {
    if (!isOnline || loading) return
    setError('')
    if (!isClockedIn) {
      if (!selectedJobId && !manualLocation.trim()) {
        setShowManual(true)
        setError(t('home.noLocation'))
        return
      }
      const selectedJob = jobs.find((j) => String(j.id) === String(selectedJobId))
      const isFarFromJob = selectedJob
        && selectedJob.distance_meters != null
        && selectedJob.clock_in_radius_meters != null
        && selectedJob.distance_meters > selectedJob.clock_in_radius_meters

      if (selectedJobId && isFarFromJob) {
        handleStartTraveling()
      } else if (selectedJobId && selectedJob?.is_recurring_maintenance && !forceVisitPicker) {
        finalizeVisit({})
      } else {
        resetVisitFields()
        setVisitStep(1)
        setVisitModal(true)
      }
    } else {
      setLoading(true)
      try {
        await dayEnd({ lat: position?.lat, lng: position?.lng })
        setTimeclockData({ statusLabel: 'done', currentEntry: null, activeJob: null, dayStarted: true })
      } finally { setLoading(false) }
    }
  }

  const handleStartTraveling = async () => {
    setLoading(true)
    try {
      const data = await setTraveling({
        job_id:   parseInt(selectedJobId),
        lat:      position?.lat      ?? null,
        lng:      position?.lng      ?? null,
        accuracy: position?.accuracy ?? null,
      })
      setTimeclockData(data.timeclock)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('home.travelStartError'))
    } finally { setLoading(false) }
  }

  const openArrival = () => {
    setError('')
    if (activeJob?.is_recurring_maintenance && !forceVisitPicker) {
      finalizeVisit({})
      return
    }
    resetVisitFields()
    setVisitStep(1)
    setVisitModal(true)
  }

  const openEstimatePicker = () => {
    setVisitStep(2)
    setLoadingVisitEstimates(true)
    listEstimates({ job_id: selectedJobId, active: 1 })
      .then((d) => setVisitEstimates(d.estimates ?? []))
      .catch(() => setVisitEstimates([]))
      .finally(() => setLoadingVisitEstimates(false))
  }

  const handlePickCategory = (value) => {
    setVisitCategory(value)
    if (value === 'estimate') {
      openEstimatePicker()
    } else {
      setVisitStep(2)
    }
  }

  const finalizeVisit = (fields = {}) => {
    if (statusLabel === 'traveling') return performArrival(fields)
    return performClockIn(fields)
  }

  const performClockIn = async (fields = {}) => {
    setVisitModal(false)
    setLoading(true)
    try {
      let jobId = selectedJobId ? parseInt(selectedJobId) : null
      if (!jobId && manualLocation.trim()) {
        const reg = await registerJob({
          name:     manualLocation.trim(),
          lat:      position?.lat      ?? null,
          lng:      position?.lng      ?? null,
          accuracy: position?.accuracy ?? null,
        })
        jobId = reg.id
      }
      const data = await dayStart({
        job_id:   jobId,
        lat:      position?.lat      ?? null,
        lng:      position?.lng      ?? null,
        accuracy: position?.accuracy ?? null,
        ...fields,
      })
      setTimeclockData({ statusLabel: data.statusLabel, currentEntry: data.currentEntry, activeJob: data.activeJob, dayStarted: true })
      setShowManual(false)
      setManualLocation('')
      setForceVisitPicker(false)
    } catch (err) {
      setError(err?.response?.data?.error ?? t('home.clockInError'))
    } finally { setLoading(false) }
  }

  const performArrival = async (fields = {}) => {
    setVisitModal(false)
    setLoading(true)
    try {
      const data = await markArrival({
        job_id:   parseInt(selectedJobId),
        lat:      position?.lat      ?? null,
        lng:      position?.lng      ?? null,
        accuracy: position?.accuracy ?? null,
        ...fields,
      })
      setTimeclockData(data.timeclock)
      setForceVisitPicker(false)
      if (data.within_radius === false) {
        setError(t('home.arrivalOutOfRadius', { distance: data.distance_meters }))
      }
    } catch (err) {
      setError(err?.response?.data?.error ?? t('home.arrivalError'))
    } finally { setLoading(false) }
  }


  const dateFnsLocale = i18n.language.startsWith('es') ? es : enUS
  const now      = new Date()
  const mapPos   = position ? [position.lat, position.lng] : null
  const config   = STATUS_CONFIG[statusLabel] ?? null

  const displayLocation = activeJob?.name
    ?? (currentEntry?.notes ? currentEntry.notes.replace('Location: ', '') : null)
    ?? locationLabel

  const selectedJobObj = jobs.find((j) => String(j.id) === String(selectedJobId))

  return (
    <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-6 w-full">

      {/* ── CLOCK SECTION — full width on mobile, left col on desktop ── */}
      <div className="flex flex-col items-center gap-4 lg:gap-8 lg:py-2">

        {/* Header: greeting + date, centered */}
        <div className="w-full text-center select-none">
          <p className="text-xl lg:text-2xl font-bold text-gray-900 leading-tight">
            {t('home.welcome', { name: firstName })}
          </p>
          <p className="text-sm lg:text-base text-gray-400 mt-0.5">
            {t('home.todayIs', { date: format(now, 'EEEE, MMMM d', { locale: dateFnsLocale }) })}
          </p>
        </div>

        {/* Today's total + Clock button — side by side on mobile, stacked on desktop */}
        <div className="flex items-center justify-between w-full px-1 lg:flex-col lg:gap-8">
          <div className="text-left lg:text-center">
            <p className="text-[10px] tracking-widest text-gray-400 uppercase font-semibold mb-1">{t('home.todaysTotal')}</p>
            <p className={`text-3xl lg:text-5xl font-bold tabular-nums leading-none ${dayTotal > 0 ? 'text-gray-900' : 'text-gray-200'}`}>
              {formatElapsed(dayTotal)}
            </p>
          </div>

          <div className="relative flex items-center justify-center shrink-0">
            {isClockedIn && <span className="absolute w-28 h-28 lg:w-60 lg:h-60 rounded-full animate-ping bg-red-400/20" />}
            <button
              onClick={handleToggle}
              disabled={loading || !isOnline}
              className={`relative w-24 h-24 lg:w-52 lg:h-52 rounded-full flex flex-col items-center justify-center gap-1 lg:gap-2 text-white font-semibold shadow-2xl transition-all duration-300 active:scale-95 disabled:opacity-50 ring-8 lg:ring-[10px]
                ${isClockedIn
                  ? 'bg-red-500 ring-red-100 shadow-red-300/50'
                  : 'bg-brand-500 ring-brand-100 shadow-brand-300/50'
                }`}
            >
              {loading
                ? <Spinner size="lg" />
                : <>
                    {isClockedIn
                      ? <svg className="w-7 h-7 lg:w-12 lg:h-12" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                      : <svg className="w-7 h-7 lg:w-12 lg:h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    }
                    <span className="text-[11px] lg:text-base font-bold tracking-wide">
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
          </div>
        )}

        {/* Traveling — show "I've Arrived" once clocked in and on the way */}
        {isClockedIn && statusLabel === 'traveling' && (
          <div className="w-full flex flex-col items-center gap-2">
            <button onClick={openArrival} disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-sky-500 text-white font-bold text-base shadow-lg active:bg-sky-600 transition-colors disabled:opacity-50">
              <LocationPinIcon className="w-5 h-5" />
              {t('home.iveArrived')}
            </button>
            {activeJob?.is_recurring_maintenance && !forceVisitPicker && (
              <button onClick={() => setForceVisitPicker(true)} className="text-xs text-gray-400 hover:text-brand-500 transition-colors">
                {t('visitType.needsEstimateOrEmergency')}
              </button>
            )}
          </div>
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

          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2">
              {isClockedIn
                ? (statusLabel === 'traveling' ? t('home.headingTo') : t('home.clockedInAt'))
                : t('home.selectLocation')}
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
                    onChange={(e) => { setSelectedJobId(e.target.value); setShowManual(false); setError(''); setForceVisitPicker(false) }}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 appearance-none"
                  >
                    <option value="">{t('home.selectJobSite')}</option>
                    {groupJobsByCompany(jobs).map(({ company, jobs: groupJobs }) => (
                      <optgroup key={company} label={company}>
                        {groupJobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name}{j.distance_meters != null
                              ? ` · ${j.distance_meters < 1000 ? Math.round(j.distance_meters) + 'm' : (j.distance_meters / 1000).toFixed(1) + 'km'}`
                              : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                </div>
                {selectedJobObj?.is_recurring_maintenance && !forceVisitPicker && (
                  <button onClick={() => setForceVisitPicker(true)} className="text-xs text-gray-400 hover:text-brand-500 transition-colors text-left">
                    {t('visitType.needsEstimateOrEmergency')}
                  </button>
                )}
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
                    {manualLocation.trim() && (
                      <p className="text-xs text-brand-500">{t('visitType.pendingReviewNotice')}</p>
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
      </div>

      {/* ── Shift detail bottom sheet ─────────────────────────── */}
      {detailSheet && (() => {
        const e = detailSheet
        const hasReq = myRequests.some(r => String(r.entry_id) === String(e.id) && r.status === 'pending')
        const cfg = ENTRY_CFG[e.status_label] ?? ENTRY_CFG.done
        const durMs = e.end_time ? new Date(e.end_time) - new Date(e.start_time) : 0
        const dh = Math.floor(durMs / 3600000)
        const dm = Math.floor((durMs % 3600000) / 60000)
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
                  <p className="text-sm text-gray-400 font-medium">{format(new Date(e.start_time), 'MMM d, yyyy')}</p>
                </div>
                <div className="bg-gray-50 rounded-2xl px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Clock In</p>
                      <p className="text-2xl font-bold text-gray-900">{format(new Date(e.start_time), 'h:mm a')}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Clock Out</p>
                      <p className={`text-2xl font-bold ${e.end_time ? 'text-gray-900' : 'text-orange-400'}`}>
                        {e.end_time ? format(new Date(e.end_time), 'h:mm a') : 'In Progress'}
                      </p>
                    </div>
                  </div>
                  {durMs > 0 && (
                    <div className="border-t border-gray-200 pt-3 mt-3 text-center">
                      <p className="text-sm font-semibold text-gray-600">{dh > 0 ? `${dh}h ${dm}m` : `${dm}m`} total</p>
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
                        <p className="text-sm font-semibold text-amber-700">Modification Pending Review</p>
                        <p className="text-xs text-amber-500 mt-0.5">Your administrator is reviewing this request.</p>
                      </div>
                    : <button onClick={() => { setDetailSheet(null); openCorrection(e) }}
                        className="w-full bg-brand-500 text-white font-semibold py-3.5 rounded-2xl text-sm active:bg-brand-600 transition-colors">
                        Request Modification
                      </button>
                )}
              </div>
              <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        )
      })()}

      {/* ── Modification questionnaire ─────────────────────────── */}
      <Modal isOpen={!!corrModal} onClose={() => setCorrModal(null)} title="Request Modification">
        {corrModal && (
          <div className="flex flex-col gap-4">
            <div className={`rounded-xl px-4 py-3 ${(ENTRY_CFG[corrModal.status_label] ?? ENTRY_CFG.done).bg}`}>
              <p className={`text-sm font-semibold capitalize ${(ENTRY_CFG[corrModal.status_label] ?? ENTRY_CFG.done).text}`}>
                {corrModal.status_label?.replace('_', ' ')} · {format(new Date(corrModal.start_time), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {format(new Date(corrModal.start_time), 'h:mm a')} → {corrModal.end_time ? format(new Date(corrModal.end_time), 'h:mm a') : 'In Progress'}
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
                <p className="text-sm font-semibold text-gray-800">What needs to be corrected?</p>
                <div className="grid grid-cols-2 gap-2">
                  {CORR_TYPES.map(opt => (
                    <button key={opt.value} onClick={() => setCorrType(opt.value)}
                      className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border-2 text-sm font-semibold transition-colors text-left
                        ${corrType === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 active:border-gray-300 bg-white'}`}>
                      <span className="text-base">{opt.icon}</span>
                      <span className="leading-tight">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" fullWidth onClick={() => setCorrModal(null)}>Cancel</Button>
                  <Button fullWidth disabled={!corrType} onClick={() => setCorrStep(2)}>Next →</Button>
                </div>
              </>
            )}
            {corrStep === 2 && (
              <>
                {(corrType === 'start' || corrType === 'both') && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Correct Clock-In Time</label>
                    <input type="datetime-local" value={corrStart} onChange={e => setCorrStart(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
                  </div>
                )}
                {(corrType === 'end' || corrType === 'both') && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Correct Clock-Out Time</label>
                    <input type="datetime-local" value={corrEnd} onChange={e => setCorrEnd(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {corrType === 'job'   ? 'What is the correct job site?' :
                     corrType === 'other' ? 'Describe what needs to change' :
                     'Why is this change needed?'}{' *'}
                  </label>
                  <textarea rows={3} value={corrReason} onChange={e => setCorrReason(e.target.value)}
                    placeholder={
                      corrType === 'job'   ? 'e.g. Should be Smith Residence, not Johnson Ave' :
                      corrType === 'other' ? 'Describe the issue...' :
                      'e.g. I forgot to clock back in after lunch'
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none" />
                </div>
                {corrError && <p className="text-sm text-red-600">{corrError}</p>}
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" fullWidth onClick={() => setCorrStep(1)}>← Back</Button>
                  <Button fullWidth loading={corrSaving} onClick={handleSubmitCorrection}>Submit</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Visit classification picker — shown right before clocking in ──── */}
      <Modal isOpen={visitModal} onClose={() => setVisitModal(false)} title={t('visitType.title')}>
        {visitStep === 1 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-gray-800">
              {selectedJobId ? t('visitType.existingLocation') : t('visitType.newLocation')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(selectedJobId ? EXISTING_CATEGORIES : NEW_LOCATION_CATEGORIES).map((opt) => (
                <button key={opt.value}
                  onClick={() => handlePickCategory(opt.value)}
                  className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border-2 text-sm font-semibold transition-colors text-left border-gray-200 text-gray-600 active:border-brand-300 bg-white">
                  {opt.icon}
                  <span className="leading-tight">{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Work Order fields */}
        {visitStep === 2 && visitCategory === 'work_order' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('visitType.workOrderNumber')}</label>
              <input value={workOrderNumber} onChange={(e) => setWorkOrderNumber(e.target.value)} autoFocus
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('visitType.description')}</label>
              <textarea rows={3} value={fieldDescription} onChange={(e) => setFieldDescription(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" fullWidth onClick={() => setVisitStep(1)}>{t('visitType.back')}</Button>
              <Button fullWidth
                disabled={!workOrderNumber.trim() || !fieldDescription.trim()}
                onClick={() => finalizeVisit({ visit_category: 'work_order', work_order_number: workOrderNumber.trim(), visit_description: fieldDescription.trim() })}>
                {t('visitType.confirm')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Estimate list (existing job) */}
        {visitStep === 2 && visitCategory === 'estimate' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-gray-800">{t('visitType.selectEstimate')}</p>
            {loadingVisitEstimates ? (
              <div className="flex justify-center py-6"><Spinner size="md" /></div>
            ) : visitEstimates.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{t('visitType.noEstimates')}</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {visitEstimates.map((est) => (
                  <button key={est.id} onClick={() => { setPickedEstimateId(est.id); setVisitStep(3) }}
                    className="w-full text-left px-4 py-3 rounded-2xl border-2 border-gray-200 active:border-brand-300 bg-white transition-colors">
                    <p className="text-sm font-semibold text-gray-800">#{est.estimate_number}</p>
                    {est.description && <p className="text-xs text-gray-400 mt-0.5">{est.description}</p>}
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" fullWidth onClick={() => setVisitStep(1)}>{t('visitType.back')}</Button>
          </div>
        )}

        {/* Step 2 — new-location fields (Regular / Estimate unknown / Emergency / Warranty / Add-On) */}
        {visitStep === 2 && visitCategory && visitCategory !== 'work_order' && visitCategory !== 'estimate' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                {visitCategory === 'add_on' ? t('visitType.originalEstimateDescription') : t('visitType.description')}
              </label>
              <textarea rows={3} value={fieldDescription} onChange={(e) => setFieldDescription(e.target.value)} autoFocus
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500 resize-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{t('visitType.engineer')}</label>
              <input value={engineerName} onChange={(e) => setEngineerName(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" fullWidth onClick={() => setVisitStep(1)}>{t('visitType.back')}</Button>
              <Button fullWidth
                disabled={!fieldDescription.trim() || !engineerName.trim()}
                onClick={() => finalizeVisit({ visit_category: visitCategory, engineer_name: engineerName.trim(), visit_description: fieldDescription.trim() })}>
                {t('visitType.confirm')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Estimate sub-type (existing job, known estimate) */}
        {visitStep === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-gray-800">{t('visitType.selectVisitKind')}</p>
            <div className="grid grid-cols-2 gap-2">
              {ESTIMATE_SUBTYPES.map((opt) => (
                <button key={opt.value}
                  onClick={() => finalizeVisit({ visit_category: 'estimate', estimate_id: pickedEstimateId, estimate_subtype: opt.value })}
                  className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border-2 text-sm font-semibold transition-colors text-left border-gray-200 text-gray-600 active:border-brand-300 bg-white">
                  {opt.icon}
                  <span className="leading-tight">{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>
            <Button variant="secondary" fullWidth onClick={() => setVisitStep(2)}>{t('visitType.back')}</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

const ENTRY_DOT = {
  traveling: 'bg-sky-500', working: 'bg-green-500', lunch: 'bg-amber-500',
  material_run: 'bg-violet-500', waiting: 'bg-orange-500', done: 'bg-gray-400',
}
const ENTRY_CFG = {
  traveling:    { dot: 'bg-sky-500',    bg: 'bg-sky-50',    text: 'text-sky-700'    },
  working:      { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700'  },
  lunch:        { dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700'  },
  material_run: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' },
  waiting:      { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' },
  done:         { dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-500'   },
}
const CORR_TYPES = [
  { value: 'start', icon: '🕐', label: 'Clock-In Time' },
  { value: 'end',   icon: '🕑', label: 'Clock-Out Time' },
  { value: 'both',  icon: '⏱',  label: 'Both Times' },
  { value: 'job',   icon: '📍', label: 'Job Site' },
  { value: 'other', icon: '💬', label: 'Something Else' },
]
const EXISTING_CATEGORIES = [
  { value: 'work_order', icon: <DocumentIcon />,  labelKey: 'visitType.workOrder' },
  { value: 'estimate',   icon: <ClipboardIcon />, labelKey: 'visitType.estimate' },
]
const NEW_LOCATION_CATEGORIES = [
  { value: 'regular',          icon: <WrenchIcon />,    labelKey: 'visitType.regular' },
  { value: 'estimate_unknown', icon: <ClipboardIcon />, labelKey: 'visitType.estimateUnknown' },
  { value: 'add_on',           icon: <PlusIcon />,      labelKey: 'visitType.addOn' },
  { value: 'emergency',        icon: <AlertIcon />,     labelKey: 'visitType.emergency' },
  { value: 'warranty',         icon: <ShieldIcon />,    labelKey: 'visitType.warranty' },
]
const ESTIMATE_SUBTYPES = [
  { value: 'regular',   icon: <WrenchIcon />, labelKey: 'visitType.regular' },
  { value: 'add_on',    icon: <PlusIcon />,   labelKey: 'visitType.addOn' },
  { value: 'emergency', icon: <AlertIcon />,  labelKey: 'visitType.emergency' },
  { value: 'warranty',  icon: <ShieldIcon />, labelKey: 'visitType.warranty' },
]
