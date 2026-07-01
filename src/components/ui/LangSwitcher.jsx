import { useTranslation } from 'react-i18next'

export default function LangSwitcher({ className = '' }) {
  const { i18n, t } = useTranslation()
  const toggle = () => i18n.changeLanguage(i18n.language.startsWith('es') ? 'en' : 'es')

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
