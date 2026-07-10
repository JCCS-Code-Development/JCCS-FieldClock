import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import PullToRefresh from '../ui/PullToRefresh'
import PendingDocsBanner from '../PendingDocsBanner'
import LangSwitcher from '../ui/LangSwitcher'
import { useTimeclockStore } from '../../store/timeclockStore'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'
import LiveClock from '../ui/LiveClock'

const STATUS_COLORS = {
  traveling:    'bg-sky-500',
  working:      'bg-green-500',
  lunch:        'bg-amber-500',
  material_run: 'bg-violet-600',
  waiting:      'bg-orange-500',
  done:         'bg-gray-400',
}

// ── Icons ─────────────────────────────────────────────────────────
const ClockIcon = ({ s = 'w-6 h-6' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>
const JobsIcon  = ({ s = 'w-6 h-6' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
const PayIcon   = ({ s = 'w-6 h-6' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M2 10h20M6 15h4M14 15h4"/></svg>
const DocsIcon  = ({ s = 'w-6 h-6' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
const LogoutIcon = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/><line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/></svg>

// ── Desktop sidebar nav item ───────────────────────────────────────
function SidebarItem({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }>
      <Icon /> {label}
    </NavLink>
  )
}

export default function EmployeeLayout() {
  const [profileOpen, setProfileOpen] = useState(false)
  const { statusLabel } = useTimeclockStore()
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const dotColor = statusLabel ? STATUS_COLORS[statusLabel] : null
  const statusKey = statusLabel && statusLabel !== 'done' ? statusLabel : null

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  const NAV = [
    { to: '/',        icon: ClockIcon, label: t('nav.clock'),       end: true },
    { to: '/jobs',    icon: JobsIcon,  label: t('nav.jobs') },
    { to: '/my-pay',  icon: PayIcon,   label: t('nav.myPay') },
    { to: '/my-docs', icon: DocsIcon,  label: t('nav.myDocuments') },
  ]

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-brand-700/60">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('nav.fieldclock')}</p>
        </div>
        <div className="px-5 py-2.5 border-b border-brand-700/40">
          <p className="text-brand-100 text-sm font-semibold">{t('home.welcome', { name: user?.name?.split(' ')[0] })}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {dotColor && statusKey && <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
            <p className="text-brand-400/70 text-xs">
              {statusKey ? t(`status.${statusKey}`) : t('role.employee')}
            </p>
          </div>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(item => <SidebarItem key={item.to} {...item} />)}
        </nav>
        <div className="border-t border-brand-700/60">
          <div className="px-5 py-3">
            <LangSwitcher className="text-brand-400/70 hover:text-brand-100" />
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-5 py-3 text-sm text-brand-100/70 hover:text-white transition-colors w-full border-t border-brand-700/40">
            <LogoutIcon s="w-5 h-5" /> {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 overflow-hidden">
        <OfflineBanner />

        {/* Mobile top bar — fixed so it never moves on iOS overscroll */}
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 fixed top-0 inset-x-0 z-30">
          {/* Left: logo */}
          <img src="/jccs-logo.jpg" alt="JCCS" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />

          {/* Right: status + clock + avatar */}
          <div className="flex items-center gap-3">
            {statusKey && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${dotColor} text-white`}>
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                {t(`status.${statusKey}`)}
              </span>
            )}
            <LiveClock className="text-white/60 text-xs" />
            {/* Profile avatar — opens logout sheet */}
            <button onClick={() => setProfileOpen(true)}
              className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0 active:bg-brand-400 transition-colors">
              {user?.name?.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        {/* Spacer below fixed header (mobile only) */}
        <div className="lg:hidden h-[52px] shrink-0" />

        <PullToRefresh className="flex-1 flex flex-col"
          style={{ paddingBottom: 'max(96px, calc(64px + env(safe-area-inset-bottom)))' }}>
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col p-4 lg:p-6">
            <Outlet />
          </div>
        </PullToRefresh>

        {/* Document reminder — sits just above the bottom nav */}
        <PendingDocsBanner />

        {/* ── Mobile bottom nav ────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 6px rgba(0,0,0,0.06)' }}>
          <NavLink to="/" end
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[11px] font-semibold transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }>
            {({ isActive }) => (
              <>
                <span className="relative">
                  <ClockIcon />
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
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[11px] font-semibold transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }>
            <JobsIcon /><span>{t('nav.jobs')}</span>
          </NavLink>

          <NavLink to="/my-pay"
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[11px] font-semibold transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }>
            <PayIcon /><span>{t('nav.myPay')}</span>
          </NavLink>

          <NavLink to="/my-docs"
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[11px] font-semibold transition-colors ${isActive ? 'text-brand-500' : 'text-gray-400'}`
            }>
            <DocsIcon /><span>{t('nav.myDocuments')}</span>
          </NavLink>
        </nav>

        {/* ── Profile bottom sheet (logout + language) ─────── */}
        {profileOpen && (
          <div className="fixed inset-0 z-[1100] lg:hidden flex flex-col justify-end"
            onClick={() => setProfileOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              {/* User info */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-11 h-11 rounded-full bg-brand-500 flex items-center justify-center text-white text-base font-bold shrink-0">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {dotColor && statusKey && <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />}
                    <p className="text-xs text-gray-400">
                      {statusKey ? t(`status.${statusKey}`) : t('role.employee')}
                    </p>
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-gray-700">Language</span>
                  <LangSwitcher className="text-gray-500" />
                </div>
                <button onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold active:bg-red-100 transition-colors">
                  <LogoutIcon s="w-4 h-4" /> {t('nav.signOut')}
                </button>
              </div>
              <div style={{ height: 'max(12px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
