import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'

// Admin-only toggle between the admin console and the employee (Clock / My Pay)
// view. Rendered persistently in both layouts — top bar, desktop sidebar, and
// the profile/more sheets — so an admin can flip either way from anywhere.
//
// `target` is the view this button switches TO ('admin' | 'employee'); each
// layout passes its opposite. `variant` picks the chrome.
const SwapIcon = ({ s = 'w-4 h-4' }) => (
  <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21V6m0 0L4 9.5M7.5 6L11 9.5M16.5 3v15m0 0L20 14.5M16.5 18L13 14.5" />
  </svg>
)

export default function ViewSwitch({ target, variant = 'topbar', onNavigate }) {
  const { t } = useTranslation()
  const role = useAuthStore((s) => s.user?.role)
  const navigate = useNavigate()

  if (role !== 'admin') return null

  const to    = target === 'admin' ? '/admin' : '/'
  const label = target === 'admin' ? t('nav.adminView') : t('nav.employeeView')
  const short = target === 'admin' ? t('role.admin') : t('role.employee')

  const go = () => { onNavigate?.(); navigate(to) }

  if (variant === 'sidebar') {
    return (
      <button onClick={go}
        className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-brand-100/80 hover:bg-brand-700 hover:text-white transition-colors w-full">
        <SwapIcon s="w-5 h-5" /> {label}
      </button>
    )
  }

  if (variant === 'sheet') {
    return (
      <button onClick={go}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-brand-500/10 text-brand-500 text-sm font-semibold active:bg-brand-500/20 transition-colors">
        <SwapIcon s="w-4 h-4" /> {label}
      </button>
    )
  }

  // topbar — compact pill in the fixed mobile header
  return (
    <button onClick={go} aria-label={label} title={label}
      className="flex items-center gap-1 rounded-full bg-white/10 text-white/90 text-[11px] font-semibold pl-1.5 pr-2 py-1 shrink-0 active:bg-white/20 transition-colors">
      <SwapIcon s="w-3.5 h-3.5" />
      <span>{short}</span>
    </button>
  )
}
