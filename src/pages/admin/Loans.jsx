import { useState, useEffect, useRef } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import PrintLoanCheck from '../../components/admin/PrintLoanCheck'
import PrintLoanLetter from '../../components/admin/PrintLoanLetter'
import LoanNoteOverlay from '../../components/LoanNoteOverlay'
import {
  listLoans, getLoan, createLoan, updateLoan, deleteLoan, recordPayment, deletePayment, getLoanReceiptUrl,
  listLoanNotes, voidLoan, amendLoan, repaperLoans, getLoansDue, previewSeparation, separateEmployee,
} from '../../api/loans'
import { listEmployees } from '../../api/employees'
import { formatCurrency } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks, addDays } from 'date-fns'

// Deductions are only recorded for weeks payroll has actually run — last week
// and earlier, never the in-progress week (matches the Payroll page, which
// pays completed weeks). So the list starts one week back.
const periods = Array.from({ length: 8 }, (_, i) => {
  const w     = i + 1
  const start = startOfWeek(subWeeks(new Date(), w), { weekStartsOn: 1 })
  const end   = endOfWeek(subWeeks(new Date(), w),   { weekStartsOn: 1 })
  return {
    label: i === 0 ? 'Last Week' : format(start, 'MMM d'),
    start: format(start, 'yyyy-MM-dd'),
    end:   format(end,   'yyyy-MM-dd'),
  }
})

// Weeks run Monday–Sunday (matches Payroll.jsx / Employees.jsx). Default the
// deduction start to the Monday after the current week, so a loan issued
// mid-week doesn't imply deducting from a period already in progress.
function nextPayPeriodStart() {
  const today = new Date()
  const dow = today.getDay() === 0 ? 7 : today.getDay() // ISO: Mon=1 .. Sun=7
  return format(addDays(today, 8 - dow), 'yyyy-MM-dd')
}

// Earliest first-installment week a new pagaré (or amendment) may use: the
// first Monday at least 7 days out — SC requires 7 days' written notice
// before a deduction starts or increases. Mirrors earliestFirstDueDate() in
// api/loans/_pagare.php, which enforces it.
function earliestFirstDue() {
  let d = addDays(new Date(), 7)
  while (d.getDay() !== 1) d = addDays(d, 1)
  return format(d, 'yyyy-MM-dd')
}
const isMondayISO = (iso) => !!iso && new Date(iso + 'T12:00').getDay() === 1

// Weekly schedule preview — same rule as buildLoanSchedule() server-side:
// full installments, the last one absorbs whatever's left.
function schedulePreview(amount, weekly) {
  if (!(amount > 0) || !(weekly > 0)) return null
  const n = Math.ceil(Math.round(amount * 100) / Math.round(weekly * 100))
  const last = Math.round((amount - weekly * (n - 1)) * 100) / 100
  return { n, last }
}

const STATUS_BADGE = {
  pending_signature:   ['Awaiting employee signature', 'bg-gray-100 text-gray-600'],
  pending_countersign: ['Ready to countersign', 'bg-indigo-100 text-indigo-700'],
  active:              ['Active', 'bg-amber-100 text-amber-700'],
  paid_off:            ['Paid Off', 'bg-green-100 text-green-700'],
  void:                ['Cancelled', 'bg-red-50 text-red-500'],
}
const FLAG_BADGE = {
  late:      ['14+ days late', 'bg-red-100 text-red-700'],
  unsigned:  ['Pagaré unsigned 14+ days — stop deductions', 'bg-orange-100 text-orange-700'],
  separated: ['Past 30-day deadline', 'bg-red-100 text-red-700'],
}
const NOTE_KIND = { original: 'Original note', amendment: 'Amendment', repaper: 'Re-papered existing loan' }
const fmtDb = (s) => s ? format(new Date(String(s).replace(' ', 'T')), 'MMM d, yyyy') : ''

const PAYMENT_METHOD_LABELS = { cash: 'Cash', check: 'Check', transfer: 'Transfer', payroll_deduction: 'Payroll Deduction' }
const PAYMENT_METHOD_COLORS = {
  cash:              'bg-gray-100 text-gray-600',
  check:             'bg-blue-100 text-blue-700',
  transfer:          'bg-purple-100 text-purple-700',
  payroll_deduction: 'bg-green-100 text-green-700',
}

// Projected payoff, assuming the full weekly_deduction is actually deducted
// every week from deduction_start_date onward — an estimate, not a guarantee
// (deductions are still recorded manually via Register Payment).
function projectedPayoff(remaining, weeklyDeduction, startDate) {
  if (!weeklyDeduction || weeklyDeduction <= 0 || remaining <= 0) return null
  const weeksNeeded = Math.ceil(remaining / weeklyDeduction)
  const start = startDate ? new Date(startDate + 'T12:00') : new Date()
  const base = start > new Date() ? start : new Date()
  return { weeksNeeded, date: addDays(base, weeksNeeded * 7) }
}

const TrashIcon = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>
)

const ChevronDown = () => (
  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
  </svg>
)

