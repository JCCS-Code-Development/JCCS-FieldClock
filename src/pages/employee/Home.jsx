import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import ClockPanel from '../../components/employee/ClockPanel'

export default function Home() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex-1 flex flex-col items-center justify-center lg:justify-start px-4 py-8 gap-6 w-full">
      <div className="text-center select-none w-full">
        <h1 className="text-2xl font-semibold text-gray-900">{t('home.welcome', { name: firstName })}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('home.slogan')}</p>
      </div>
      <ClockPanel />
    </div>
  )
}
