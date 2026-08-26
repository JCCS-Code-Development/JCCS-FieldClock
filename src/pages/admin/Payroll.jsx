import { useState, useEffect, useRef } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import PrintChecks from '../../components/admin/PrintChecks'
import PrintContractorCheck from '../../components/admin/PrintContractorCheck'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Input from '../../components/ui/Input'
import { getSummary, getBreakdown, listAdjustments, createAdjustment, updateAdjustment, deleteAdjustment, listFlatRatePayments, createFlatRatePayment, updateFlatRatePayment, deleteFlatRatePayment } from '../../api/payroll'
import { listEmployees, createEmployee } from '../../api/employees'
import { listInvoices, getInvoice, uploadInvoice, updateInvoiceStatus, getDownloadUrl } from '../../api/contractor'
import { listEstimates } from '../../api/estimates'
import { getPeriodLoanTotals } from '../../api/loans'
import { listPaychecks, createPaycheck, updatePaycheck, deletePaycheck, markAllAvailable } from '../../api/paychecks'
import PayPieChart from '../../components/ui/PayPieChart'
import { formatCurrency, formatHours, formatDate } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks, startOfYear, differenceInWeeks } from 'date-fns'

const _today         = new Date()
const _lastWeekStart = startOfWeek(subWeeks(_today, 1), { weekStartsOn: 1 })
const _yearWeekStart = startOfWeek(startOfYear(_today), { weekStartsOn: 1 })
const _numWeeks      = differenceInWeeks(_lastWeekStart, _yearWeekStart) + 1

const periods = Array.from({ length: _numWeeks }, (_, i) => {
  const start = startOfWeek(subWeeks(_today, i + 1), { weekStartsOn: 1 })
  const end   = endOfWeek(subWeeks(_today, i + 1), { weekStartsOn: 1 })
  return {
    label: i === 0 ? 'Last Week' : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
    start: format(start, 'yyyy-MM-dd'),
    end:   format(end,   'yyyy-MM-dd'),
  }
})

const ADJ_TYPES = [
  { value: 'bonus',         label: 'Bonus',        color: 'bg-green-100 text-green-700' },
  { value: 'reimbursement', label: 'Reimbursement', color: 'bg-blue-100 text-blue-700' },
  { value: 'gas_allowance', label: 'Gas Allowance', color: 'bg-amber-100 text-amber-700' },
  { value: 'adjustment',    label: 'Adjustment',    color: 'bg-gray-100 text-gray-600' },
]
const adjColor = (t) => ADJ_TYPES.find((a) => a.value === t)?.color ?? 'bg-gray-100 text-gray-600'
const adjLabel = (t) => ADJ_TYPES.find((a) => a.value === t)?.label ?? t

const INV_STATUS = {
  submitted:    { label: 'Submitted',    color: 'bg-amber-100 text-amber-700' },
  under_review: { label: 'Under Review', color: 'bg-blue-100 text-blue-700' },
  check_ready:  { label: 'Check Ready',  color: 'bg-green-100 text-green-700' },
  paid:         { label: 'Paid',         color: 'bg-gray-100 text-gray-600' },
}

const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
)
const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>
)

const BLANK_FORM = { user_id: '', type: 'bonus', amount: '', description: '' }

