import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const { t } = useTranslation()
  const isOnline = useOnlineStatus()
  if (isOnline) return null
  return (
    <div className="bg-amber-500 text-white text-sm font-semibold text-center py-2 px-4 sticky top-0 z-40">
      ⚠️ {t('offline')}
    </div>
  )
}
