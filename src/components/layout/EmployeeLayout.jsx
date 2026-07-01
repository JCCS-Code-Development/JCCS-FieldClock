import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import LangSwitcher from '../ui/LangSwitcher'
import { useTimeclockStore } from '../../store/timeclockStore'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'

const STATUS_COLORS = {
  traveling:    'bg-sky-500',
  working:      'bg-green-500',
  lunch:        'bg-amber-500',
  material_run: 'bg-violet-600',
  waiting:      'bg-orange-500',
  done:         'bg-gray-400',
}

// ── Icons ────────────────────────────────────────────────
const ClockIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9"/>
    <path strokeLinecap="round" d="M12 7v5l3.5 3.5"/>
  </svg>
)
const JobsIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
)
const PayIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path strokeLinecap="round" d="M2 10h20M6 15h4M14 15h4"/>
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

function NavItem({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }
    >
      <Icon /> {label}
    </NavLink>
  )
}

function SidebarInner({ user, statusLabel, dotColor, onLogout, onNavClick, t }) {
  const statusKey = statusLabel && statusLabel !== 'done' ? statusLabel : null

  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-brand-700/60">
        <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
          style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
        <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('nav.fieldclock')}</p>
      </div>

      {/* User info */}
      <div className="px-5 py-2.5 border-b border-brand-700/40">
        <p className="text-brand-100/90 text-sm font-semibold">{user?.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {dotColor && statusKey && (
            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
          )}
          <p className="text-brand-400/70 text-xs">
            {statusKey ? t(`status.${statusKey}`) : t('role.employee')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <NavItem to="/"       icon={ClockIcon} label={t('nav.clock')}  end onClick={onNavClick} />
        <NavItem to="/jobs"   icon={JobsIcon}  label={t('nav.jobs')}       onClick={onNavClick} />
        <NavItem to="/my-pay" icon={PayIcon}   label={t('nav.myPay')}      onClick={onNavClick} />
      </nav>

      {/* Lang + Logout */}
      <div className="border-t border-brand-700/60">
        <div className="px-5 py-3">
          <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
        </div>
        <button onClick={onLogout}
          className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
          <LogoutIcon /> {t('nav.signOut')}
        </button>
      </div>
    </>
  )
}

export default function EmployeeLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { statusLabel } = useTimeclockStore()
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const dotColor = statusLabel ? STATUS_COLORS[statusLabel] : null

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  const close = () => setDrawerOpen(false)
  const innerProps = { user, statusLabel, dotColor, onLogout: handleLogout, t }

  return (
    <div className="flex min-h-svh bg-gray-50">

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <SidebarInner {...innerProps} />
      </aside>

      {/* ── Mobile drawer ────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={close}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-brand-900 text-white flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-4 border-b border-brand-700/60">
              <div className="px-5 py-5">
                <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
                  style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
                <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('nav.fieldclock')}</p>
              </div>
              <button onClick={close} className="text-brand-100/60 hover:text-white p-1 text-xl">✕</button>
            </div>
            <div className="px-5 py-2.5 border-b border-brand-700/40">
              <p className="text-brand-100/90 text-sm font-semibold">{user?.name}</p>
              <p className="text-brand-400/70 text-xs">{t('role.employee')}</p>
            </div>
            <nav className="flex-1 py-3 overflow-y-auto">
              <NavItem to="/"       icon={ClockIcon} label={t('nav.clock')}  end onClick={close} />
              <NavItem to="/jobs"   icon={JobsIcon}  label={t('nav.jobs')}       onClick={close} />
              <NavItem to="/my-pay" icon={PayIcon}   label={t('nav.myPay')}      onClick={close} />
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

      {/* ── Content area ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60">
        <OfflineBanner />

        {/* Mobile top bar */}
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 sticky top-0 z-30">
          <button onClick={() => setDrawerOpen(true)} className="p-1 text-brand-100/80"><MenuIcon /></button>
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-y-auto pb-20 lg:pb-6 flex flex-col">
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col p-4 lg:p-6">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-30"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <NavLink to="/" end
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <ClockIcon className="w-6 h-6" />
                  {dotColor && (
                    <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dotColor} border-2 border-white`} />
                  )}
                </span>
                <span>{t('nav.clock')}</span>
              </>
            )}
          </NavLink>

          <NavLink to="/jobs"
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }
          >
            <JobsIcon className="w-6 h-6" />
            <span>{t('nav.jobs')}</span>
          </NavLink>

          <NavLink to="/my-pay"
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }
          >
            <PayIcon className="w-6 h-6" />
            <span>{t('nav.myPay')}</span>
          </NavLink>
        </nav>
      </div>
    </div>
  )
}
