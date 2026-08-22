import { format, parseISO, differenceInMinutes } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import i18n from '../i18n'

// Plain (non-hook) module, called from render — i18n.language is read fresh
// each call, and the component re-renders on language change anyway (it's
// already reading `t()`), so this stays in sync without extra plumbing.
const dfLocale = () => (i18n.language?.startsWith('es') ? es : enUS)

export const formatDate     = (iso) => iso ? format(parseISO(iso), 'MMM d, yyyy',        { locale: dfLocale() }) : '—'
export const formatTime     = (iso) => iso ? format(parseISO(iso), 'h:mm a',             { locale: dfLocale() }) : '—'
export const formatDateTime = (iso) => iso ? format(parseISO(iso), 'MMM d, yyyy h:mm a', { locale: dfLocale() }) : '—'

export const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

export const formatDuration = (startIso, endIso) => {
  if (!startIso || !endIso) return '—'
  const mins = differenceInMinutes(parseISO(endIso), parseISO(startIso), { roundingMethod: 'round' })
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const formatHours = (decimalHours) => {
  const h = Math.floor(decimalHours)
  const m = Math.round((decimalHours - h) * 60)
  return `${h}h ${m}m`
}

export const formatPhone = (phone) => {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1')
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return phone
}

export const toE164 = (phone) => {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return phone
}
