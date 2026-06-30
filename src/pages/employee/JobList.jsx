import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import JobCard from '../../components/employee/JobCard'
import Spinner from '../../components/ui/Spinner'
import { listJobs } from '../../api/jobs'

export default function JobList() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    listJobs({ assigned: true, status: 'active' })
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => setError('Could not load jobs.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="px-4 pt-6 pb-4 flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Jobs</h1>
        <button onClick={load} className="text-sm text-brand-500 hover:underline">Refresh</button>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}
      {!loading && !error && jobs.length === 0 && (
        <p className="text-center text-gray-400 py-12 text-sm">No active jobs assigned.</p>
      )}
      {!loading && jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          showDistance={false}
          onSelect={() => navigate(`/jobs/${job.id}/work-orders`)}
        />
      ))}
    </div>
  )
}
