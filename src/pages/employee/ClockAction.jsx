import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import JobCard from '../../components/employee/JobCard'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useGPS } from '../../hooks/useGPS'
import { useTimeclockStore } from '../../store/timeclockStore'
import { getNearbyJobs, listJobs } from '../../api/jobs'
import { setTraveling, markArrival } from '../../api/timeclock'

export default function ClockAction() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isArrival = searchParams.get('action') === 'arrival'

  const { position, error: gpsError, loading: gpsLoading, getPosition } = useGPS()
  const { setTimeclockData, activeJob } = useTimeclockStore()

  const [jobs, setJobs] = useState([])
  const [allJobs, setAllJobs] = useState([])
  const [showAll, setShowAll] = useState(false)
  const [selectedJob, setSelectedJob] = useState(isArrival ? activeJob : null)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [arrivalResult, setArrivalResult] = useState(null) // { within_radius, distance_meters }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { getPosition() }, [])

  useEffect(() => {
    if (!position) return
    setLoadingJobs(true)
    getNearbyJobs({ lat: position.lat, lng: position.lng, radius: 15 })
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false))
  }, [position])

  useEffect(() => {
    listJobs({ assigned: true, status: 'active' })
      .then((data) => setAllJobs(data.jobs ?? []))
      .catch(() => {})
  }, [])

  const handleConfirm = async () => {
    if (!selectedJob) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        job_id: selectedJob.id,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        accuracy: position?.accuracy ?? null,
      }
      let data
      if (isArrival) {
        data = await markArrival(payload)
        setArrivalResult({ within_radius: data.within_radius, distance_meters: data.distance_meters })
      } else {
        data = await setTraveling(payload)
      }
      setTimeclockData(data.timeclock)
      if (isArrival && !data.within_radius) return // stay on page to show warning
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Action failed. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const displayJobs = showAll ? allJobs : jobs
  const title = isArrival ? 'Mark Arrival' : 'Start Traveling'
  const subtitle = isArrival
    ? 'Confirm you have arrived at this jobsite'
    : 'Select the job you are heading to'

  return (
    <div className="px-4 pt-6 pb-6 flex flex-col gap-4 w-full">
      <div>
        <button onClick={() => navigate(-1)} className="text-brand-500 text-sm mb-3">← Back</button>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      {/* GPS status */}
      {gpsLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Spinner size="sm" /> Finding your location…
        </div>
      )}
      {gpsError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          ⚠️ GPS unavailable — showing all assigned jobs.
        </div>
      )}
      {position && position.accuracy > 500 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          ⚠️ Low GPS accuracy ({Math.round(position.accuracy)}m) — results may be approximate.
        </div>
      )}

      {/* Arrival out-of-radius warning */}
      {arrivalResult && !arrivalResult.within_radius && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          ⚠️ You appear to be <strong>{Math.round(arrivalResult.distance_meters)}m</strong> from the jobsite
          (allowed radius: {selectedJob?.clock_in_radius_meters}m). Arrival recorded. Admin can review.
          <div className="mt-2">
            <Button size="sm" onClick={() => navigate('/')}>Continue</Button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Job list */}
      {!arrivalResult && (
        <>
          {loadingJobs ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Spinner size="sm" /> Loading nearby jobs…
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {displayJobs.length === 0 && !gpsLoading && (
                  <p className="text-sm text-gray-400 text-center py-6">No jobs found.</p>
                )}
                {displayJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    selected={selectedJob?.id === job.id}
                    onSelect={setSelectedJob}
                    showDistance={!showAll}
                  />
                ))}
              </div>

              {!showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="text-sm text-brand-500 text-center py-2 hover:underline"
                >
                  View all assigned jobs →
                </button>
              )}
              {showAll && (
                <button
                  onClick={() => setShowAll(false)}
                  className="text-sm text-brand-500 text-center py-2 hover:underline"
                >
                  ← Show nearby only
                </button>
              )}
            </>
          )}

          <Button
            fullWidth
            size="lg"
            disabled={!selectedJob}
            loading={submitting}
            onClick={handleConfirm}
          >
            {isArrival ? '📍 Mark Arrival' : '🚗 Start Traveling'}
          </Button>
        </>
      )}
    </div>
  )
}
