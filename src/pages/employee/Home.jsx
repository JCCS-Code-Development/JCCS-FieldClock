import { useEffect } from 'react'
import ClockToggle from '../../components/employee/ClockToggle'
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
    <div className="w-full min-h-full flex flex-col px-4 pt-6 pb-4">
      <div className="mb-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{today}</p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">
          Hey, {user?.name?.split(' ')[0] ?? 'there'} 👋
        </h1>
      </div>
      <ClockToggle />
    </div>
  )
}
