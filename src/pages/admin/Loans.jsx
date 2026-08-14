import { useState, useEffect, useRef } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { listLoans, getLoan, createLoan, updateLoan, deleteLoan, recordPayment, deletePayment, getLoanReceiptUrl } from '../../api/loans'
import { listEmployees } from '../../api/employees'
import { formatCurrency } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks, addDays } from 'date-fns'

const periods = Array.from({ length: 8 }, (_, i) => {
  const start = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
  const end   = endOfWeek(subWeeks(new Date(), i),   { weekStartsOn: 1 })
  return {
    label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : format(start, 'MMM d'),
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

const PAYMENT_METHOD_LABELS = { cash: 'Cash', check: 'Check', transfer: 'Transfer' }
const PAYMENT_METHOD_COLORS = {
  cash:     'bg-gray-100 text-gray-600',
  check:    'bg-blue-100 text-blue-700',
  transfer: 'bg-purple-100 text-purple-700',
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

  const load = async () => {
    setLoading(true)
    try {
      const [ld, ed] = await Promise.all([
        listLoans(statusFilter !== 'all' ? { status: statusFilter } : {}),
        listEmployees(),
      ])
      setLoans(ld.loans ?? [])
      setEmployees((ed.employees ?? []).filter((e) => e.is_active && e.role !== 'contractor'))
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [statusFilter])

  // ── Expand / collapse loan detail ───────────────────────────────
  const toggleExpand = async (loan) => {
    if (expanded === loan.id) { setExpanded(null); return }
    setExpanded(loan.id)
    if (detail[loan.id]) return
    setLD((s) => ({ ...s, [loan.id]: true }))
    try {
      const d = await getLoan(loan.id)
      setDetail((s) => ({ ...s, [loan.id]: d.loan }))
    } finally { setLD((s) => ({ ...s, [loan.id]: false })) }
  }

  const refreshDetail = async (loanId) => {
    const d = await getLoan(loanId)
    setDetail((s) => ({ ...s, [loanId]: d.loan }))
    // Also refresh top-level list row
    load()
  }

  // ── Create loan ──────────────────────────────────────────────────
  const handleCreateLoan = async () => {
    if (!newForm.user_id) { setNewError('Select an employee.'); return }
    if (!newForm.amount || parseFloat(newForm.amount) <= 0) { setNewError('Enter a valid amount.'); return }
    if (!newForm.weekly_deduction || parseFloat(newForm.weekly_deduction) <= 0) { setNewError('Enter a weekly deduction amount.'); return }
    if (!newForm.deduction_start_date) { setNewError('Pick a deduction start date.'); return }
    setNewSaving(true); setNewError('')
    try {
      await createLoan({
        user_id:              parseInt(newForm.user_id),
        amount:                parseFloat(newForm.amount),
        weekly_deduction:      parseFloat(newForm.weekly_deduction),
        deduction_start_date:  newForm.deduction_start_date,
        description:           newForm.description.trim() || null,
      })
      setNewModal(false)
      load()
    } catch (err) {
      setNewError(err?.response?.data?.error ?? 'Could not create. Try again.')
    }
    setNewSaving(false)
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
  const openPayModal = (loan) => {
    setPayModal(loan)
    // Defaults to 0, not the remaining balance — the exact amount deducted
    // each paycheck is still entered manually per period.
    setPayAmount('0.00')
    setPayPeriod(0); setPayMethod('transfer'); setPayRef(''); setPayReceipt(null); setPayNotes(''); setPayError('')
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  const handleRecordPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setPayError('Enter a valid amount.'); return }
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

  const totalOutstanding = loans.filter((l) => l.status === 'active')
    .reduce((s, l) => s + parseFloat(l.remaining ?? 0), 0)

  return (
    <div className="w-full">
      <PageHeader
        title="Loan Management"
        subtitle="Company loans issued to employees — tracked and deducted per paycheck"
        actions={<Button onClick={() => {
          setNewForm({ user_id: '', amount: '', weekly_deduction: '', deduction_start_date: nextPayPeriodStart(), description: '' })
          setNewError(''); setNewModal(true)
        }}>+ New Loan</Button>}
      />

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
        {[['active', 'Active'], ['paid_off', 'Paid Off'], ['all', 'All']].map(([val, label]) => (
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
          <button onClick={() => setNewModal(true)} className="text-brand-500 hover:underline">Issue one</button>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => {
            const isExpanded = expanded === loan.id
            const loanDetail = detail[loan.id]
            const _paidPct   = loan.amount > 0 ? Math.min((loan.paid_total / loan.amount) * 100, 100) : 0
            const isPaidOff  = loan.status === 'paid_off'

            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Loan row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(loan)}
                >
                  {/* Employee + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{loan.user_name}</span>
                      {isPaidOff
                        ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Paid Off</span>
                        : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Active</span>
                      }
                    </div>
                    {loan.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{loan.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Issued {format(new Date(loan.created_at), 'MMM d, yyyy')}
                      {loan.weekly_deduction && (
                        <> · {formatCurrency(loan.weekly_deduction)}/wk from {format(new Date(loan.deduction_start_date + 'T12:00'), 'MMM d, yyyy')}</>
                      )}
                    </p>
                    <ProgressBar paid={parseFloat(loan.paid_total)} total={parseFloat(loan.amount)} />
                  </div>

                  {/* Amounts */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">Remaining</p>
                    <p className={`text-lg font-bold ${isPaidOff ? 'text-green-600' : 'text-gray-900'}`}>
                      {isPaidOff ? formatCurrency(0) : formatCurrency(loan.remaining)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatCurrency(loan.paid_total)} paid of {formatCurrency(loan.amount)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isPaidOff && (
                      <Button size="sm" onClick={() => openPayModal(loan)}>Record Payment</Button>
                    )}
                    <button
                      onClick={() => toggleExpand(loan)}
                      className={`p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-all ${isExpanded ? 'rotate-180' : ''}`}
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
                      {!isPaidOff && (
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
                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                      {!isPaidOff && parseFloat(loan.remaining) <= 0 && (
                        <Button size="sm" onClick={() => markPaidOff(loan)}>Mark as Paid Off</Button>
                      )}
                      {!loanDetail?.payments?.length && (
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
              onChange={(e) => setNewForm((f) => ({ ...f, user_id: e.target.value }))}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Weekly Deduction</label>
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
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Deduction Starts</label>
              <input
                type="date"
                value={newForm.deduction_start_date}
                onChange={(e) => setNewForm((f) => ({ ...f, deduction_start_date: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            Deductions default to next pay period — not the one already in progress. Amount per paycheck is still entered manually via Register Payment.
          </p>

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
            <Button fullWidth loading={newSaving} onClick={handleCreateLoan}>Issue Loan</Button>
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
                type="number" min="0.01" step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>

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
            <Button fullWidth loading={paySaving} onClick={handleRecordPayment}>Record Deduction</Button>
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
    </div>
  )
}
