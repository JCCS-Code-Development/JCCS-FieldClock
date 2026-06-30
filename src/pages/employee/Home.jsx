import { useEffect } from 'react'
import ClockWidget from '../../components/employee/ClockWidget'
import { useTimeclockStore } from '../../store/timeclockStore'
import { getStatus } from '../../api/timeclock'
import { useAuthStore } from '../../store/authStore'
import { formatDate } from '../../utils/format'

export default function Home() {
  const { setTimeclockData } = useTimeclockStore()
  const { user } = useAuthStore()

  useEffect(() => {
    getStatus().then(setTimeclockData).catch(() => {})
  }, [])

  const today = formatDate(new Date().toISOString())

  return (
    <div className="px-4 pt-6 pb-4 flex flex-col gap-5 max-w-lg mx-auto">
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{today}</p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">
          Hey, {user?.name?.split(' ')[0] ?? 'there'} 👋
        </h1>
      </div>
      <ClockWidget />
    </div>
  )
}
