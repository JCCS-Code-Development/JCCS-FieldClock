import { format, parseISO, differenceInMinutes } from 'date-fns'

export const formatDate = (iso) => format(parseISO(iso), 'MMM d, yyyy')
export const formatTime = (iso) => format(parseISO(iso), 'h:mm a')
export const formatDateTime = (iso) => format(parseISO(iso), 'MMM d, yyyy h:mm a')

export const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

export const formatDuration = (startIso, endIso) => {
  if (!startIso || !endIso) return '—'
  const mins = differenceInMinutes(parseISO(endIso), parseISO(startIso))
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
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1')
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return phone
}

export const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return phone
}