function ProgressBar({ paid, total }) {
  const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function AdminLoans() {
  const [loans, setLoans]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [statusFilter, setStatus] = useState('active')
  const [employees, setEmployees] = useState([])

  // Expanded loan detail
  const [expanded, setExpanded]   = useState(null)   // loan id
  const [detail,   setDetail]     = useState({})     // id → { payments, ... }
  const [loadingDetail, setLD]    = useState({})

  // New loan modal
  const [newModal,  setNewModal]  = useState(false)
  const [newForm,   setNewForm]   = useState({ user_id: '', amount: '', weekly_deduction: '', deduction_start_date: '', description: '' })
  const [newSaving, setNewSaving] = useState(false)
  const [newError,  setNewError]  = useState('')
  // 3-loans-per-12-months warning — admin may still issue with a reason
  const [limitHit,  setLimitHit]  = useState(null)   // { count, limit } | null
  const [overrideReason, setOverrideReason] = useState('')

  // Pagarés
  const [notes,       setNotes]       = useState({})    // loan id → notes[]
  const [noteOverlay, setNoteOverlay] = useState(null)  // { note, mode }
  const [notice,      setNotice]      = useState('')    // one-line success/info banner

  // Installments due (payments to record) for a chosen week
  const [dueWeek,    setDueWeek]    = useState(0)       // index into periods
  const [dueRows,    setDueRows]    = useState([])
  const [loadingDue, setLoadingDue] = useState(false)
  const [letter,     setLetter]     = useState(null)    // { kind, row }

  // Amend (raise weekly amount via a new signed note)
  const [amendModal,  setAmendModal]  = useState(null)  // loan row
  const [amendForm,   setAmendForm]   = useState({ weekly_deduction: '', first_due_date: '' })
  const [amendSaving, setAmendSaving] = useState(false)
  const [amendError,  setAmendError]  = useState('')

  // Separation (employee leaving)
  const [sepModal,   setSepModal]   = useState(null)    // { user_id, user_name, pay_type }
  const [sepForm,    setSepForm]    = useState({ date: '', final_gross: '', hours: '', deduct_amount: '' })
  const [sepPreview, setSepPreview] = useState(null)
  const [sepSaving,  setSepSaving]  = useState(false)
  const [sepError,   setSepError]   = useState('')

  // Re-paper existing loans confirm
  const [repaperModal, setRepaperModal] = useState(false)
  const [repapering,   setRepapering]   = useState(false)

  // Edit deduction schedule modal
  const [scheduleModal,   setScheduleModal]   = useState(null)  // loan row
  const [scheduleForm,    setScheduleForm]    = useState({ weekly_deduction: '', deduction_start_date: '' })
  const [scheduleSaving,  setScheduleSaving]  = useState(false)
  const [scheduleError,   setScheduleError]   = useState('')

  // Record payment modal
  const [payModal,   setPayModal]   = useState(null)   // loan row
  const [payPeriod,  setPayPeriod]  = useState(0)
  const [payAmount,  setPayAmount]  = useState('0.00')
  const [payMethod,  setPayMethod]  = useState('transfer')
  const [payRef,     setPayRef]     = useState('')
  const [payReceipt, setPayReceipt] = useState(null)   // File | null
  const [payNotes,   setPayNotes]   = useState('')
  const [paySaving,  setPaySaving]  = useState(false)
  const [payError,   setPayError]   = useState('')
  const receiptInputRef = useRef(null)

  // Delete confirm
  const [delLoan,    setDelLoan]    = useState(null)
  const [delPayment, setDelPayment] = useState(null)
  const [deleting,   setDeleting]   = useState(false)

  // Print loan disbursement check
  const [printLoan, setPrintLoan] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [ld, ed] = await Promise.all([
        listLoans(statusFilter !== 'all' && statusFilter !== 'pending' ? { status: statusFilter } : {}),
        listEmployees(),
      ])
      const all = ld.loans ?? []
      setLoans(statusFilter === 'pending'
        // Waiting on a signature: new loans, plus active loans with an
        // amendment/re-paper pagaré out for signing.
        ? all.filter((l) => l.status === 'pending_signature' || l.status === 'pending_countersign' || (l.status === 'active' && l.pending_note_id))
        : all)
      setEmployees((ed.employees ?? []).filter((e) => e.is_active && e.role !== 'contractor'))
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [statusFilter])

  const loadDue = async () => {
    setLoadingDue(true)
    try { setDueRows((await getLoansDue(periods[dueWeek].start)).due ?? []) }
    catch { setDueRows([]) }
    finally { setLoadingDue(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDue() }, [dueWeek])

  // ── Expand / collapse loan detail ───────────────────────────────
  const toggleExpand = async (loan) => {
    if (expanded === loan.id) { setExpanded(null); return }
    setExpanded(loan.id)
    if (detail[loan.id]) return
    setLD((s) => ({ ...s, [loan.id]: true }))
    try {
      const [d, n] = await Promise.all([getLoan(loan.id), listLoanNotes(loan.id)])
      setDetail((s) => ({ ...s, [loan.id]: d.loan }))
      setNotes((s) => ({ ...s, [loan.id]: n }))
    } finally { setLD((s) => ({ ...s, [loan.id]: false })) }
  }

  const refreshDetail = async (loanId) => {
    const [d, n] = await Promise.all([getLoan(loanId), listLoanNotes(loanId)])
    setDetail((s) => ({ ...s, [loanId]: d.loan }))
    setNotes((s) => ({ ...s, [loanId]: n }))
    // Also refresh top-level list row + the due list
    load(); loadDue()
  }

  // ── Pagarés: view / countersign ───────────────────────────────────
  const openNote = async (loan, noteId, mode) => {
    const list = await listLoanNotes(loan.id)
    setNotes((s) => ({ ...s, [loan.id]: list }))
    const note = list.find((n) => n.id === noteId) ?? list[list.length - 1]
    if (note) setNoteOverlay({ note, mode, loanId: loan.id })
  }

  const handleCountersigned = async (res) => {
    const loanId = noteOverlay.loanId
    const kind   = noteOverlay.note.kind
    setNoteOverlay(null)
    setNotice(
      (kind === 'original' ? 'Countersigned — the loan is now active. You can hand over the money / print the check.' : 'Countersigned — the new terms are in effect.')
      + (res?.emailed ? ' A copy was emailed to the employee.' : ' The email copy could not be sent; the employee can view it in My Documents.')
    )
    if (detail[loanId]) await refreshDetail(loanId); else { load(); loadDue() }
  }

  const handleVoid = async (loan) => {
    if (!window.confirm(`Cancel the ${formatCurrency(loan.amount)} loan for ${loan.user_name}? It was never fully signed, so nothing is owed.`)) return
    try { await voidLoan(loan.id); load() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not cancel.') }
  }

  // ── Create loan ──────────────────────────────────────────────────
  // The admin sets the weekly amount; the number of installments follows
  // from it (the last one absorbs whatever's left).
  const newAmount = parseFloat(newForm.amount)
  const newWeekly = parseFloat(newForm.weekly_deduction)
  const newPreview = schedulePreview(newAmount, Math.min(newWeekly, newAmount))

  const handleCreateLoan = async () => {
    if (!newForm.user_id) { setNewError('Select an employee.'); return }
    if (!(newAmount > 0)) { setNewError('Enter a valid amount.'); return }
    if (!(newWeekly > 0)) { setNewError('Enter the weekly payment amount.'); return }
    if (!isMondayISO(newForm.deduction_start_date)) { setNewError('The first installment week must start on a Monday.'); return }
    if (newForm.deduction_start_date < earliestFirstDue()) { setNewError(`The first installment can't be before ${earliestFirstDue()} (7 days' notice).`); return }
    if (limitHit && !overrideReason.trim()) { setNewError('Enter a reason to issue a loan over the limit.'); return }
    setNewSaving(true); setNewError('')
    try {
      await createLoan({
        user_id:              parseInt(newForm.user_id),
        amount:               newAmount,
        weekly_deduction:     newWeekly,
        deduction_start_date: newForm.deduction_start_date,
        description:          newForm.description.trim() || null,
        ...(limitHit ? { override_reason: overrideReason.trim() } : {}),
      })
      setNewModal(false)
      const emp = employees.find((e) => String(e.id) === String(newForm.user_id))
      setNotice(`Loan created. ${emp?.name ?? 'The employee'} now has a pagaré to sign in the app (My Documents). Don't hand over any money until you've countersigned it.`)
      if (statusFilter !== 'pending' && statusFilter !== 'all') setStatus('pending'); else load()
    } catch (err) {
      if (err?.response?.data?.limit_reached) {
        setLimitHit({ count: err.response.data.count, limit: err.response.data.limit })
      } else {
        setNewError(err?.response?.data?.error ?? 'Could not create. Try again.')
      }
    }
    setNewSaving(false)
  }

  const openNewLoan = () => {
    setNewForm({ user_id: '', amount: '', weekly_deduction: '', deduction_start_date: earliestFirstDue(), description: '' })
    setLimitHit(null); setOverrideReason(''); setNewError(''); setNewModal(true)
  }

  // ── Amend (raise the weekly amount via a new signed note) ──────────
  const handleAmend = async () => {
    const w = parseFloat(amendForm.weekly_deduction)
    if (!(w > 0)) { setAmendError('Enter the new weekly amount.'); return }
    if (!isMondayISO(amendForm.first_due_date)) { setAmendError('The new amount must start on a Monday.'); return }
    setAmendSaving(true); setAmendError('')
    try {
      await amendLoan({ loan_id: amendModal.id, weekly_deduction: w, first_due_date: amendForm.first_due_date })
      setAmendModal(null)
      setNotice(`Amendment sent to ${amendModal.user_name} to sign. The current amount stays in effect until it's signed by both sides.`)
      await refreshDetail(amendModal.id)
    } catch (err) {
      setAmendError(err?.response?.data?.error ?? 'Could not create the amendment.')
    }
    setAmendSaving(false)
  }

  // ── Separation (employee leaving) ──────────────────────────────────
  const loadSepPreview = async (userId, date) => {
    setSepPreview(null)
    try {
      const p = await previewSeparation({ user_id: userId, date })
      setSepPreview(p)
      setSepForm((f) => ({ ...f, hours: String(p.final_week.hours) }))
    } catch (err) { setSepError(err?.response?.data?.error ?? 'Could not load the balance.') }
  }
  const openSeparation = (loan) => {
    const date = format(new Date(), 'yyyy-MM-dd')
    setSepModal({ user_id: loan.user_id, user_name: loan.user_name, pay_type: loan.pay_type })
    setSepForm({ date, final_gross: '', hours: '', deduct_amount: '' })
    setSepError('')
    loadSepPreview(loan.user_id, date)
  }
  const sepHours = parseFloat(sepForm.hours) || 0
  const sepFloor = Math.round(sepHours * (sepPreview?.min_wage ?? 7.25) * 100) / 100
  const sepMax   = Math.max(0, Math.round(((parseFloat(sepForm.final_gross) || 0) - sepFloor) * 100) / 100)
  const sepDefault = Math.min(sepMax, sepPreview?.balance ?? 0)
  const handleSeparate = async () => {
    if (sepForm.final_gross === '' || parseFloat(sepForm.final_gross) < 0) { setSepError('Enter the final pay gross.'); return }
    setSepSaving(true); setSepError('')
    try {
      const r = await separateEmployee({
        user_id: sepModal.user_id, separation_date: sepForm.date,
        final_gross: parseFloat(sepForm.final_gross), hours: sepHours,
        ...(sepForm.deduct_amount !== '' ? { deduct_amount: parseFloat(sepForm.deduct_amount) } : {}),
      })
      setSepModal(null)
      setNotice(`${formatCurrency(r.deducted)} recorded as the final-pay deduction` +
        (sepModal.pay_type === 'w2' ? ' — set the same deduction in ADP.' : '.') +
        (r.still_owed > 0 ? ` ${formatCurrency(r.still_owed)} is still owed, due by ${format(new Date(r.balance_due_date + 'T12:00'), 'MMM d, yyyy')}.` : ' The loan is paid off.'))
      setDetail({}); load(); loadDue()
    } catch (err) { setSepError(err?.response?.data?.error ?? 'Could not save.') }
    setSepSaving(false)
  }

  // ── Re-paper existing loans ────────────────────────────────────────
  const handleRepaper = async () => {
    setRepapering(true)
    try {
      const r = await repaperLoans()
      setRepaperModal(false)
      setNotice(r.issued > 0
        ? `Pagarés sent for ${r.issued} existing loan${r.issued === 1 ? '' : 's'}. Each employee signs in the app, then you countersign.`
        : 'Every active loan already has a pagaré — nothing to send.')
      load()
    } catch (err) { alert(err?.response?.data?.error ?? 'Could not send.') }
    setRepapering(false)
  }

  // Record a payment straight from the due list — prefilled with that
  // week's installment and period.
  const recordFromDue = async (row) => {
    const d = await getLoan(row.loan_id)
    openPayModal(d.loan)
    setPayPeriod(dueWeek)
    if (row.installment > 0) setPayAmount(String(row.installment))
  }

  // ── Edit deduction schedule ────────────────────────────────────────
  const handleSaveSchedule = async () => {
    if (!scheduleForm.weekly_deduction || parseFloat(scheduleForm.weekly_deduction) <= 0) {
      setScheduleError('Enter a weekly deduction amount.'); return
    }
    if (!scheduleForm.deduction_start_date) { setScheduleError('Pick a deduction start date.'); return }
    setScheduleSaving(true); setScheduleError('')
    try {
      await updateLoan({
        id: scheduleModal.id,
        weekly_deduction: parseFloat(scheduleForm.weekly_deduction),
        deduction_start_date: scheduleForm.deduction_start_date,
      })
      setScheduleModal(null)
      await refreshDetail(scheduleModal.id)
    } catch (err) {
      setScheduleError(err?.response?.data?.error ?? 'Could not save. Try again.')
    }
    setScheduleSaving(false)
  }

  // ── Record payment ───────────────────────────────────────────────
  // W-2 base pay runs through ADP, outside this app — there's no check to
  // deduct from, so a loan payment has to be a real cash/check/transfer
  // event, and needs proof. 1099 checks are calculated and printed here, so
  // their loan repayment is withheld directly from the check's net pay (see
  // Payroll.jsx's use of getPeriodLoanTotals) — recording it is bookkeeping
  // for an amount that's already been deducted, not a separate payment to
  // document.
  const isW2Loan = (loan) => loan?.pay_type === 'w2'

  const openPayModal = (loan) => {
    setPayModal(loan)
    // Defaults to 0, not the remaining balance — the exact amount deducted
    // each paycheck is still entered manually per period.
    setPayAmount('0.00')
    setPayPeriod(0); setPayMethod(isW2Loan(loan) ? 'transfer' : 'payroll_deduction')
    setPayRef(''); setPayReceipt(null); setPayNotes(''); setPayError('')
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  const handleRecordPayment = async () => {
    const amt = parseFloat(payAmount)
    if (payAmount === '' || isNaN(amt) || amt < 0) { setPayError('Enter a valid amount.'); return }
    // $0 is a valid "skip this week" for a 1099 loan (withheld from the check
    // here); for a W-2 loan a payment is a real external transfer, so it can't
    // be zero.
    if (amt === 0 && isW2Loan(payModal)) { setPayError('Enter an amount greater than zero.'); return }
    if ((payMethod === 'check' || payMethod === 'transfer') && !payReceipt) {
      setPayError('Attach a receipt image for check or transfer payments.'); return
    }
    setPaySaving(true); setPayError('')
    const p = periods[payPeriod]
    try {
      const form = new FormData()
      form.append('loan_id', payModal.id)
      form.append('amount', payAmount)
      form.append('payment_method', payMethod)
      if (payRef.trim()) form.append('reference_number', payRef.trim())
      if (payReceipt) form.append('receipt', payReceipt)
      form.append('period_start', p.start)
      form.append('period_end', p.end)
      if (payNotes.trim()) form.append('notes', payNotes.trim())

      await recordPayment(form)
      setPayModal(null)
      await refreshDetail(payModal.id)
    } catch (err) {
      setPayError(err?.response?.data?.error ?? 'Could not record. Try again.')
    }
    setPaySaving(false)
  }

  // ── Delete loan ──────────────────────────────────────────────────
  const handleDeleteLoan = async () => {
    setDeleting(true)
    try {
      await deleteLoan(delLoan.id)
      setDelLoan(null); load()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not delete.')
    }
    setDeleting(false)
  }

  // ── Delete payment ───────────────────────────────────────────────
  const handleDeletePayment = async () => {
    setDeleting(true)
    try {
      await deletePayment(delPayment.id)
      setDelPayment(null)
      await refreshDetail(delPayment.loan_id)
    } catch { alert('Could not delete payment.') }
    setDeleting(false)
  }

  // ── Mark paid off ────────────────────────────────────────────────
  const markPaidOff = async (loan) => {
    await updateLoan({ id: loan.id, status: 'paid_off' })
    load(); setDetail((s) => { const n = { ...s }; delete n[loan.id]; return n })
  }

  // ── Print the loan disbursement check ──────────────────────────────
  // Records check_printed_at the first time (harmless no-op on reprint —
  // the backend only sets it if it isn't already set).
  const openPrintCheck = async (loan) => {
    setPrintLoan(loan)
    try { await updateLoan({ id: loan.id, mark_check_printed: true }) } catch { /* printing still works even if this fails */ }
    load()
  }

  const totalOutstanding = loans.filter((l) => l.status === 'active')
    .reduce((s, l) => s + parseFloat(l.remaining ?? 0), 0)

  return (
    <div className="w-full">
      <PageHeader
        title="Loan Management"
        subtitle="Company loans issued to employees — signed pagaré, then tracked per week"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setRepaperModal(true)}>Send pagarés for existing loans</Button>
            <Button onClick={openNewLoan}>+ New Loan</Button>
          </div>
        }
      />

      {notice && (
        <div className="flex items-start justify-between gap-3 mb-5 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 text-sm text-indigo-800">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-indigo-400 hover:text-indigo-700 shrink-0">✕</button>
        </div>
      )}

      {/* Installments due — what to record for the chosen week */}
      <div className="bg-white rounded-2xl border border-gray-100 mb-5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
          <div>
            <p className="text-sm font-bold text-gray-900">Installments due</p>
            <p className="text-xs text-gray-400">1099: deducted from that week's check · W-2: Zelle to Laura Garcia</p>
          </div>
          <select value={dueWeek} onChange={(e) => setDueWeek(Number(e.target.value))}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
            {periods.map((p, i) => <option key={i} value={i}>Week of {format(new Date(p.start + 'T12:00'), 'MMM d')}{i === 0 ? ' (last week)' : ''}</option>)}
          </select>
        </div>
        {loadingDue ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : dueRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-5">Nothing due that week.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {dueRows.map((r) => {
              const done = r.installment > 0 && r.paid_this_week >= r.installment - 0.004
              return (
                <div key={r.loan_id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{r.user_name}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{r.pay_type === '1099' ? '1099' : 'W-2 · Zelle'}</span>
                      {r.flags.map((f) => (
                        <span key={f} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${FLAG_BADGE[f][1]}`}>{FLAG_BADGE[f][0]}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.installment > 0 && <>Installment {formatCurrency(r.installment)} · recorded {formatCurrency(r.paid_this_week)}</>}
                      {r.behind > 0 && <span className="text-red-600">{r.installment > 0 ? ' · ' : ''}{formatCurrency(r.behind)} behind from earlier weeks</span>}
                      {r.flags.includes('separated') && <> · {formatCurrency(r.remaining)} still owed</>}
                      {r.late_notice_at && <> · late notice given {fmtDb(r.late_notice_at)}</>}
                      {r.demand_letter_at && <> · demand letter sent {fmtDb(r.demand_letter_at)}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:shrink-0">
                    {r.flags.includes('late') && (
                      <Button size="sm" variant="secondary" onClick={() => setLetter({ kind: 'late', row: r })}>Late notice</Button>
                    )}
                    {r.flags.includes('separated') && (
                      <Button size="sm" variant="secondary" onClick={() => setLetter({ kind: 'demand', row: r })}>Demand letter</Button>
                    )}
                    {done
                      ? <span className="text-xs font-semibold text-green-600 px-2 py-1.5">✓ Recorded</span>
                      : <Button size="sm" onClick={() => recordFromDue(r)}>Record</Button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary strip */}
      {loans.some((l) => l.status === 'active') && (
        <div className="flex gap-4 mb-5 flex-wrap">
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex-1 min-w-[160px]">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Outstanding</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex-1 min-w-[160px]">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Active Loans</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{loans.filter((l) => l.status === 'active').length}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {[['active', 'Active'], ['pending', 'Awaiting Signatures'], ['paid_off', 'Paid Off'], ['all', 'All']].map(([val, label]) => (
          <button key={val} onClick={() => setStatus(val)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              statusFilter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {/* Loans list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : loans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          No loans found.{' '}
          <button onClick={openNewLoan} className="text-brand-500 hover:underline">Issue one</button>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => {
            const isExpanded = expanded === loan.id
            const loanDetail = detail[loan.id]
            const _paidPct   = loan.amount > 0 ? Math.min((loan.paid_total / loan.amount) * 100, 100) : 0
            const isPaidOff  = loan.status === 'paid_off'
            const isActive   = loan.status === 'active'
            const isPending  = loan.status === 'pending_signature' || loan.status === 'pending_countersign'
            const [badgeText, badgeCls] = STATUS_BADGE[loan.status] ?? [loan.status, 'bg-gray-100 text-gray-600']
            // An amendment / re-paper note out for signing on an active loan
            const noteOut    = isActive && loan.pending_note_id
            const noteReady  = noteOut && loan.pending_note_borrower_signed_at

            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Loan row — stacked sections on mobile (each gets full card
                    width instead of 3 columns fighting for space), a single
                    row again from sm: up */}
                <div
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(loan)}
                >
                  {/* Employee + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{loan.user_name}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>{badgeText}</span>
                      {noteOut && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 font-semibold px-2 py-0.5 rounded-full">
                          {loan.pending_note_kind === 'amendment' ? 'Amendment' : 'Pagaré'} {noteReady ? 'ready to countersign' : 'awaiting employee signature'}
                        </span>
                      )}
                      {loan.separated_at && (
                        <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
                          Left {fmtDb(loan.separated_at)}{loan.balance_due_date && parseFloat(loan.remaining) > 0 ? ` · rest due ${fmtDb(loan.balance_due_date)}` : ''}
                        </span>
                      )}
                    </div>
                    {loan.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{loan.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Issued {format(new Date(loan.created_at), 'MMM d, yyyy')}
                      {loan.weekly_deduction && (
                        <> · {formatCurrency(loan.weekly_deduction)}/wk from {format(new Date(loan.deduction_start_date + 'T12:00'), 'MMM d, yyyy')}</>
                      )}
                      {loan.check_printed_at && (
                        <> · <span className="text-green-600">✓ Check printed {format(new Date(loan.check_printed_at), 'MMM d')}</span></>
                      )}
                    </p>
                    <ProgressBar paid={parseFloat(loan.paid_total)} total={parseFloat(loan.amount)} />
                  </div>

                  {/* Amounts */}
                  <div className="sm:text-right sm:flex-shrink-0">
                    <p className="text-xs text-gray-400">Remaining</p>
                    <p className={`text-lg font-bold ${isPaidOff ? 'text-green-600' : 'text-gray-900'}`}>
                      {isPaidOff ? formatCurrency(0) : formatCurrency(loan.remaining)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatCurrency(loan.paid_total)} paid of {formatCurrency(loan.amount)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {loan.status === 'pending_signature' && (
                      <Button size="sm" variant="secondary" onClick={() => openNote(loan, loan.pending_note_id, 'view')}>View Pagaré</Button>
                    )}
                    {loan.status === 'pending_countersign' && (
                      <Button size="sm" onClick={() => openNote(loan, loan.pending_note_id, 'countersign')}>Countersign</Button>
                    )}
                    {isPending && (
                      <Button size="sm" variant="secondary" onClick={() => handleVoid(loan)}>Cancel</Button>
                    )}
                    {noteReady && (
                      <Button size="sm" onClick={() => openNote(loan, loan.pending_note_id, 'countersign')}>Countersign</Button>
                    )}
                    {(isActive || isPaidOff) && (
                      <Button size="sm" variant="secondary" onClick={() => openPrintCheck(loan)}>
                        {loan.check_printed_at ? 'Reprint Check' : 'Print Check'}
                      </Button>
                    )}
                    {isActive && (
                      <Button size="sm" onClick={() => openPayModal(loan)}>Record Payment</Button>
                    )}
                    <button
                      onClick={() => toggleExpand(loan)}
                      className={`p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-all ml-auto sm:ml-0 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <ChevronDown />
                    </button>
                  </div>
                </div>

                {/* Expanded payment history */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    {/* Deduction plan */}
                    <div className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3 mb-4">
                      <div className="text-sm">
                        {loan.weekly_deduction ? (
                          <>
                            <p className="text-gray-700">
                              <span className="font-semibold">{formatCurrency(loan.weekly_deduction)}/week</span>
                              {' '}starting {format(new Date(loan.deduction_start_date + 'T12:00'), 'MMM d, yyyy')}
                            </p>
                            {!isPaidOff && (() => {
                              const proj = projectedPayoff(parseFloat(loan.remaining), parseFloat(loan.weekly_deduction), loan.deduction_start_date)
                              return proj && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Projected payoff: ~{proj.weeksNeeded} week{proj.weeksNeeded === 1 ? '' : 's'} away ({format(proj.date, 'MMM d, yyyy')}), at the planned rate
                                </p>
                              )
                            })()}
                          </>
                        ) : (
                          <p className="text-gray-400">No deduction schedule set.</p>
                        )}
                      </div>
                      {isActive && (
                        <button
                          onClick={() => {
                            setScheduleModal(loan)
                            setScheduleForm({
                              weekly_deduction: loan.weekly_deduction ? String(parseFloat(loan.weekly_deduction)) : '',
                              deduction_start_date: loan.deduction_start_date ?? nextPayPeriodStart(),
                            })
                            setScheduleError('')
                          }}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Pagarés on file */}
                    {(notes[loan.id] ?? []).length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pagarés</p>
                        <div className="space-y-2">
                          {notes[loan.id].map((n) => (
                            <div key={n.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                              <div className="min-w-0 text-sm">
                                <p className="font-semibold text-gray-800">
                                  {NOTE_KIND[n.kind]} · {formatCurrency(n.principal)} at {formatCurrency(n.weekly_amount)}/wk from {format(new Date(n.first_due_date + 'T12:00'), 'MMM d, yyyy')}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {n.borrower_signed_at ? `Employee signed ${fmtDb(n.borrower_signed_at)}` : 'Employee has not signed'}
                                  {' · '}
                                  {n.company_signed_at ? `countersigned ${fmtDb(n.company_signed_at)}` : 'not countersigned'}
                                  {' · '}{n.language === 'es' ? 'Spanish' : 'English'}
                                  {n.company_signed_at && (n.emailed_at ? ' · emailed' : ' · not emailed')}
                                </p>
                              </div>
                              <button onClick={() => setNoteOverlay({ note: n, mode: n.borrower_signed_at && !n.company_signed_at ? 'countersign' : 'view', loanId: loan.id })}
                                className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0">
                                {n.borrower_signed_at && !n.company_signed_at ? 'Countersign' : 'View'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {loadingDetail[loan.id] ? (
                      <div className="flex justify-center py-4"><Spinner /></div>
                    ) : !loanDetail ? null : loanDetail.payments.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">No payments recorded yet.</p>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment History</p>
                        <div className="space-y-2">
                          {loanDetail.payments.map((pmt) => (
                            <div key={pmt.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 group">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-green-700">{formatCurrency(pmt.amount)}</span>
                                  {pmt.payment_method && (
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${PAYMENT_METHOD_COLORS[pmt.payment_method]}`}>
                                      {PAYMENT_METHOD_LABELS[pmt.payment_method]}
                                    </span>
                                  )}
                                  {pmt.reference_number && (
                                    <span className="text-xs text-gray-500">#{pmt.reference_number}</span>
                                  )}
                                  {pmt.receipt_file_path && (
                                    <a href={getLoanReceiptUrl(pmt.id)} target="_blank" rel="noopener noreferrer"
                                      className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                                      View Receipt
                                    </a>
                                  )}
                                </div>
                                <div>
                                  {pmt.period_start && (
                                    <span className="text-xs text-gray-500">
                                      Week of {format(new Date(pmt.period_start + 'T00:00:00'), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                  {pmt.notes && <span className="text-xs text-gray-400 ml-2">· {pmt.notes}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400">by {pmt.recorded_by_name}</span>
                                <button
                                  onClick={() => setDelPayment({ ...pmt, loan_id: loan.id })}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:bg-red-50 transition-all"
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Footer actions */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                      {isActive && parseFloat(loan.remaining) <= 0 && (
                        <Button size="sm" onClick={() => markPaidOff(loan)}>Mark as Paid Off</Button>
                      )}
                      {isActive && parseFloat(loan.remaining) > 0 && !loan.pending_note_id && (
                        <Button size="sm" variant="secondary" onClick={() => {
                          setAmendModal(loan)
                          setAmendForm({ weekly_deduction: loan.weekly_deduction ? String(parseFloat(loan.weekly_deduction)) : '', first_due_date: earliestFirstDue() })
                          setAmendError('')
                        }}>Amend (raise amount)</Button>
                      )}
                      {isActive && parseFloat(loan.remaining) > 0 && !loan.separated_at && (
                        <Button size="sm" variant="secondary" onClick={() => openSeparation(loan)}>Employee leaving…</Button>
                      )}
                      {!isPending && !loanDetail?.payments?.length && !(notes[loan.id] ?? []).some((n) => n.borrower_signed_at) && (
                        <Button size="sm" variant="danger" onClick={() => setDelLoan(loan)}>Delete Loan</Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── New Loan modal ─────────────────────────────────────────── */}
      <Modal isOpen={newModal} onClose={() => setNewModal(false)} title="Issue New Loan">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Employee</label>
            <select
              value={newForm.user_id}
              onChange={(e) => { setLimitHit(null); setOverrideReason(''); setNewForm((f) => ({ ...f, user_id: e.target.value })) }}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            >
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Loan Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number" min="0.01" step="0.01"
                value={newForm.amount}
                onChange={(e) => setNewForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Weekly Payment</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={newForm.weekly_deduction}
                    onChange={(e) => setNewForm((f) => ({ ...f, weekly_deduction: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">First Payment Week</label>
              <input
                type="date"
                value={newForm.deduction_start_date}
                min={earliestFirstDue()}
                onChange={(e) => setNewForm((f) => ({ ...f, deduction_start_date: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              First payment week (a Monday, at least 7 days from now — South Carolina requires 7 days' notice).
            </p>
          </div>

          {newPreview && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Installments needed</p>
              <p className="text-2xl font-bold text-gray-900 leading-tight">{newPreview.n} {newPreview.n === 1 ? 'week' : 'weeks'}</p>
              <p className="mt-0.5">
                {newPreview.n === 1
                  ? <>One payment of {formatCurrency(newPreview.last)}</>
                  : <>{Math.abs(newPreview.last - Math.min(newWeekly, newAmount)) > 0.004
                      ? <>{newPreview.n - 1} × {formatCurrency(Math.min(newWeekly, newAmount))} + a last payment of {formatCurrency(newPreview.last)}</>
                      : <>{newPreview.n} × {formatCurrency(Math.min(newWeekly, newAmount))}</>}</>}
                {isMondayISO(newForm.deduction_start_date) && (() => {
                  const start = new Date(newForm.deduction_start_date + 'T12:00')
                  return <> · {format(start, 'MMM d')} – {format(addDays(start, (newPreview.n - 1) * 7), 'MMM d, yyyy')}</>
                })()}
              </p>
              <span className="block text-xs text-gray-400 mt-1">No interest. The employee signs the pagaré in the app, then you countersign — only then is the loan active.</span>
            </div>
          )}

          {limitHit && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-red-700">
                This employee already has {limitHit.count} loans in the last 12 months (limit {limitHit.limit}).
              </p>
              <p className="text-xs text-red-600 mt-0.5">You can still issue it — enter the reason, which is saved with the loan.</p>
              <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for going over the limit"
                className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400" />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={newForm.description}
              onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Tools advance, Emergency loan"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          {newError && <p className="text-sm text-red-600">{newError}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setNewModal(false)}>Cancel</Button>
            <Button fullWidth loading={newSaving} onClick={handleCreateLoan}>{limitHit ? 'Issue anyway' : 'Create & send pagaré'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Record payment modal ───────────────────────────────────── */}
      <Modal isOpen={!!payModal} onClose={() => setPayModal(null)} title={`Record Payment — ${payModal?.user_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          {payModal && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Original loan</span>
                <span className="font-semibold">{formatCurrency(payModal.amount)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">Paid to date</span>
                <span className="text-green-600 font-semibold">{formatCurrency(payModal.paid_total)}</span>
              </div>
              <div className="flex justify-between mt-1 border-t border-gray-200 pt-2">
                <span className="font-semibold text-gray-700">Remaining</span>
                <span className="font-bold text-gray-900">{formatCurrency(payModal.remaining)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Pay Period</label>
            <select
              value={payPeriod}
              onChange={(e) => setPayPeriod(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            >
              {periods.map((p, i) => (
                <option key={i} value={i}>{p.label} ({p.start})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deduction Amount</label>
              {payModal?.weekly_deduction && (
                <button type="button" onClick={() => setPayAmount(String(parseFloat(payModal.weekly_deduction)))}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Use planned {formatCurrency(payModal.weekly_deduction)}/wk
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number" min="0" step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
            {!isW2Loan(payModal) && (
              <p className="text-xs text-gray-400 mt-1">Enter $0 to skip this week&rsquo;s deduction.</p>
            )}
          </div>

          {isW2Loan(payModal) ? (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'cash',     label: 'Cash' },
                    { value: 'check',    label: 'Check' },
                    { value: 'transfer', label: 'Transfer' },
                  ].map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => setPayMethod(opt.value)}
                      className={`px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                        payMethod === opt.value
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {(payMethod === 'check' || payMethod === 'transfer') && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      {payMethod === 'check' ? 'Check Number' : 'Transfer / Confirmation Number'} (if applicable)
                    </label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder={payMethod === 'check' ? 'e.g. 1042' : 'e.g. Zelle confirmation ID'}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      Receipt Image <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => setPayReceipt(e.target.files?.[0] ?? null)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-semibold"
                    />
                    <p className="text-xs text-gray-400 mt-1">Photo or screenshot of the {payMethod === 'check' ? 'check' : 'transfer'} confirmation.</p>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
              Deducted directly from their next 1099 check — no separate payment method or receipt needed.
            </p>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="e.g. Agreed installment"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          {payError && <p className="text-sm text-red-600">{payError}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setPayModal(null)}>Cancel</Button>
            <Button fullWidth loading={paySaving} onClick={handleRecordPayment}>
              {!isW2Loan(payModal) && parseFloat(payAmount) === 0 ? 'Skip This Week' : 'Record Deduction'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit deduction schedule modal ──────────────────────────── */}
      <Modal isOpen={!!scheduleModal} onClose={() => setScheduleModal(null)} title={`Deduction Schedule — ${scheduleModal?.user_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Weekly Deduction</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number" min="0.01" step="0.01"
                value={scheduleForm.weekly_deduction}
                onChange={(e) => setScheduleForm((f) => ({ ...f, weekly_deduction: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Deduction Starts</label>
            <input
              type="date"
              value={scheduleForm.deduction_start_date}
              onChange={(e) => setScheduleForm((f) => ({ ...f, deduction_start_date: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
          </div>

          <p className="text-xs text-gray-400 -mt-1">
            You can lower the weekly amount or start later here. To raise it or start sooner, use <strong>Amend</strong> — the employee has to sign the change.
          </p>

          {scheduleError && <p className="text-sm text-red-600">{scheduleError}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setScheduleModal(null)}>Cancel</Button>
            <Button fullWidth loading={scheduleSaving} onClick={handleSaveSchedule}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete loan confirm ────────────────────────────────────── */}
      <Modal isOpen={!!delLoan} onClose={() => setDelLoan(null)} title="Delete Loan">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-4 text-sm">
            <p className="font-medium text-gray-900">{delLoan?.user_name}</p>
            <p className="text-gray-500 mt-0.5">{formatCurrency(delLoan?.amount ?? 0)}{delLoan?.description ? ` — ${delLoan.description}` : ''}</p>
          </div>
          <p className="text-sm text-gray-600">This loan has no payments recorded. Are you sure you want to delete it?</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDelLoan(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={handleDeleteLoan}>Delete</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete payment confirm ─────────────────────────────────── */}
      <Modal isOpen={!!delPayment} onClose={() => setDelPayment(null)} title="Remove Payment">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Remove the <strong>{formatCurrency(delPayment?.amount ?? 0)}</strong> payment recorded by {delPayment?.recorded_by_name}?
            The loan balance will be restored.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDelPayment(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={handleDeletePayment}>Remove</Button>
          </div>
        </div>
      </Modal>

      {/* ── Amend modal ─────────────────────────────────────────────── */}
      <Modal isOpen={!!amendModal} onClose={() => setAmendModal(null)} title={`Amend Loan — ${amendModal?.user_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Raising the weekly amount needs a new signed pagaré for the remaining <strong>{formatCurrency(amendModal?.remaining ?? 0)}</strong>.
            The current amount stays in effect until the employee signs and you countersign.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">New weekly amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                <input type="number" min="0.01" step="0.01" value={amendForm.weekly_deduction}
                  onChange={(e) => setAmendForm((f) => ({ ...f, weekly_deduction: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Starting week of</label>
              <input type="date" min={earliestFirstDue()} value={amendForm.first_due_date}
                onChange={(e) => setAmendForm((f) => ({ ...f, first_due_date: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">A Monday at least 7 days from now. To lower the amount or skip a week, you don't need this — use Edit, or record less.</p>
          {amendError && <p className="text-sm text-red-600">{amendError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setAmendModal(null)}>Cancel</Button>
            <Button fullWidth loading={amendSaving} onClick={handleAmend}>Send amendment to sign</Button>
          </div>
        </div>
      </Modal>

      {/* ── Separation modal ───────────────────────────────────────── */}
      <Modal isOpen={!!sepModal} onClose={() => setSepModal(null)} title={`Employee Leaving — ${sepModal?.user_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Per the pagaré, the whole balance is due now. You can take it from the final pay, but must leave at least
            {' '}{formatCurrency(sepPreview?.min_wage ?? 7.25)} for every hour worked that final week. Anything left is due within 30 days.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Last day</label>
              <input type="date" value={sepForm.date}
                onChange={(e) => { setSepForm((f) => ({ ...f, date: e.target.value })); if (e.target.value) loadSepPreview(sepModal.user_id, e.target.value) }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Hours final week</label>
              <input type="number" min="0" step="0.01" value={sepForm.hours}
                onChange={(e) => setSepForm((f) => ({ ...f, hours: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Final pay gross {sepModal?.pay_type === 'w2' ? '(from ADP)' : '(final 1099 payment)'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={sepForm.final_gross}
                onChange={(e) => setSepForm((f) => ({ ...f, final_gross: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          {sepPreview ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Balance owed (all loans)</span><span className="font-semibold">{formatCurrency(sepPreview.balance)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Must leave in final pay ({sepHours} h × {formatCurrency(sepPreview.min_wage)})</span><span>{formatCurrency(sepFloor)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1"><span className="font-semibold text-gray-700">Most you can deduct</span><span className="font-bold">{formatCurrency(Math.min(sepMax, sepPreview.balance))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Still owed after, due {format(new Date(sepPreview.balance_due_date + 'T12:00'), 'MMM d, yyyy')}</span><span>{formatCurrency(Math.max(0, sepPreview.balance - (sepForm.deduct_amount !== '' ? parseFloat(sepForm.deduct_amount) || 0 : sepDefault)))}</span></div>
            </div>
          ) : !sepError && <div className="flex justify-center py-3"><Spinner /></div>}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount to deduct (optional — defaults to the most allowed)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={sepForm.deduct_amount} placeholder={sepDefault.toFixed(2)}
                onChange={(e) => setSepForm((f) => ({ ...f, deduct_amount: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
            {sepModal?.pay_type === 'w2' && <p className="text-xs text-gray-400 mt-1">Set the same deduction on the final check in ADP.</p>}
          </div>
          {sepError && <p className="text-sm text-red-600">{sepError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setSepModal(null)}>Cancel</Button>
            <Button fullWidth loading={sepSaving} onClick={handleSeparate} disabled={!sepPreview}>Record final-pay deduction</Button>
          </div>
        </div>
      </Modal>

      {/* ── Re-paper existing loans confirm ────────────────────────── */}
      <Modal isOpen={repaperModal} onClose={() => setRepaperModal(false)} title="Send Pagarés for Existing Loans">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Every active loan without a signed pagaré gets one for its <strong>current balance</strong> and remaining weekly schedule,
            starting at least 7 days from now. Each employee signs in the app, then you countersign.
          </p>
          <p className="text-sm text-gray-600">
            Until an employee signs, keep recording their payments as usual. If a pagaré is still unsigned after 14 days, it's flagged
            in Installments due — stop recording 1099 deductions for that loan and collect it another way.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setRepaperModal(false)}>Cancel</Button>
            <Button fullWidth loading={repapering} onClick={handleRepaper}>Send pagarés</Button>
          </div>
        </div>
      </Modal>

      {noteOverlay && (
        <LoanNoteOverlay
          note={noteOverlay.note}
          mode={noteOverlay.mode}
          onClose={() => setNoteOverlay(null)}
          onDone={handleCountersigned}
        />
      )}

      {letter && (
        <PrintLoanLetter
          kind={letter.kind}
          row={letter.row}
          onClose={() => setLetter(null)}
          onPrinted={() => {
            updateLoan({ id: letter.row.loan_id, [letter.kind === 'late' ? 'mark_late_notice' : 'mark_demand_letter']: true })
              .then(loadDue).catch(() => {})
          }}
        />
      )}

      {/* ── Print loan disbursement check ──────────────────────────── */}
      {printLoan && (
        <PrintLoanCheck loan={printLoan} onClose={() => setPrintLoan(null)} />
      )}
    </div>
  )
}
