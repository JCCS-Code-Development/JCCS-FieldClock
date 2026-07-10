import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import OfflineBanner from '../OfflineBanner'
import LangSwitcher from '../ui/LangSwitcher'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'
import LiveClock from '../ui/LiveClock'

// ── Icons ─────────────────────────────────────────────────────────
const DashboardIcon  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const JobsIcon       = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
const EmployeesIcon  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const TimesheetIcon  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3.5 3.5"/></svg>
const PayrollIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M2 10h20M6 15h4M14 15h4"/></svg>
const ChecksIcon     = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="6" width="18" height="13" rx="2"/><path strokeLinecap="round" d="M3 10h18M7 14h3M14 14h3M7 17h2"/></svg>
const LoansIcon      = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 .9-4 2s1.79 2 4 2 4 .9 4 2-1.79 2-4 2m0-8v1m0 9v1M8 12H4m16 0h-4"/><circle cx="12" cy="12" r="9"/></svg>
const VendorsIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
const DocumentsIcon  = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
const HRIcon         = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg>
const ReportsIcon    = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6"/></svg>
const LogoutIcon     = ({ s = 'w-4 h-4' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/><line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/></svg>
const MoreDotsIcon   = ({ s = 'w-6 h-6' }) => <svg className={s} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>

// ── Desktop sidebar nav item ───────────────────────────────────────
function SidebarItem({ to, icon, label, end }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }>
      {icon}{label}
    </NavLink>
  )
}

export default function AdminLayout() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location   = useLocation()
  const navigate   = useNavigate()
  const { refreshToken, logout, user } = useAuthStore()
  const { t } = useTranslation()

  const PRIMARY = [
    { to: '/admin',            icon: <DashboardIcon />, label: t('nav.dashboard'), end: true },
    { to: '/admin/jobs',       icon: <JobsIcon />,      label: t('nav.jobs') },
    { to: '/admin/timesheets', icon: <TimesheetIcon />, label: t('nav.timesheets') },
    { to: '/admin/payroll',    icon: <PayrollIcon />,   label: t('nav.payroll') },
  ]

  const MORE = [
    { to: '/admin/employees',  icon: <EmployeesIcon />, label: t('nav.employees') },
    { to: '/admin/checks',     icon: <ChecksIcon />,    label: t('nav.checks') },
    { to: '/admin/loans',      icon: <LoansIcon />,     label: t('nav.loans') },
    { to: '/admin/vendors',    icon: <VendorsIcon />,   label: t('nav.vendors') },
    { to: '/admin/documents',  icon: <DocumentsIcon />, label: t('nav.documents') },
    { to: '/admin/hr',         icon: <HRIcon />,        label: t('nav.hrDocs') },
    { to: '/admin/reports',    icon: <ReportsIcon />,   label: t('nav.reports') },
  ]

  const moreActive = MORE.some(item => location.pathname.startsWith(item.to))

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('nav.fieldclock')}</p>
        </div>
        <div className="px-5 py-2.5 border-b border-brand-700/40">
          <p className="text-brand-100/90 text-sm font-semibold">{user?.name}</p>
          <p className="text-brand-400/60 text-xs">{t('role.admin')}</p>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {[...PRIMARY, ...MORE].map(item => <SidebarItem key={item.to} {...item} />)}
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

        {/* Mobile top bar — slim, no hamburger */}
        <header className="lg:hidden bg-brand-900 text-white flex items-center justify-between px-4 py-3 sticky top-0 z-30">
          <img src="/jccs-logo.jpg" alt="JCCS" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-brand-300/90 font-medium truncate max-w-[140px]">{user?.name}</span>
            <LiveClock className="text-white/60 text-xs" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 lg:p-6 w-full"
          style={{ paddingBottom: 'max(96px, calc(64px + env(safe-area-inset-bottom)))' }}>
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>

        {/* ── Mobile bottom nav ────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 6px rgba(0,0,0,0.06)' }}>
          {PRIMARY.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-brand-500' : 'text-gray-400'
                }`
              }>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-semibold transition-colors ${
              moreActive ? 'text-brand-500' : 'text-gray-400'
            }`}>
            <MoreDotsIcon />
            <span>More</span>
          </button>
        </nav>

        {/* ── More bottom sheet ─────────────────────────────── */}
        {moreOpen && (
          <div className="fixed inset-0 z-[1100] lg:hidden flex flex-col justify-end"
            onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-white rounded-t-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              {/* User chip */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400">{t('role.admin')}</p>
                </div>
              </div>

              {/* Nav grid — 3 columns */}
              <div className="grid grid-cols-3 gap-2 p-4">
                {MORE.map(item => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-2 py-4 px-2 rounded-2xl text-xs font-semibold text-center transition-colors ${
                        isActive
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-50 text-gray-700 active:bg-gray-100'
                      }`
                    }>
                    <div className="w-8 h-8 flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span className="leading-tight">{item.label}</span>
                  </NavLink>
                ))}
              </div>

              {/* Footer: language + logout */}
              <div className="border-t border-gray-100 flex items-center justify-between px-5 py-3"
                style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                <LangSwitcher className="text-gray-500" />
                <button onClick={handleLogout}
                  className="flex items-center gap-2 text-sm font-semibold text-red-500 py-2 px-3 rounded-xl active:bg-red-50 transition-colors">
                  <LogoutIcon /> {t('nav.signOut')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
