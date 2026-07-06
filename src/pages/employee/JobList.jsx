import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import JobCard from '../../components/employee/JobCard'
import Spinner from '../../components/ui/Spinner'
import { listJobs } from '../../api/jobs'

export default function JobList() {
  const { t } = useTranslation()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    listJobs({ assigned: true, status: 'active' })
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => setError(t('jobs.loadError')))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  return (
    <div className="px-4 pt-6 pb-4 flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('jobs.title')}</h1>
        <button onClick={load} className="text-sm text-brand-500 hover:underline">{t('jobs.refresh')}</button>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}
      {error && <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {!loading && !error && jobs.length === 0 && (
        <p className="text-center text-gray-400 py-12 text-sm">{t('jobs.noJobs')}</p>
      )}
      {!loading && jobs.map((job) => (
        <JobCard key={job.id} job={job} showDistance={false} onSelect={null} />
      ))}
    </div>
  )
}
