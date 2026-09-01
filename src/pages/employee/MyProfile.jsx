import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import { getPersonalDetails } from '../../api/personalDetails'
import { useAuthStore } from '../../store/authStore'
import { formatDate } from '../../utils/format'

// Show only the last 4 of a sensitive value (tax ID, bank account). The
// employee's own record comes back unmasked from the API; there's no reason
// to render a full SSN / account number on screen.
const last4 = (v) => {
  const s = String(v ?? '').replace(/\s+/g, '')
  return s.length > 4 ? `•••• ${s.slice(-4)}` : s
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium text-right ${muted ? 'text-gray-400 italic' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

export default function MyProfile() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPersonalDetails()
      .then((d) => setDetails(d.details ?? null))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false))
  }, [])

  const na = <span className="text-gray-400 italic">{t('pay.profile.notOnFile')}</span>
  const ec = details?.emergency_contact_name
    ? `${details.emergency_contact_name}${details.emergency_contact_phone ? ' · ' + details.emergency_contact_phone : ''}`
    : null

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg">
      <h1 className="text-xl font-bold text-gray-900">{t('nav.profile')}</h1>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('pay.profile.account')}</p>
        <Row label={t('pay.profile.name')}  value={user?.name || na} />
        <Row label={t('pay.profile.email')} value={user?.email || na} />
        <Row label={t('pay.profile.phone')} value={user?.phone || na} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('pay.profile.personal')}</p>
          <Row label={t('pay.profile.taxId')}     value={details?.tax_id ? last4(details.tax_id) : na} />
          <Row label={t('pay.profile.birthDate')} value={details?.birth_date ? formatDate(details.birth_date) : na} />
          <Row label={t('pay.profile.emergencyContact')} value={ec || na} />
          <div className="border-t border-gray-100 my-2" />
          <Row label={t('pay.profile.bankRouting')} value={details?.bank_routing_number || na} />
          <Row label={t('pay.profile.bankAccount')} value={details?.bank_account_number ? last4(details.bank_account_number) : na} />
          <p className="text-xs text-gray-400 mt-2">{t('pay.profile.editNotice')}</p>
        </div>
      )}
    </div>
  )
}
