import { useOnlineStatus } from '../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null
  return (
    <div className="bg-amber-500 text-white text-sm font-semibold text-center py-2 px-4 sticky top-0 z-40">
      ⚠️ No internet connection — clock actions unavailable
    </div>
  )
}
