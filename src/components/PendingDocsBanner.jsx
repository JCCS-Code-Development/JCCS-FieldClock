import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { listAgreements } from '../api/agreements'

const REQUIRED_ALL = ['at_will', 'non_solicitation', 'conflict_of_interest', 'emergency_contact']
const REQUIRED_W2  = ['i9', 'w4']

// Sits directly under the fixed mobile header. Rendered in two parts:
// a plain (non-fixed) spacer at the call site — which lives inside the
// scrollable content so it actually pushes the page down and reveals
// room for the banner — and the real fixed/clickable banner itself,
// portaled to document.body so it isn't affected by PullToRefresh's
// transform wrapper (a transformed ancestor would otherwise turn
// `position: fixed` into "fixed relative to that ancestor" instead of
// the viewport, making it drift with the pull-to-refresh gesture).
export default function PendingDocsBanner() {
  const [pendingCount, setPendingCount] = useState(0)
  const [bannerHeight, setBannerHeight] = useState(0)
  const bannerRef = useRef(null)
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { t }     = useTranslation()

  const checkPending = () => {
    if (!user?.id) return
    // Must scope to our own record by user_id — without it an admin hits the
    // HR-overview branch, which returns { employees } instead of { agreements },
    // so nothing reads as signed and the count is stuck at the full total.
    listAgreements({ user_id: user.id }).then((d) => {
      const signed = new Set((d.agreements ?? []).filter((a) => a.signed_at).map((a) => a.agreement_type))
      const required = [
        ...REQUIRED_ALL,
        ...(user.pay_type === 'w2' ? REQUIRED_W2 : []),
      ]
      setPendingCount(required.filter((r) => !signed.has(r)).length)
    }).catch(() => {})
  }

  // Check on mount and whenever the user returns from /my-docs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { checkPending() }, [user, location.pathname])

  // Measure the actual rendered banner height (its text can wrap to 2
  // lines on narrow phones or longer locale strings) so the spacer
  // always matches exactly instead of guessing a fixed value.
  useLayoutEffect(() => {
    if (!bannerRef.current) { setBannerHeight(0); return }
    const el = bannerRef.current
    const update = () => setBannerHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pendingCount, location.pathname])

  if (pendingCount === 0 || location.pathname === '/my-docs') return null

  return (
    <>
      <div className="lg:hidden shrink-0" style={{ height: bannerHeight }} />
      {createPortal(
        <div
          ref={bannerRef}
          role="alert"
          className="lg:hidden fixed inset-x-0 z-20 flex items-center justify-between gap-3 px-4 py-3 bg-orange-500 text-white text-sm font-semibold cursor-pointer active:bg-orange-600 transition-colors shadow-lg"
          style={{ top: '52px' }}
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
        </div>,
        document.body
      )}
    </>
  )
}
