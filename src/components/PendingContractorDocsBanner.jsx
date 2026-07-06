import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listDocuments } from '../api/documents'

const REQUIRED = ['w9', 'workers_comp']

export default function PendingContractorDocsBanner() {
  const [pendingCount, setPendingCount] = useState(0)
  const navigate  = useNavigate()
  const location  = useLocation()
  const { t }     = useTranslation()

  const check = () => {
    listDocuments().then((d) => {
      const uploaded = new Set((d.documents ?? []).map((doc) => doc.doc_type))
      setPendingCount(REQUIRED.filter((r) => !uploaded.has(r)).length)
    }).catch(() => {})
  }

  useEffect(() => { check() }, [location.pathname])

  if (pendingCount === 0 || location.pathname === '/contractor/documents') return null

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium cursor-pointer hover:bg-amber-600 transition-colors"
      onClick={() => navigate('/contractor/documents')}
    >
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>{t('pendingContractorDocs.banner', { count: pendingCount })}</span>
      </div>
      <span className="flex items-center gap-1 text-amber-100 hover:text-white text-xs font-semibold flex-shrink-0">
        {t('pendingContractorDocs.uploadNow')}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </span>
    </div>
  )
}
