import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import LangSwitcher from '../ui/LangSwitcher'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'
import LiveClock from '../ui/LiveClock'

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
)
const EmployeesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
)
const TimesheetIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9"/>
    <path strokeLinecap="round" d="M12 7v5l3.5 3.5"/>
  </svg>
)
const PayrollIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path strokeLinecap="round" d="M2 10h20"/>
    <path strokeLinecap="round" d="M6 15h4M14 15h4"/>
  </svg>
)
const ReportsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6"/>
  </svg>
)
const LoansIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 .9-4 2s1.79 2 4 2 4 .9 4 2-1.79 2-4 2m0-8v1m0 9v1M8 12H4m16 0h-4"/>
    <circle cx="12" cy="12" r="9"/>
  </svg>
)
const HRIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
  </svg>
)
const DocumentsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
  </svg>
)
const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
    <polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/>
    <line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <line strokeLinecap="round" x1="3" y1="6" x2="21" y2="6"/>
    <line strokeLinecap="round" x1="3" y1="12" x2="21" y2="12"/>
    <line strokeLinecap="round" x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

function NavItem({ to, icon, label, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }
    >
      {icon}{label}
    </NavLink>
  )
}

function SidebarLogo({ label }) {
  return (
    <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
      <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
        style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
      <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{label}</p>
    </div>
  )
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const { refreshToken, logout, user } = useAuthStore()
  const { t } = useTranslation()

  const NAV = [
    { to: '/admin',            icon: <DashboardIcon />, label: t('nav.dashboard'), end: true },
    { to: '/admin/jobs',       icon: <JobsIcon />,      label: t('nav.jobs')               },
    { to: '/admin/employees',  icon: <EmployeesIcon />, label: t('nav.employees')           },
    { to: '/admin/timesheets', icon: <TimesheetIcon />, label: t('nav.timesheets')          },
    { to: '/admin/payroll',    icon: <PayrollIcon />,   label: t('nav.payroll')             },
    { to: '/admin/loans',      icon: <LoansIcon />,      label: t('nav.loans')      },
    { to: '/admin/documents',  icon: <DocumentsIcon />, label: t('nav.documents')  },
    { to: '/admin/hr',         icon: <HRIcon />,        label: t('nav.hrDocs')     },
    { to: '/admin/reports',    icon: <ReportsIcon />,   label: t('nav.reports')    },
  ]

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  const close = () => setDrawerOpen(false)

  const SidebarContent = ({ onNavClick }) => (
    <>
      <SidebarLogo label={t('nav.fieldclock')} />
      <div className="px-5 py-2.5 border-b border-brand-700/40">
        <p className="text-brand-100/90 text-sm font-semibold">{user?.name}</p>
        <p className="text-brand-400/60 text-xs">{t('role.admin')}</p>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map((item) => <NavItem key={item.to} {...item} onClick={onNavClick} />)}
      </nav>
      <div className="border-t border-brand-700/60">
        <div className="px-5 py-3">
          <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
          <LogoutIcon /> {t('nav.signOut')}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-svh bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={close}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-brand-900 text-white flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-4 border-b border-brand-700/60">
              <SidebarLogo label={t('nav.fieldclock')} />
              <button onClick={close} className="text-brand-100/60 hover:text-white p-1 text-xl">✕</button>
            </div>
            <div className="px-5 py-2.5 border-b border-brand-700/40">
              <p className="text-brand-100/90 text-sm font-semibold">{user?.name}</p>
              <p className="text-brand-400/60 text-xs">{t('role.admin')}</p>
            </div>
            <nav className="flex-1 py-3 overflow-y-auto">
              {NAV.map((item) => <NavItem key={item.to} {...item} onClick={close} />)}
            </nav>
            <div className="border-t border-brand-700/60">
              <div className="px-5 py-3">
                <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
              </div>
              <button onClick={handleLogout}
                className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
                <LogoutIcon /> {t('nav.signOut')}
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 lg:ml-60">
        <OfflineBanner />
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 sticky top-0 z-30">
          <button onClick={() => setDrawerOpen(true)} className="p-1 text-brand-100/80"><MenuIcon /></button>
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <LiveClock className="text-white/80" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 w-full">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
