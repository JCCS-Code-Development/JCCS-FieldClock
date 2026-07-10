import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'
import OfflineBanner from '../OfflineBanner'
import PullToRefresh from '../ui/PullToRefresh'
import PendingContractorDocsBanner from '../PendingContractorDocsBanner'
import LangSwitcher from '../ui/LangSwitcher'

// ── Icons ─────────────────────────────────────────────────────────
const FileIcon    = ({ s = 'w-6 h-6' }) => <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
const ShieldIcon  = ({ s = 'w-6 h-6' }) => <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
const PersonIcon  = ({ s = 'w-6 h-6' }) => <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
const LogoutIcon  = ({ s = 'w-4 h-4' }) => <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline strokeLinecap="round" strokeLinejoin="round" points="16 17 21 12 16 7"/><line strokeLinecap="round" x1="21" y1="12" x2="9" y2="12"/></svg>

// ── Desktop sidebar nav item ───────────────────────────────────────
function SidebarItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink to={to} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }>
      <Icon /> {label}
    </NavLink>
  )
}

export default function ContractorLayout() {
  const [profileOpen, setProfileOpen] = useState(false)
  const [refreshKey,  setRefreshKey]  = useState(0)
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  const NAV = [
    { to: '/contractor/invoices',  icon: FileIcon,   label: t('contractor.nav.invoices') },
    { to: '/contractor/documents', icon: ShieldIcon, label: t('contractor.nav.documents') },
  ]

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('contractor.nav.portal')}</p>
        </div>
        <div className="px-5 py-2.5 border-b border-brand-700/40">
          <p className="text-brand-100 text-sm font-semibold">{t('home.welcome', { name: user?.name?.split(' ')[0] })}</p>
          <p className="text-brand-400/60 text-xs">{t('role.contractor')}</p>
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
          <img src="/jccs-logo.jpg" alt="JCCS" className="h-7 w-auto"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-brand-300/90 font-medium truncate max-w-[150px]">{user?.name}</span>
            {/* Profile avatar */}
            <button onClick={() => setProfileOpen(true)}
              className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0 active:bg-brand-400 transition-colors">
              {user?.name?.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        {/* Spacer below fixed header (mobile only) */}
        <div className="lg:hidden h-[52px] shrink-0" />

        <PullToRefresh className="flex-1 p-4 lg:p-6 w-full"
          style={{ paddingBottom: 'max(96px, calc(64px + env(safe-area-inset-bottom)))' }}
          onRefresh={() => setRefreshKey(k => k + 1)}>
          <div key={refreshKey} className="max-w-4xl mx-auto w-full">
            <Outlet />
            <div className="lg:hidden h-24 shrink-0" />
          </div>
        </PullToRefresh>

        {/* Document reminder — sits just above the bottom nav */}
        <PendingContractorDocsBanner />

        {/* ── Mobile bottom nav ────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 6px rgba(0,0,0,0.06)' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-brand-500' : 'text-gray-400'
                }`
              }>
              <Icon /><span>{label}</span>
            </NavLink>
          ))}
          {/* Account / profile shortcut */}
          <button onClick={() => setProfileOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[11px] font-semibold text-gray-400 active:text-brand-500 transition-colors">
            <PersonIcon />
            <span>Account</span>
          </button>
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
                  <p className="text-xs text-gray-400">{t('role.contractor')}</p>
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
