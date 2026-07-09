import ClockPanel from '../../components/employee/ClockPanel'
import { useAuthStore } from '../../store/authStore'
import JobList from './JobList'

export default function Home() {
  const user = useAuthStore((s) => s.user)
  const isSalaried = user?.pay_structure === 'salary'

  if (isSalaried) {
    return (
      <div className="flex-1 flex flex-col w-full">
        <div className="px-4 pt-5 pb-2">
          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-sm font-semibold text-indigo-800">Salaried Employee</p>
              <p className="text-xs text-indigo-600 mt-0.5">Your pay is fixed weekly — no clock-in required.</p>
            </div>
          </div>
        </div>
        <JobList />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col w-full">
      <ClockPanel />
    </div>
  )
}
