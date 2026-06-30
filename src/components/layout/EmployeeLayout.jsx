import { Outlet, NavLink } from 'react-router-dom'
import OfflineBanner from '../OfflineBanner'
import { useTimeclockStore } from '../../store/timeclockStore'

const STATUS_COLORS = {
  traveling:    'bg-sky-500',
  working:      'bg-green-600',
  lunch:        'bg-amber-500',
  material_run: 'bg-violet-600',
  waiting:      'bg-orange-500',
  done:         'bg-gray-500',
}

export default function EmployeeLayout() {
  const { statusLabel } = useTimeclockStore()
  const dotColor = statusLabel ? STATUS_COLORS[statusLabel] : null

  return (
    <div className="flex flex-col min-h-svh bg-gray-50">
      <OfflineBanner />

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-30 safe-area-pb">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-500' : 'text-gray-500'}`
          }
        >
          <span className="relative text-xl leading-none">
            ⏱
            {dotColor && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor} border-2 border-white`} />
            )}
          </span>
          Clock
        </NavLink>

        <NavLink
          to="/jobs"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-500' : 'text-gray-500'}`
          }
        >
          <span className="text-xl leading-none">📋</span>
          Jobs
        </NavLink>

        <NavLink
          to="/my-pay"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-500' : 'text-gray-500'}`
          }
        >
          <span className="text-xl leading-none">💵</span>
          My Pay
        </NavLink>
      </nav>
    </div>
  )
}
