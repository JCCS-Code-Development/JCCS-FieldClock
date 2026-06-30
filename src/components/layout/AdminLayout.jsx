import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import OfflineBanner from '../OfflineBanner'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'

const NAV = [
  { to: '/admin',           label: 'Dashboard',   icon: '📊', end: true },
  { to: '/admin/jobs',      label: 'Jobs',         icon: '📍' },
  { to: '/admin/work-orders', label: 'Work Orders', icon: '📋' },
  { to: '/admin/employees', label: 'Employees',    icon: '👷' },
  { to: '/admin/timesheets', label: 'Timesheets',  icon: '⏱' },
  { to: '/admin/payroll',   label: 'Payroll',      icon: '💵' },
  { to: '/admin/invoices',  label: 'Invoices',     icon: '🧾' },
  { to: '/admin/reports',   label: 'Reports',      icon: '📈' },
]

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const { refreshToken, logout } = useAuthStore()

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-56 bg-brand-900 text-white shrink-0">
        <div className="px-5 py-6 border-b border-brand-700">
          <p className="font-bold text-lg text-white leading-none">FieldClock</p>
          <p className="text-brand-100 text-xs mt-0.5">Admin</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-700 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="px-5 py-4 text-sm text-brand-100 hover:text-white text-left border-t border-brand-700 transition-colors"
        >
          Sign Out
        </button>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-brand-900 text-white flex flex-col">
            <div className="px-5 py-6 border-b border-brand-700 flex items-center justify-between">
              <div>
                <p className="font-bold text-lg text-white">FieldClock</p>
                <p className="text-brand-100 text-xs">Admin</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-brand-100 p-1">✕</button>
            </div>
            <nav className="flex-1 py-3">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-700 hover:text-white'
                    }`
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={handleLogout}
              className="px-5 py-4 text-sm text-brand-100 hover:text-white text-left border-t border-brand-700"
            >
              Sign Out
            </button>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        {/* Mobile top bar */}
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 sticky top-0 z-30">
          <button onClick={() => setDrawerOpen(true)} className="p-1 text-xl">☰</button>
          <span className="font-bold">FieldClock Admin</span>
          <div className="w-8" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
