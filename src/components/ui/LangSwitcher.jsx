import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { setLanguage } from '../../api/auth'

export default function LangSwitcher({ className = '' }) {
  const { i18n, t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const toggle = () => {
    const next = i18n.language.startsWith('es') ? 'en' : 'es'
    i18n.changeLanguage(next)
    if (isAuthenticated) setLanguage(next).catch(() => {})
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 text-xs font-semibold tracking-widest uppercase transition-colors ${className}`}
      title={t('lang.switchTo')}
    >
      <span className="opacity-60">{t('lang.current')}</span>
      <span className="opacity-30">|</span>
      <span className="opacity-100">{t('lang.switchTo')}</span>
    </button>
  )
}
