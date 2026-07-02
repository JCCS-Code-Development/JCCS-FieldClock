import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { listAgreements } from '../api/agreements'

const REQUIRED_ALL = ['at_will', 'non_solicitation', 'conflict_of_interest', 'emergency_contact']
const REQUIRED_W2  = ['i9', 'w4']

export default function PendingDocsBanner() {
  const [pendingCount, setPendingCount] = useState(0)
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { t }     = useTranslation()

  const checkPending = () => {
    if (!user) return
    listAgreements().then((d) => {
      const signed = new Set((d.agreements ?? []).filter((a) => a.signed_at).map((a) => a.agreement_type))
      const required = [
        ...REQUIRED_ALL,
        ...(user.pay_type === 'w2' ? REQUIRED_W2 : []),
      ]
      setPendingCount(required.filter((r) => !signed.has(r)).length)
    }).catch(() => {})
  }

  // Check on mount and whenever the user returns from /my-docs
  useEffect(() => { checkPending() }, [user, location.pathname])

  if (pendingCount === 0 || location.pathname === '/my-docs') return null

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium cursor-pointer hover:bg-amber-600 transition-colors"
      onClick={() => navigate('/my-docs')}
    >
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>{t('pendingDocs.banner', { count: pendingCount })}</span>
      </div>
      <span className="flex items-center gap-1 text-amber-100 hover:text-white text-xs font-semibold flex-shrink-0">
        {t('pendingDocs.signNow')}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </span>
    </div>
  )
}