export default function AdminPayroll() {
  const [tab, setTab]       = useState('w2')
  const [period, setPeriod] = useState(0)
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)

  // Drill-down
  const [drillDown, setDrillDown] = useState(null)
  const [breakdown, setBreakdown] = useState(null)

  // Bonuses & Adjustments
  const [adjustments,  setAdjustments]  = useState([])
  const [loadingAdj,   setLoadingAdj]   = useState(false)
  const [bonusModal,   setBonusModal]   = useState(null)
  const [bonusForm,    setBonusForm]    = useState(BLANK_FORM)
  const [bonusSaving,  setBonusSaving]  = useState(false)
  const [bonusError,   setBonusError]   = useState('')
  const [deleteAdj,    setDeleteAdj]    = useState(null)
  const [deletingAdj,  setDeletingAdj]  = useState(false)

  // Per-period loan deductions keyed by user_id
  const [loanDeductions, setLoanDeductions] = useState({})

  const [printOpen, setPrintOpen] = useState(false)

  // Contractor invoices
  const [contractorInvs, setContractorInvs] = useState([])
  const [loadingInvs,    setLoadingInvs]    = useState(false)
  const [statusModal,    setStatusModal]    = useState(null)
  const [statusValue,    setStatusValue]    = useState('')
  const [statusNote,     setStatusNote]     = useState('')
  const [statusEstimateNumber, setStatusEstimateNumber] = useState('')
  const [statusJobLocation,    setStatusJobLocation]    = useState('')
  const [statusInvNum,   setStatusInvNum]   = useState('')
  const [statusAmount,   setStatusAmount]   = useState('')
  const [statusSaving,   setStatusSaving]   = useState(false)
  const [statusError,    setStatusError]    = useState('')

  // Upload invoice (admin, on behalf of a contractor)
  const [invModal,      setInvModal]      = useState(false)
  const [invForm,       setInvForm]       = useState({ user_id: '', estimate_number: '', job_location: '', invoice_number: '', amount: '', file: null })
  const [invSaving,     setInvSaving]     = useState(false)
  const [invError,      setInvError]      = useState('')
  const invFileRef = useRef(null)

  // Contractor combobox (Upload Invoice modal) — type-to-filter registered
  // contractors, or register a brand new one inline without leaving the modal
  const [invContractorQuery, setInvContractorQuery] = useState('')
  const [invContractorOpen,  setInvContractorOpen]  = useState(false)
  const [quickAddContractor, setQuickAddContractor] = useState(null) // { name, address } | null
  const [qacSaving,          setQacSaving]           = useState(false)
  const [qacError,           setQacError]            = useState('')

  // Print contractor check(s)
  const [printInvoices, setPrintInvoices] = useState(null) // array of full invoice detail | null
  const [printLoading,  setPrintLoading]  = useState(false)
  const [selectedInvIds, setSelectedInvIds] = useState(new Set()) // invoice ids picked for one combined print run

  // Gas review
  const [gasModal,     setGasModal]     = useState(false)
  const [gasEmployees, setGasEmployees] = useState([])
  const [gasAmounts,   setGasAmounts]   = useState({})
  const [gasChecked,   setGasChecked]   = useState({})
  const [gasSaving,    setGasSaving]    = useState(false)

  // Flat rate payments
  const [flatRatePayments, setFlatRatePayments] = useState([])
  const [loadingFR,        setLoadingFR]        = useState(false)
  const [frModal,          setFrModal]          = useState(false)
  const [frForm,           setFrForm]           = useState({ user_id: '', amount: '', description: '' })
  const [frSaving,         setFrSaving]         = useState(false)
  const [frError,          setFrError]          = useState('')
  const [frPrintOpen,      setFrPrintOpen]      = useState(false)

  // Paychecks
  const [paychecks,      setPaychecks]      = useState([])
  const [loadingPay,     setLoadingPay]     = useState(false)
  const [pcModal,        setPcModal]        = useState(false)   // create modal
  const [pcForm,         setPcForm]         = useState({ user_id: '', amount: '', notes: '' })
  const [pcSaving,       setPcSaving]       = useState(false)
  const [pcError,        setPcError]        = useState('')
  const [pcStatusTarget, setPcStatusTarget] = useState(null)    // { paycheck, nextStatus }
  const [pcStatusSaving, setPcStatusSaving] = useState(false)
  const [pcStatusError,  setPcStatusError]  = useState('')
  const [pcVoidTarget,   setPcVoidTarget]   = useState(null)    // paycheck being voided
  const [pcVoidReason,   setPcVoidReason]   = useState('')
  const [pcVoiding,      setPcVoiding]      = useState(false)
  const [pcMarkingAll,   setPcMarkingAll]   = useState(false)
  const [employees,      setEmployees]      = useState([])

  const p = periods[period]

  const loadSummary = () => {
    setLoading(true)
    getSummary({ start: p.start, end: p.end })
      .then((d) => setSummary(d.summary ?? []))
      .finally(() => setLoading(false))
  }

  const loadAdjustments = () => {
    setLoadingAdj(true)
    listAdjustments({ period_start: p.start, period_end: p.end })
      .then((d) => setAdjustments(d.adjustments ?? []))
      .finally(() => setLoadingAdj(false))
  }

  const loadFlatRatePayments = () => {
    setLoadingFR(true)
    listFlatRatePayments({ period_start: p.start, period_end: p.end })
      .then((d) => setFlatRatePayments(d.flat_rate_payments ?? []))
      .finally(() => setLoadingFR(false))
  }

  const loadContractorInvoices = () => {
    setLoadingInvs(true)
    listInvoices({ period_start: p.start, period_end: p.end })
      .then((d) => setContractorInvs(d.invoices ?? []))
      .finally(() => setLoadingInvs(false))
  }

  const loadPaychecks = () => {
    setLoadingPay(true)
    listPaychecks().then((d) => setPaychecks(d.paychecks ?? [])).finally(() => setLoadingPay(false))
  }

  useEffect(() => {
    loadSummary()
    loadAdjustments()
    loadContractorInvoices()
    loadFlatRatePayments()
    getPeriodLoanTotals(p.start, p.end).then(setLoanDeductions).catch(() => setLoanDeductions({}))
    setFrPrintOpen(false)  // close flat rate print if period changes mid-open
    setSelectedInvIds(new Set()) // a prior period's selection shouldn't carry over
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  useEffect(() => {
    loadPaychecks()
    // /employees/index.php has no server-side role filter, so this holds
    // every active user (admins, employees, and contractors) — callers
    // filter by role themselves at each picker's render site, since
    // different pickers here need different subsets (e.g. the contractor
    // invoice picker further down needs contractors; the paycheck/flat-rate
    // pickers don't).
    listEmployees({ active: 1 }).then((d) => setEmployees(d.employees ?? [])).catch(() => {})
  }, [])

  const handleCreatePaycheck = async (e) => {
    e.preventDefault()
    if (!pcForm.user_id) { setPcError('Select an employee.'); return }
    setPcSaving(true); setPcError('')
    try {
      await createPaycheck({
        user_id:      parseInt(pcForm.user_id),
        period_start: p.start,
        period_end:   p.end,
        amount:       pcForm.amount ? parseFloat(pcForm.amount) : null,
        notes:        pcForm.notes || null,
      })
      setPcModal(false)
      setPcForm({ user_id: '', amount: '', notes: '' })
      loadPaychecks()
    } catch (err) {
      setPcError(err?.response?.data?.error ?? 'Failed to create paycheck.')
    }
    setPcSaving(false)
  }

  const handlePcStatus = async () => {
    if (!pcStatusTarget) return
    setPcStatusSaving(true)
    setPcStatusError('')
    try {
      await updatePaycheck({ id: pcStatusTarget.paycheck.id, status: pcStatusTarget.nextStatus })
      setPcStatusTarget(null)
      loadPaychecks()
    } catch (err) {
      // Previously a silent no-op on failure — the Confirm button would spin
      // briefly and then just... do nothing, with no way to tell it failed.
      // Surface the actual error instead so it's visible in the modal.
      setPcStatusError(err?.response?.data?.error ?? 'Failed to update paycheck status. Please try again.')
    }
    setPcStatusSaving(false)
  }

  const handleDeletePaycheck = async (id) => {
    if (!window.confirm('Delete this paycheck record?')) return
    await deletePaycheck(id)
    loadPaychecks()
  }

  const handleVoidPaycheck = async () => {
    if (!pcVoidTarget) return
    setPcVoiding(true)
    try {
      await updatePaycheck({ id: pcVoidTarget.id, status: 'voided', void_reason: pcVoidReason.trim() || null })
      setPcVoidTarget(null)
      setPcVoidReason('')
      loadPaychecks()
    } finally { setPcVoiding(false) }
  }

  const handleMarkAllAvailable = async () => {
    if (!window.confirm(`Mark all pending paychecks for ${p.label} as available? This will notify every employee.`)) return
    setPcMarkingAll(true)
    try {
      await markAllAvailable(p.start, p.end)
      loadPaychecks()
    } finally { setPcMarkingAll(false) }
  }

  // ── Drill-down ───────────────────────────────────────────────────
  const openDrillDown = async (emp) => {
    setDrillDown(emp); setBreakdown(null)
    const d = await getBreakdown({ user_id: emp.user_id, start: p.start, end: p.end })
    setBreakdown(d.breakdown ?? {})
  }

  // ── Bonus / adjustment CRUD ──────────────────────────────────────
  const openNewBonus = (emp = null) => {
    setBonusForm({ ...BLANK_FORM, user_id: emp?.user_id ?? '' })
    setBonusError('')
    setBonusModal({})
  }

  const openEditBonus = (adj) => {
    setBonusForm({ user_id: adj.user_id, type: adj.type, amount: String(adj.amount), description: adj.description ?? '' })
    setBonusError('')
    setBonusModal(adj)
  }

  const handleSaveBonus = async () => {
    if (!bonusForm.user_id) { setBonusError('Select an employee.'); return }
    if (!bonusForm.amount || isNaN(parseFloat(bonusForm.amount))) { setBonusError('Enter a valid amount.'); return }
    setBonusSaving(true); setBonusError('')
    try {
      const payload = {
        user_id: parseInt(bonusForm.user_id), type: bonusForm.type,
        amount: parseFloat(bonusForm.amount), description: bonusForm.description.trim(),
        period_start: p.start, period_end: p.end,
      }
      if (bonusModal.id) { await updateAdjustment(bonusModal.id, payload) } else { await createAdjustment(payload) }
      setBonusModal(null); loadSummary(); loadAdjustments()
    } catch (err) {
      setBonusError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setBonusSaving(false) }
  }

  const handleDeleteAdj = async () => {
    setDeletingAdj(true)
    try {
      await deleteAdjustment(deleteAdj.id)
      setDeleteAdj(null); loadSummary(); loadAdjustments()
    } finally { setDeletingAdj(false) }
  }

  // ── Flat rate payments CRUD ──────────────────────────────────────
  const handleCreateFlatRate = async (e) => {
    e.preventDefault()
    if (!frForm.user_id)    { setFrError('Select an employee.'); return }
    if (!frForm.amount || isNaN(parseFloat(frForm.amount))) { setFrError('Enter a valid amount.'); return }
    if (!frForm.description.trim()) { setFrError('Enter a description.'); return }
    setFrSaving(true); setFrError('')
    try {
      await createFlatRatePayment({
        user_id:      parseInt(frForm.user_id),
        amount:       parseFloat(frForm.amount),
        description:  frForm.description.trim(),
        period_start: p.start,
        period_end:   p.end,
      })
      setFrModal(false)
      setFrForm({ user_id: '', amount: '', description: '' })
      loadFlatRatePayments()
    } catch (err) {
      setFrError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally {
      setFrSaving(false)
    }
  }

  const handleFrMarkIssued = async (fr) => {
    try {
      await updateFlatRatePayment(fr.id, { status: 'issued' })
      loadFlatRatePayments()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not mark as issued. Try again.')
    }
  }

  const handleDeleteFlatRate = async (fr) => {
    if (!window.confirm(`Delete flat rate payment for ${fr.user_name}?`)) return
    try {
      await deleteFlatRatePayment(fr.id)
      loadFlatRatePayments()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not delete. Try again.')
    }
  }

  // ── Contractor invoice status / estimate assignment ───────────────
  const openStatusModal = (inv) => {
    setStatusModal(inv)
    setStatusValue(inv.status)
    setStatusNote(inv.admin_note ?? '')
    setStatusEstimateNumber(inv.resolved_estimate_number ?? inv.estimate_number ?? '')
    setStatusJobLocation(inv.job_name ?? inv.job_location ?? '')
    setStatusInvNum(inv.invoice_number ?? '')
    setStatusAmount(inv.amount != null ? String(parseFloat(inv.amount)) : '')
    setStatusError('')
  }

  // Looks up the typed estimate # against existing estimates on blur — if it
  // matches an existing one, autofills the job/location field (still
  // editable) so the invoice links up with that project's tracking.
  const handleEstimateNumberBlur = async (estimateNumber, setJobLocation) => {
    const trimmed = estimateNumber.trim()
    if (!trimmed) return
    try {
      const d = await listEstimates({ estimate_number: trimmed })
      if (d.estimate) setJobLocation(d.estimate.job_name)
    } catch { /* no match, or lookup failed — leave job/location as typed */ }
  }

  const handleSaveStatus = async () => {
    setStatusSaving(true); setStatusError('')
    try {
      await updateInvoiceStatus({
        id: statusModal.id,
        status: statusValue,
        admin_note: statusNote,
        estimate_number: statusEstimateNumber.trim() || null,
        job_location: statusJobLocation.trim() || null,
        invoice_number: statusInvNum.trim() || null,
        amount: statusAmount !== '' ? parseFloat(statusAmount) : null,
      })
      setStatusModal(null); loadContractorInvoices()
    } catch (err) {
      setStatusError(err?.response?.data?.error ?? 'Could not update. Try again.')
    }
    setStatusSaving(false)
  }

  // ── Upload invoice (admin, on behalf of a contractor) ──────────────
  const openInvoiceModal = () => {
    setInvForm({ user_id: '', estimate_number: '', job_location: '', invoice_number: '', amount: '', file: null })
    setInvContractorQuery(''); setInvContractorOpen(false)
    setInvError('')
    if (invFileRef.current) invFileRef.current.value = ''
    setInvModal(true)
  }

  const contractorMatches = invContractorQuery.trim()
    ? employees.filter((e) =>
        e.role === 'contractor' && e.is_active &&
        e.name.toLowerCase().includes(invContractorQuery.trim().toLowerCase())
      )
    : []

  const handleQuickAddContractor = async () => {
    const name = quickAddContractor.name.trim()
    if (!name) { setQacError('Enter a name.'); return }
    setQacSaving(true); setQacError('')
    try {
      const { id } = await createEmployee({
        name,
        role: 'contractor',
        address: quickAddContractor.address.trim() || undefined,
      })
      setEmployees((prev) => [...prev, { id, name, role: 'contractor', is_active: true, pay_type: null }])
      setInvForm((f) => ({ ...f, user_id: String(id) }))
      setInvContractorQuery(name)
      setQuickAddContractor(null)
    } catch (err) {
      setQacError(err?.response?.data?.error ?? 'Could not register. Try again.')
    }
    setQacSaving(false)
  }

  const handleUploadInvoice = async () => {
    if (!invForm.user_id) { setInvError('Select a contractor.'); return }
    if (!invForm.file)    { setInvError('Attach a picture or PDF of the invoice.'); return }
    setInvSaving(true); setInvError('')
    try {
      const form = new FormData()
      form.append('user_id', invForm.user_id)
      form.append('period_start', p.start)
      form.append('period_end', p.end)
      if (invForm.estimate_number.trim()) form.append('estimate_number', invForm.estimate_number.trim())
      if (invForm.job_location.trim())    form.append('job_location', invForm.job_location.trim())
      if (invForm.invoice_number.trim()) form.append('invoice_number', invForm.invoice_number.trim())
      if (invForm.amount)               form.append('amount', invForm.amount)
      form.append('file', invForm.file)

      await uploadInvoice(form)
      setInvModal(false)
      loadContractorInvoices()
    } catch (err) {
      setInvError(err?.response?.data?.error ?? 'Could not upload. Try again.')
    }
    setInvSaving(false)
  }

  // Invoices for the same contractor selected together print as one
  // combined check (see PrintContractorCheck, which groups by contractor)
  // instead of a separate physical check per project.
  const toggleInvSelected = (id) => setSelectedInvIds((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // ── Print contractor check(s) ───────────────────────────────────────
  const printContractorChecks = async (invs) => {
    setPrintLoading(true)
    try {
      const full = await Promise.all(invs.map((inv) => getInvoice(inv.id).then((d) => d.invoice)))
      setPrintInvoices(full)
    } catch {
      alert('Could not load invoice details for printing.')
    }
    setPrintLoading(false)
  }

  // ── Gas review ───────────────────────────────────────────────────
  const openGasReview = async () => {
    const d = await listEmployees()
    const active = (d.employees ?? []).filter((e) => e.is_active)
    const amounts = {}; const checked = {}
    active.forEach((e) => { amounts[e.id] = e.gas_weekly_allowance ?? 70; checked[e.id] = false })
    setGasEmployees(active); setGasAmounts(amounts); setGasChecked(checked); setGasModal(true)
  }

  const handleApplyGas = async () => {
    setGasSaving(true)
    try {
      for (const emp of gasEmployees.filter((e) => gasChecked[e.id])) {
        await createAdjustment({
          user_id: emp.id, period_start: p.start, period_end: p.end,
          type: 'gas_allowance', amount: parseFloat(gasAmounts[emp.id]) || 70,
          description: `Gas allowance ${p.label}`,
        })
      }
      setGasModal(false); loadSummary(); loadAdjustments()
    } finally { setGasSaving(false) }
  }

  // ── Derived ──────────────────────────────────────────────────────
  const filtered  = summary.filter((e) => e.pay_type === tab)
  const adjTotal  = adjustments.reduce((s, a) => s + parseFloat(a.amount ?? 0), 0)
  const pendingInvCount = contractorInvs.filter((i) => i.status === 'submitted').length
  const checkReadyInvs  = contractorInvs.filter((i) => i.status === 'check_ready' && i.amount && parseFloat(i.amount) > 0)

  // Per-employee breakdown from adjustments list
  const gasByUser   = {}
  const bonusByUser = {}
  adjustments.forEach((a) => {
    const uid = a.user_id
    if (a.type === 'gas_allowance') gasByUser[uid] = (gasByUser[uid] ?? 0) + parseFloat(a.amount ?? 0)
    else bonusByUser[uid] = (bonusByUser[uid] ?? 0) + parseFloat(a.amount ?? 0)
  })

  // ADP report — hourly W-2 employees only (salaried W-2 don't have
  // meaningful regular/OT hours to hand off, and ADP already has their
  // fixed salary on file). Plain decimal hours, not the "Xh Ym" display
  // used elsewhere on this page — ADP needs a real number.
  const adpRows = summary.filter((e) => e.pay_type === 'w2' && e.pay_structure === 'hourly')

  // W-2 employees with gas/bonus appear in the 1099 tab as additional check entries
  const w2ExtraRows = tab === '1099'
    ? summary
        .filter(e => e.pay_type === 'w2')
        .map(e => ({ ...e, _gas: gasByUser[e.user_id] ?? 0, _bonus: bonusByUser[e.user_id] ?? 0 }))
        .filter(e => e._gas + e._bonus > 0)
    : []

  const pendingPcCount = paychecks.filter((pc) => pc.status === 'processing').length
  const pendingPcForPeriodCount = paychecks.filter((pc) =>
    pc.status === 'processing' && pc.period_start === p.start && pc.period_end === p.end
  ).length
  const pendingFRCount = flatRatePayments.filter((fr) => fr.status === 'pending').length

  const TABS = [
    { key: 'w2',          label: 'W-2 Employees' },
    { key: '1099',        label: '1099 Employees' },
    { key: 'flat_rate',   label: 'Flat Rate', badge: pendingFRCount || null },
    { key: 'paychecks',   label: 'Paychecks', badge: pendingPcCount || null },
    { key: 'contractors', label: 'Contractors', badge: pendingInvCount || null },
  ]

  return (
    <div className="w-full">
      <PageHeader title="Payroll" subtitle="Review pay by period"
        actions={
          tab === 'w2' || tab === '1099'
            ? <div className="flex gap-2">
                <Button variant="secondary" onClick={openGasReview}>Review Gas Allowances</Button>
                <Button onClick={() => setPrintOpen(true)}>Print Checks</Button>
              </div>
            : tab === 'flat_rate'
              ? <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setFrPrintOpen(true)} disabled={flatRatePayments.length === 0}>Print Flat Rate Checks</Button>
                  <Button onClick={() => { setFrForm({ user_id: '', amount: '', description: '' }); setFrError(''); setFrModal(true) }}>+ Add Payment</Button>
                </div>
            : tab === 'paychecks'
              ? <div className="flex gap-2">
                  <Button variant="secondary" loading={pcMarkingAll} disabled={pendingPcForPeriodCount === 0} onClick={handleMarkAllAvailable}>
                    Mark All Available ({pendingPcForPeriodCount})
                  </Button>
                  <Button onClick={() => { setPcForm({ user_id: '', amount: '', notes: '' }); setPcError(''); setPcModal(true) }}>+ Add Paycheck</Button>
                </div>
              : null
        }
      />

      {/* Period selector */}
      <div className="mb-5">
        <select
          value={period}
          onChange={e => setPeriod(Number(e.target.value))}
          className="w-full sm:w-64 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          {periods.map((p2, i) => (
            <option key={i} value={i}>{p2.label}</option>
          ))}
        </select>
      </div>

      {/* 3-tab switcher */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(({ key, label, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`relative px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
            {badge ? (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── W-2 / 1099 tab content ─────────────────────────────────── */}
      {(tab === 'w2' || tab === '1099') && (
        <>
          {/* Pay summary */}
          {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

              {/* ── Mobile cards (hidden md+) ── */}
              <div className="md:hidden divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <p className="text-center py-12 text-sm text-gray-400">No data for this period.</p>
                )}
                {filtered.map((emp) => {
                  const gas   = gasByUser[emp.user_id]      ?? 0
                  const loan  = loanDeductions[emp.user_id] ?? 0
                  const bonus = bonusByUser[emp.user_id]    ?? 0
                  return (
                    <button key={emp.user_id} onClick={() => openDrillDown(emp)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center shrink-0">
                        {emp.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{emp.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {emp.pay_structure === 'salary'
                            ? <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">Salary</span>
                            : <span className="text-xs text-gray-400">{formatHours((emp.regular_hours ?? 0) + (emp.overtime_hours ?? 0))}</span>
                          }
                          {gas  > 0 && <span className="text-xs text-amber-600 font-medium">+{formatCurrency(gas)} gas</span>}
                          {loan > 0 && <span className="text-xs text-red-500 font-medium">−{formatCurrency(loan)} loan</span>}
                          {bonus> 0 && <span className="text-xs text-green-600 font-medium">+{formatCurrency(bonus)} bonus</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(tab === 'w2' ? (emp.base_gross ?? 0) : (emp.estimated_total ?? 0))}</p>
                        {tab === 'w2' && (gas + bonus) > 0
                          ? <p className="text-xs text-amber-600 mt-0.5">+{formatCurrency(gas + bonus)} → 1099</p>
                          : tab !== 'w2' && <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(emp.base_gross ?? 0)} base</p>
                        }
                      </div>
                    </button>
                  )
                })}
                {/* W-2 additional entries (gas/bonus) — shown in 1099 tab only */}
                {w2ExtraRows.length > 0 && (
                  <div className="border-t border-amber-100 bg-amber-50/30">
                    <p className="px-4 pt-2 pb-1 text-xs font-semibold text-amber-700 uppercase tracking-wide">W-2 Additional (Gas / Bonus)</p>
                    {w2ExtraRows.map(e => (
                      <div key={`w2x-${e.user_id}`} className="flex items-center gap-3 px-4 py-3 border-t border-amber-100/50">
                        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 font-bold text-sm flex items-center justify-center shrink-0">
                          {e.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-gray-900 text-sm truncate">{e.name}</p>
                            <span className="text-xs bg-indigo-50 text-indigo-500 font-semibold px-1.5 py-0.5 rounded shrink-0">W-2</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {e._gas   > 0 && <span className="text-xs text-amber-600 font-medium">+{formatCurrency(e._gas)} gas</span>}
                            {e._bonus > 0 && <span className="text-xs text-green-600 font-medium">+{formatCurrency(e._bonus)} bonus</span>}
                          </div>
                        </div>
                        <p className="font-bold text-gray-900 shrink-0">{formatCurrency(e._gas + e._bonus)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {filtered.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <span className="text-sm font-semibold text-gray-700">Totals</span>
                    <div className="text-right">
                      <p className="font-bold text-brand-500">
                        {formatCurrency(filtered.reduce((s, e) => s + ((tab === 'w2' ? e.base_gross : e.estimated_total) ?? 0), 0))}
                      </p>
                      {tab !== 'w2' && (
                        <p className="text-xs text-gray-400">{formatCurrency(filtered.reduce((s, e) => s + (e.base_gross ?? 0), 0))} base</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Desktop table (hidden on mobile) ── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Employee</th>
                      <th className="text-right px-4 py-3">Paid Hrs</th>
                      <th className="text-right px-4 py-3">Base Pay</th>
                      <th className="text-right px-4 py-3 text-amber-600">Gas</th>
                      <th className="text-right px-4 py-3 text-red-500">Loan</th>
                      <th className="text-right px-4 py-3 text-green-600">Bonus</th>
                      <th className="text-right px-5 py-3">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-400">No data for this period.</td></tr>
                    )}
                    {filtered.map((emp) => {
                      const gas   = gasByUser[emp.user_id]      ?? 0
                      const loan  = loanDeductions[emp.user_id] ?? 0
                      const bonus = bonusByUser[emp.user_id]    ?? 0
                      return (
                        <tr key={emp.user_id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                          onClick={() => openDrillDown(emp)}>
                          <td className="px-5 py-3 font-medium text-gray-900">{emp.name}</td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {emp.pay_structure === 'salary'
                              ? <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">Salary</span>
                              : formatHours((emp.regular_hours ?? 0) + (emp.overtime_hours ?? 0))}
                          </td>
                          <td className="px-4 py-3 text-right">{formatCurrency(emp.base_gross ?? 0)}</td>
                          <td className="px-4 py-3 text-right text-amber-600 font-medium">
                            {gas > 0 ? formatCurrency(gas) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-red-500 font-medium">
                            {loan > 0 ? <span>−{formatCurrency(loan)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-green-600 font-medium">
                            {bonus > 0 ? formatCurrency(bonus) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(tab === 'w2' ? (emp.base_gross ?? 0) : (emp.estimated_total ?? 0))}</td>
                        </tr>
                      )
                    })}
                    {/* W-2 additional entries (gas/bonus) — shown in 1099 tab only */}
                    {w2ExtraRows.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={7} className="px-5 py-2 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide border-t-2 border-amber-100">
                            W-2 Additional (Gas / Bonus)
                          </td>
                        </tr>
                        {w2ExtraRows.map(e => (
                          <tr key={`w2x-${e.user_id}`} className="border-b border-amber-100/60 bg-amber-50/20">
                            <td className="px-5 py-3 font-medium text-gray-900">
                              <div className="flex items-center gap-2">
                                {e.name}
                                <span className="text-xs bg-indigo-50 text-indigo-500 font-semibold px-1.5 py-0.5 rounded">W-2</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">—</td>
                            <td className="px-4 py-3 text-right text-gray-300">—</td>
                            <td className="px-4 py-3 text-right text-amber-600 font-medium">
                              {e._gas > 0 ? formatCurrency(e._gas) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">—</td>
                            <td className="px-4 py-3 text-right text-green-600 font-medium">
                              {e._bonus > 0 ? formatCurrency(e._bonus) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(e._gas + e._bonus)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                    {filtered.length > 0 && (
                      <tr className="bg-gray-50 font-semibold text-sm">
                        <td className="px-5 py-3 text-gray-700">Totals</td>
                        <td className="px-4 py-3 text-right">{formatHours(filtered.reduce((s, e) => s + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0))}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(filtered.reduce((s, e) => s + (e.base_gross ?? 0), 0))}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(filtered.reduce((s, e) => s + (gasByUser[e.user_id] ?? 0), 0))}</td>
                        <td className="px-4 py-3 text-right text-red-500">−{formatCurrency(filtered.reduce((s, e) => s + (loanDeductions[e.user_id] ?? 0), 0))}</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(filtered.reduce((s, e) => s + (bonusByUser[e.user_id] ?? 0), 0))}</td>
                        <td className="px-5 py-3 text-right text-brand-500">{formatCurrency(filtered.reduce((s, e) => s + ((tab === 'w2' ? e.base_gross : e.estimated_total) ?? 0), 0))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* ADP Report — hourly W-2 employees, decimal hours */}
          {tab === 'w2' && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-4">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">ADP Report</h3>
                <p className="text-xs text-gray-400 mt-0.5">Hourly W-2 employees · {p.label} · decimal hours</p>
              </div>
              {loading ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : adpRows.length === 0 ? (
                <p className="text-center py-12 text-sm text-gray-400">No hourly W-2 employees this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-5 py-3">Employee</th>
                        <th className="text-right px-4 py-3">Regular Hours</th>
                        <th className="text-right px-4 py-3">OT Hours</th>
                        <th className="text-right px-5 py-3">Total Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adpRows.map((emp) => (
                        <tr key={emp.user_id} className="border-b border-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{emp.name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{(emp.regular_hours ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{(emp.overtime_hours ?? 0).toFixed(2)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">
                            {((emp.regular_hours ?? 0) + (emp.overtime_hours ?? 0)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold text-sm">
                        <td className="px-5 py-3 text-gray-700">Totals</td>
                        <td className="px-4 py-3 text-right">{adpRows.reduce((s, e) => s + (e.regular_hours ?? 0), 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">{adpRows.reduce((s, e) => s + (e.overtime_hours ?? 0), 0).toFixed(2)}</td>
                        <td className="px-5 py-3 text-right text-brand-500">
                          {adpRows.reduce((s, e) => s + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bonuses & Adjustments */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mt-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Bonuses &amp; Adjustments</h3>
                <p className="text-xs text-gray-400 mt-0.5">{p.label}</p>
              </div>
              <div className="flex items-center gap-3">
                {adjustments.length > 0 && (
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(adjTotal)} total</span>
                )}
                <Button size="sm" onClick={() => openNewBonus()}>+ Add</Button>
              </div>
            </div>

            {loadingAdj ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : adjustments.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 mb-3">No bonuses or adjustments for this period.</p>
                <Button size="sm" variant="secondary" onClick={() => openNewBonus()}>Add one</Button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {adjustments.map((adj) => (
                  <div key={adj.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{adj.user_name}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${adjColor(adj.type)}`}>
                          {adjLabel(adj.type)}
                        </span>
                      </div>
                      {adj.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{adj.description}</p>}
                    </div>
                    <span className="font-semibold text-green-600 text-sm shrink-0">{formatCurrency(adj.amount)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditBonus(adj)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                        <EditIcon />
                      </button>
                      <button onClick={() => setDeleteAdj(adj)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </>
      )}

      {/* ── Flat Rate tab content ─────────────────────────────────── */}
      {tab === 'flat_rate' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Flat Rate Payments</h3>
            <p className="text-xs text-gray-400 mt-0.5">{p.label} · Separate checks for specific contracted work</p>
          </div>

          {loadingFR ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : flatRatePayments.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400 mb-3">No flat rate payments for this period.</p>
              <Button size="sm" variant="secondary" onClick={() => { setFrForm({ user_id: '', amount: '', description: '' }); setFrError(''); setFrModal(true) }}>
                Add one
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-5 py-3 w-40" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {flatRatePayments.map((fr) => (
                  <tr key={fr.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{fr.user_name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">{fr.description}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(fr.amount)}</td>
                    <td className="px-4 py-3">
                      {fr.status === 'issued'
                        ? <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-500">Issued</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        {fr.status === 'pending' && (
                          <button onClick={() => handleFrMarkIssued(fr)}
                            className="text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors">
                            Mark Issued
                          </button>
                        )}
                        <button onClick={() => handleDeleteFlatRate(fr)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {flatRatePayments.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-100">
                    <td colSpan={2} className="px-5 py-3 text-sm font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {formatCurrency(flatRatePayments.reduce((s, fr) => s + parseFloat(fr.amount ?? 0), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}

      {/* ── Contractors tab content ────────────────────────────────── */}
      {tab === 'contractors' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-gray-900">Contractor Invoices</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {p.label} · check the box on multiple invoices for the same contractor to combine them into one check
              </p>
            </div>
            <div className="flex items-center gap-2">
              {pendingInvCount > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">
                  {pendingInvCount} pending review
                </span>
              )}
              {selectedInvIds.size > 0 && (
                <Button size="sm" loading={printLoading}
                  onClick={() => printContractorChecks(contractorInvs.filter((i) => selectedInvIds.has(i.id)))}>
                  Print Selected ({selectedInvIds.size})
                </Button>
              )}
              {checkReadyInvs.length > 0 && (
                <Button size="sm" variant="secondary" loading={printLoading}
                  onClick={() => printContractorChecks(checkReadyInvs)}>
                  Print All Check-Ready ({checkReadyInvs.length})
                </Button>
              )}
              <Button size="sm" onClick={openInvoiceModal}>+ Upload Invoice</Button>
            </div>
          </div>

          {loadingInvs ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : contractorInvs.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No contractor invoices for this period.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="px-5 py-3 w-8" />
                  <th className="text-left px-5 py-3">Contractor</th>
                  <th className="text-left px-4 py-3">Invoice File</th>
                  <th className="text-left px-4 py-3">Paying Toward</th>
                  <th className="text-left px-4 py-3">Invoice #</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-5 py-3 w-52" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contractorInvs.map((inv) => {
                  const meta = INV_STATUS[inv.status] ?? INV_STATUS.submitted
                  const hasAmount = inv.amount && parseFloat(inv.amount) > 0
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <input type="checkbox" checked={selectedInvIds.has(inv.id)} disabled={!hasAmount}
                          onChange={() => toggleInvSelected(inv.id)}
                          title={hasAmount ? 'Select to combine into one check with other selected invoices' : 'Add an amount before this can be selected'}
                          className="w-4 h-4 rounded border-gray-300 accent-brand-500 disabled:opacity-30" />
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-900">{inv.contractor_name}</td>
                      <td className="px-4 py-3">
                        <a href={getDownloadUrl(inv.id)} target="_blank" rel="noopener noreferrer"
                          className="text-brand-500 hover:underline text-xs max-w-[180px] block truncate">
                          {inv.file_original_name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate">
                        {(() => {
                          const estNum = inv.resolved_estimate_number ?? inv.estimate_number
                          const jobRef = inv.job_name ?? inv.job_location
                          return estNum
                            ? <>Est. #{estNum}{jobRef && <span className="text-gray-400"> — {jobRef}</span>}</>
                            : <span className="text-gray-300">—</span>
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{inv.invoice_number || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {inv.amount ? formatCurrency(inv.amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" loading={printLoading} disabled={!hasAmount}
                            onClick={() => printContractorChecks([inv])}>
                            Print Check
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openStatusModal(inv)}>
                            Update
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────── */}

      {/* Drill-down */}
      <Modal isOpen={!!drillDown} onClose={() => setDrillDown(null)} title={`${drillDown?.name} — ${p.label}`} size="lg">
        {!breakdown ? <div className="flex justify-center py-8"><Spinner /></div> : (
          <div className="flex flex-col gap-4">

            {/* Pay breakdown chart */}
            {drillDown && (() => {
              const uid  = drillDown.user_id
              const gas  = gasByUser[uid]   ?? 0
              const bon  = bonusByUser[uid] ?? 0
              const loan = loanDeductions[uid] ?? 0
              const base = drillDown.base_gross ?? 0
              if (gas === 0 && bon === 0 && loan === 0) return null
              return (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Pay Breakdown</p>
                  <PayPieChart base={base} gas={gas} bonus={bon} loan={loan} />
                </div>
              )
            })()}

            {/* Time entry breakdown by day */}
            {Object.entries(breakdown).length === 0 && <p className="text-gray-400 text-center py-4">No entries for this period.</p>}
            {Object.entries(breakdown).map(([date, entries]) => (
              <div key={date} className="bg-gray-50 rounded-xl p-4">
                <p className="font-semibold text-sm text-gray-900 mb-2">{formatDate(date)}</p>
                {entries.map((entry, j) => (
                  <div key={j} className="flex justify-between text-sm text-gray-600 py-0.5">
                    <span className="capitalize">{entry.cost_category?.replace(/_/g, ' ')}</span>
                    <span>{formatHours((entry.minutes ?? 0) / 60)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Add / edit bonus */}
      <Modal isOpen={!!bonusModal} onClose={() => setBonusModal(null)}
        title={bonusModal?.id ? 'Edit Adjustment' : 'Add Bonus / Adjustment'}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Employee</label>
            <select value={bonusForm.user_id}
              onChange={(e) => setBonusForm((f) => ({ ...f, user_id: e.target.value }))}
              disabled={!!bonusModal?.id}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50 disabled:bg-gray-50">
              <option value="">— Select employee —</option>
              {summary.map((emp) => (
                <option key={emp.user_id} value={emp.user_id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ADJ_TYPES.map((t) => (
                <button key={t.value} onClick={() => setBonusForm((f) => ({ ...f, type: t.value }))}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    bonusForm.type === t.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>{t.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={bonusForm.amount}
                onChange={(e) => setBonusForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Note (optional)</label>
            <input type="text" value={bonusForm.description}
              onChange={(e) => setBonusForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Performance bonus — Q2"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>

          {bonusError && <p className="text-sm text-red-600">{bonusError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setBonusModal(null)}>Cancel</Button>
            <Button fullWidth loading={bonusSaving} onClick={handleSaveBonus}>
              {bonusModal?.id ? 'Save Changes' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete adjustment */}
      <Modal isOpen={!!deleteAdj} onClose={() => setDeleteAdj(null)} title="Remove Adjustment">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-4 text-sm">
            <p className="font-medium text-gray-900">{deleteAdj?.user_name}</p>
            <p className="text-gray-500 mt-0.5">
              {adjLabel(deleteAdj?.type)} · {formatCurrency(deleteAdj?.amount ?? 0)}
              {deleteAdj?.description && ` · ${deleteAdj.description}`}
            </p>
          </div>
          <p className="text-sm text-gray-600">Are you sure you want to remove this adjustment? This will affect the employee's gross pay for the period.</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteAdj(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deletingAdj} onClick={handleDeleteAdj}>Remove</Button>
          </div>
        </div>
      </Modal>

      {/* Add flat rate payment */}
      <Modal isOpen={frModal} onClose={() => setFrModal(false)} title={`Add Flat Rate Payment — ${p.label}`}>
        <form onSubmit={handleCreateFlatRate} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Employee</label>
            <select value={frForm.user_id} onChange={(e) => setFrForm((f) => ({ ...f, user_id: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">— Select employee —</option>
              {employees.filter((e) => e.role !== 'contractor').map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Description</label>
            <input type="text" value={frForm.description}
              onChange={(e) => setFrForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Office cleaning — Week of Jul 7"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={frForm.amount}
                onChange={(e) => setFrForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500">
            This creates a <strong>separate check</strong> for the employee. It does not affect their regular hourly pay for this period.
          </div>
          {frError && <p className="text-sm text-red-600">{frError}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" fullWidth onClick={() => setFrModal(false)}>Cancel</Button>
            <Button type="submit" fullWidth loading={frSaving}>Add Payment</Button>
          </div>
        </form>
      </Modal>

      {/* Contractor invoice status / estimate assignment */}
      <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)}
        title={`Update Invoice — ${statusModal?.contractor_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <p className="text-gray-500">File: <span className="font-medium text-gray-800">{statusModal?.file_original_name}</span></p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'submitted',    label: 'Submitted',    style: 'text-amber-700 border-amber-300 bg-amber-50' },
                { value: 'under_review', label: 'Under Review', style: 'text-blue-700 border-blue-300 bg-blue-50' },
                { value: 'check_ready',  label: 'Check Ready',  style: 'text-green-700 border-green-300 bg-green-50' },
                { value: 'paid',         label: 'Paid',         style: 'text-gray-600 border-gray-300 bg-gray-50' },
              ].map((opt) => (
                <button key={opt.value} onClick={() => setStatusValue(opt.value)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors text-left ${
                    statusValue === opt.value ? opt.style + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={statusAmount}
                onChange={(e) => setStatusAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Estimate #" value={statusEstimateNumber}
              onChange={(e) => setStatusEstimateNumber(e.target.value)}
              onBlur={(e) => handleEstimateNumberBlur(e.target.value, setStatusJobLocation)}
              placeholder="e.g. 4021" />
            <Input label="Job / Location" value={statusJobLocation}
              onChange={(e) => setStatusJobLocation(e.target.value)}
              placeholder="e.g. Main St. remodel" />
          </div>

          <Input label="Invoice Number (if applicable)" value={statusInvNum}
            onChange={(e) => setStatusInvNum(e.target.value)} placeholder="e.g. 1042" />

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Internal note (optional)</label>
            <input type="text" value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
              placeholder="e.g. Waiting on updated invoice with itemized hours"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>

          {statusError && <p className="text-sm text-red-600">{statusError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setStatusModal(null)}>Cancel</Button>
            <Button fullWidth loading={statusSaving} onClick={handleSaveStatus}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Upload contractor invoice (admin, on behalf of a contractor) */}
      <Modal isOpen={invModal} onClose={() => setInvModal(false)} title="Upload Contractor Invoice">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Contractor</label>
            <input
              type="text"
              value={invContractorQuery}
              onChange={(e) => {
                setInvContractorQuery(e.target.value)
                setInvForm((f) => ({ ...f, user_id: '' })) // typing invalidates whatever was picked before
                setInvContractorOpen(true)
              }}
              onFocus={() => setInvContractorOpen(true)}
              onBlur={() => setTimeout(() => setInvContractorOpen(false), 150)} // let a suggestion's onMouseDown land first
              placeholder="Start typing a contractor's name…"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            {invForm.user_id && (
              <p className="text-xs text-green-600 mt-1">✓ {invContractorQuery} selected</p>
            )}
            {invContractorOpen && invContractorQuery.trim() && !invForm.user_id && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {contractorMatches.length > 0 ? (
                  contractorMatches.map((c) => (
                    <button key={c.id} type="button"
                      onMouseDown={() => {
                        setInvForm((f) => ({ ...f, user_id: String(c.id) }))
                        setInvContractorQuery(c.name)
                        setInvContractorOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {c.name}
                    </button>
                  ))
                ) : (
                  <button type="button"
                    onMouseDown={() => {
                      setQuickAddContractor({ name: invContractorQuery.trim(), address: '' })
                      setInvContractorOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-brand-600 font-semibold hover:bg-brand-50"
                  >
                    + Register "{invContractorQuery.trim()}" as a new contractor
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Estimate # (optional)" value={invForm.estimate_number}
              onChange={(e) => setInvForm((f) => ({ ...f, estimate_number: e.target.value }))}
              onBlur={(e) => handleEstimateNumberBlur(e.target.value, (loc) => setInvForm((f) => ({ ...f, job_location: loc })))}
              placeholder="e.g. 4021" />
            <Input label="Job / Location (optional)" value={invForm.job_location}
              onChange={(e) => setInvForm((f) => ({ ...f, job_location: e.target.value }))}
              placeholder="e.g. Main St. remodel" />
          </div>

          <Input label="Invoice Number (if applicable)" value={invForm.invoice_number}
            onChange={(e) => setInvForm((f) => ({ ...f, invoice_number: e.target.value }))} placeholder="e.g. 1042" />

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={invForm.amount}
                onChange={(e) => setInvForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Invoice File <span className="text-red-500">*</span>
            </label>
            <input
              ref={invFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setInvForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-semibold"
            />
            <p className="text-xs text-gray-400 mt-1">A picture or PDF of the contractor's invoice/receipt.</p>
          </div>

          {invError && <p className="text-sm text-red-600">{invError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setInvModal(false)}>Cancel</Button>
            <Button fullWidth loading={invSaving} onClick={handleUploadInvoice}>Upload</Button>
          </div>
        </div>
      </Modal>

      {/* Register new contractor — quick add from inside Upload Invoice */}
      <Modal isOpen={!!quickAddContractor} onClose={() => setQuickAddContractor(null)} title="Register New Contractor">
        <div className="flex flex-col gap-4">
          <Input label="Name *" value={quickAddContractor?.name ?? ''}
            onChange={(e) => setQuickAddContractor((f) => ({ ...f, name: e.target.value }))}
            placeholder="Company or individual name" />
          <Input label="Address (optional)" value={quickAddContractor?.address ?? ''}
            onChange={(e) => setQuickAddContractor((f) => ({ ...f, address: e.target.value }))}
            placeholder="Street, City, State — shown on printed checks" />
          <p className="text-xs text-gray-400 -mt-2">
            More details (phone, email, tax ID) can be added later from Employees.
          </p>
          {qacError && <p className="text-sm text-red-600">{qacError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setQuickAddContractor(null)}>Cancel</Button>
            <Button fullWidth loading={qacSaving} onClick={handleQuickAddContractor}>Register &amp; Select</Button>
          </div>
        </div>
      </Modal>

      {/* Print checks overlay — hourly payroll */}
      {printOpen && (() => {
        // When printing 1099 checks, include W-2 employees' gas/bonus as additional flat-rate entries
        const w2GasBonusExtras = tab === '1099'
          ? summary
              .filter(e => e.pay_type === 'w2')
              .map(e => ({
                id: `w2-extra-${e.user_id}`,
                user_name: e.name,
                user_id: e.user_id,
                amount: (gasByUser[e.user_id] ?? 0) + (bonusByUser[e.user_id] ?? 0),
                description: 'Gas Allowance / Bonus',
              }))
              .filter(e => e.amount > 0)
          : []
        return (
          <PrintChecks
            employees={filtered}
            flatRatePayments={w2GasBonusExtras}
            period={p}
            gasByUser={gasByUser}
            bonusByUser={bonusByUser}
            loanDeductions={loanDeductions}
            onClose={() => setPrintOpen(false)}
          />
        )
      })()}

      {/* Print checks overlay — flat rate */}
      {frPrintOpen && (
        <PrintChecks
          employees={[]}
          flatRatePayments={flatRatePayments}
          period={p}
          gasByUser={{}}
          bonusByUser={{}}
          loanDeductions={{}}
          onClose={() => setFrPrintOpen(false)}
        />
      )}

      {printInvoices && (
        <PrintContractorCheck
          invoices={printInvoices}
          onClose={() => { setPrintInvoices(null); setSelectedInvIds(new Set()) }}
        />
      )}

      {/* ── Paychecks tab content ───────────────────────────────────── */}
      {tab === 'paychecks' && (
        <div className="space-y-4 mt-4">
          {loadingPay
            ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            : paychecks.length === 0
              ? <div className="text-center py-16 text-gray-400 text-sm">No paycheck records yet. Click "+ Add Paycheck" to create one.</div>
              : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                  {paychecks.map((pc) => {
                    const statusCfg = {
                      processing: { label: 'Processing', color: 'bg-amber-100 text-amber-700', next: 'available',  nextLabel: 'Mark Available' },
                      available:  { label: 'Available',  color: 'bg-green-100 text-green-700',  next: 'picked_up', nextLabel: 'Mark Picked Up' },
                      picked_up:  { label: 'Picked Up',  color: 'bg-gray-100 text-gray-600',    next: null,        nextLabel: null },
                      voided:     { label: 'Voided',     color: 'bg-red-100 text-red-700',      next: null,        nextLabel: null },
                    }[pc.status] ?? { label: pc.status, color: 'bg-gray-100 text-gray-600', next: null }

                    return (
                      <div key={pc.id} className={`flex items-center gap-3 px-4 py-3.5 ${pc.status === 'voided' ? 'opacity-60' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{pc.employee_name}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                            {pc.status === 'available' && <span className="text-xs text-gray-400">🔔</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatDate(pc.period_start)} – {formatDate(pc.period_end)}
                            {pc.check_number && ` · Check #${pc.check_number}`}
                          </p>
                          {pc.status === 'voided' && pc.void_reason && (
                            <p className="text-xs text-red-500 mt-0.5 italic">{pc.void_reason}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-gray-900 text-sm">{pc.amount ? formatCurrency(pc.amount) : <span className="text-gray-400">—</span>}</p>
                          <div className="flex items-center gap-2 justify-end mt-1">
                            {statusCfg.next && (
                              <button onClick={() => setPcStatusTarget({ paycheck: pc, nextStatus: statusCfg.next })}
                                className="text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors">
                                {statusCfg.nextLabel}
                              </button>
                            )}
                            {pc.status !== 'voided' && pc.status !== 'picked_up' && (
                              <button onClick={() => { setPcVoidTarget(pc); setPcVoidReason('') }}
                                className="text-xs text-red-400 hover:text-red-600 transition-colors">
                                Void
                              </button>
                            )}
                            <button onClick={() => handleDeletePaycheck(pc.id)}
                              className="text-xs text-red-400 hover:text-red-600 transition-colors">
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
          }
        </div>
      )}

      {/* Create paycheck modal */}
      <Modal isOpen={pcModal} onClose={() => setPcModal(false)} title={`Add Paycheck — ${p.label}`}>
        <form onSubmit={handleCreatePaycheck} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select value={pcForm.user_id} onChange={(e) => setPcForm((f) => ({ ...f, user_id: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">— Select employee —</option>
              {employees.filter((e) => e.role !== 'contractor').map((e) => <option key={e.id} value={e.id}>{e.name} ({e.pay_type?.toUpperCase()})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={pcForm.amount} onChange={(e) => setPcForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 pl-7 pr-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input type="text" placeholder="e.g. Week of June 30"
              value={pcForm.notes} onChange={(e) => setPcForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          {pcError && <p className="text-sm text-red-600">{pcError}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" fullWidth onClick={() => setPcModal(false)}>Cancel</Button>
            <Button type="submit" fullWidth loading={pcSaving}>Create</Button>
          </div>
        </form>
      </Modal>

      {/* Confirm status change */}
      <Modal isOpen={!!pcStatusTarget} onClose={() => { setPcStatusTarget(null); setPcStatusError('') }}
        title={pcStatusTarget?.nextStatus === 'available' ? 'Mark Paycheck Available?' : 'Mark as Picked Up?'}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            {pcStatusTarget?.nextStatus === 'available'
              ? `This will mark ${pcStatusTarget?.paycheck?.employee_name}'s paycheck as available and send them a push notification.`
              : `This will mark ${pcStatusTarget?.paycheck?.employee_name}'s paycheck as picked up.`
            }
          </p>
          {pcStatusError && <p className="text-sm text-red-600">{pcStatusError}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => { setPcStatusTarget(null); setPcStatusError('') }}>Cancel</Button>
            <Button fullWidth loading={pcStatusSaving} onClick={handlePcStatus}>Confirm</Button>
          </div>
        </div>
      </Modal>

      {/* Void paycheck */}
      <Modal isOpen={!!pcVoidTarget} onClose={() => setPcVoidTarget(null)} title={`Void Paycheck — ${pcVoidTarget?.employee_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            This marks the paycheck as voided (e.g. a spoiled or misprinted check) and removes it from anything
            pending "Mark Available." This cannot be undone.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea rows={2} value={pcVoidReason} onChange={(e) => setPcVoidReason(e.target.value)}
              placeholder="e.g. Printer jam, reissuing with a new check number"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none" />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setPcVoidTarget(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={pcVoiding} onClick={handleVoidPaycheck}>Void Paycheck</Button>
          </div>
        </div>
      </Modal>

      {/* Gas review */}
      <Modal isOpen={gasModal} onClose={() => setGasModal(false)} title={`Gas Allowance Review — ${p.label}`} size="lg">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Check the employees who should receive a gas allowance this week and confirm the amount.
          </p>
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {gasEmployees.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <input type="checkbox" checked={!!gasChecked[emp.id]}
                  onChange={(e) => setGasChecked((c) => ({ ...c, [emp.id]: e.target.checked }))}
                  className="accent-brand-500 w-4 h-4 shrink-0" />
                <span className="flex-1 text-sm font-medium text-gray-900">{emp.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">$</span>
                  <input type="number" value={gasAmounts[emp.id] ?? 70}
                    onChange={(e) => setGasAmounts((a) => ({ ...a, [emp.id]: e.target.value }))}
                    disabled={!gasChecked[emp.id]}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right outline-none focus:border-brand-500 disabled:opacity-40" />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-brand-100 rounded-xl px-4 py-3 text-sm text-brand-900 font-medium">
            Total gas this period: {formatCurrency(
              gasEmployees.filter((e) => gasChecked[e.id]).reduce((s, e) => s + (parseFloat(gasAmounts[e.id]) || 0), 0)
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setGasModal(false)}>Cancel</Button>
            <Button fullWidth loading={gasSaving} onClick={handleApplyGas}>Apply Gas Allowances</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
