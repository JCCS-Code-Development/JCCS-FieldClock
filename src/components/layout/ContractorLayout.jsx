import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutAPI } from '../../api/auth'
import OfflineBanner from '../OfflineBanner'
import PendingContractorDocsBanner from '../PendingContractorDocsBanner'
import LangSwitcher from '../ui/LangSwitcher'

const FileIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)
const ShieldIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
)
const LogoutIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
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

const NAV_KEYS = [
  { to: '/contractor/invoices',  labelKey: 'contractor.nav.invoices',  Icon: FileIcon  },
  { to: '/contractor/documents', labelKey: 'contractor.nav.documents', Icon: ShieldIcon },
]

function NavItem({ to, label, Icon, onClick }) {
  return (
    <NavLink to={to} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-brand-100/80 hover:bg-brand-700 hover:text-white'
        }`
      }
    >
      <Icon />{label}
    </NavLink>
  )
}



function SidebarContent({ user, onLogout, onNavClick }) {
  const { t } = useTranslation()
  const NAV = NAV_KEYS.map((n) => ({ ...n, label: t(n.labelKey) }))
  return (
    <>
      <div className="px-5 py-5 border-b border-brand-700/60 flex flex-col items-center text-center">
        <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
          style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
        <p className="text-brand-400 text-xs font-bold mt-2 tracking-widest uppercase">{t('contractor.nav.portal')}</p>
      </div>
      <div className="px-5 py-2.5 border-b border-brand-700/40">
        <p className="text-brand-100/90 text-sm font-semibold">{user?.name}</p>
        <p className="text-brand-400/60 text-xs">{t('role.contractor')}</p>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => (
          <NavItem key={to} to={to} label={label} Icon={Icon} onClick={onNavClick} />
        ))}
      </nav>
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

export default function ContractorLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const NAV = NAV_KEYS.map((n) => ({ ...n, label: t(n.labelKey) }))

  const handleLogout = async () => {
    try { await logoutAPI(refreshToken) } catch {}
    logout()
    navigate('/login', { replace: true })
  }

  const close = () => setDrawerOpen(false)

  return (
    <div className="flex h-svh bg-gray-50 overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand-900 text-white shrink-0 fixed top-0 bottom-0 left-0 z-20">
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[1100] lg:hidden" onClick={close}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-brand-900 text-white flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-4 border-b border-brand-700/60">
              <div className="px-5 py-5">
                <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-12 w-auto"
                  style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
              </div>
              <button onClick={close} className="text-brand-100/60 hover:text-white p-1 text-xl">✕</button>
            </div>
            <SidebarContent user={user} onLogout={handleLogout} onNavClick={close} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 overflow-hidden">
        <OfflineBanner />

        {/* Mobile top header */}
        <header className="lg:hidden bg-brand-900 text-white grid grid-cols-3 items-center px-4 py-3 sticky top-0 z-30">
          <button onClick={() => setDrawerOpen(true)} className="p-1 text-brand-100/80 justify-self-start"><MenuIcon /></button>
          <img src="/jccs-logo.jpg" alt="JCCS Services" className="h-7 w-auto justify-self-center"
            style={{ filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div className="w-8 justify-self-end" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6 w-full">
          <div className="max-w-4xl mx-auto w-full">
            <Outlet />
          </div>
        </main>

        {/* Document reminder — fixed just above the bottom nav on mobile */}
        <PendingContractorDocsBanner />

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-30">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs transition-colors ${
                  isActive ? 'text-brand-500 font-semibold' : 'text-gray-500'
                }`
              }
            >
              <Icon />{label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
