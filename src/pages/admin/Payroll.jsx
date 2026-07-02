import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import PrintChecks from '../../components/admin/PrintChecks'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { getSummary, getBreakdown, listAdjustments, createAdjustment, updateAdjustment, deleteAdjustment } from '../../api/payroll'
import { listEmployees } from '../../api/employees'
import { listInvoices, updateInvoiceStatus, getDownloadUrl } from '../../api/contractor'
import { getPeriodLoanTotals } from '../../api/loans'
import { formatCurrency, formatHours, formatDate } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'

const periods = Array.from({ length: 8 }, (_, i) => {
  const start = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
  const end   = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
  return {
    label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
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
  const [statusSaving,   setStatusSaving]   = useState(false)
  const [statusError,    setStatusError]    = useState('')

  // Gas review
  const [gasModal,     setGasModal]     = useState(false)
  const [gasEmployees, setGasEmployees] = useState([])
  const [gasAmounts,   setGasAmounts]   = useState({})
  const [gasChecked,   setGasChecked]   = useState({})
  const [gasSaving,    setGasSaving]    = useState(false)

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

  const loadContractorInvoices = () => {
    setLoadingInvs(true)
    listInvoices({ period_start: p.start, period_end: p.end })
      .then((d) => setContractorInvs(d.invoices ?? []))
      .finally(() => setLoadingInvs(false))
  }

  useEffect(() => {
    loadSummary()
    loadAdjustments()
    loadContractorInvoices()
    getPeriodLoanTotals(p.start, p.end).then(setLoanDeductions).catch(() => setLoanDeductions({}))
  }, [period])

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
      bonusModal.id ? await updateAdjustment(bonusModal.id, payload) : await createAdjustment(payload)
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

  // ── Contractor invoice status ────────────────────────────────────
  const openStatusModal = (inv) => {
    setStatusModal(inv); setStatusValue(inv.status); setStatusNote(inv.admin_note ?? ''); setStatusError('')
  }

  const handleSaveStatus = async () => {
    setStatusSaving(true); setStatusError('')
    try {
      await updateInvoiceStatus({ id: statusModal.id, status: statusValue, admin_note: statusNote })
      setStatusModal(null); loadContractorInvoices()
    } catch (err) {
      setStatusError(err?.response?.data?.error ?? 'Could not update. Try again.')
    }
    setStatusSaving(false)
  }

  // ── Gas review ───────────────────────────────────────────────────
  const openGasReview = async () => {
    const d = await listEmployees()
    const active = (d.employees ?? []).filter((e) => e.is_active)
    const amounts = {}; const checked = {}
    active.forEach((e) => { amounts[e.id] = e.gas_weekly_allowance ?? 70; checked[e.id] = false })
    summary.forEach((s) => { if ((s.approved_hours ?? 0) > 0) checked[s.user_id] = true })
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

  // Per-employee breakdown from adjustments list
  const gasByUser   = {}
  const bonusByUser = {}
  adjustments.forEach((a) => {
    const uid = a.user_id
    if (a.type === 'gas_allowance') gasByUser[uid] = (gasByUser[uid] ?? 0) + parseFloat(a.amount ?? 0)
    else bonusByUser[uid] = (bonusByUser[uid] ?? 0) + parseFloat(a.amount ?? 0)
  })

  const TABS = [
    { key: 'w2',          label: 'W-2 Employees' },
    { key: '1099',        label: '1099 Employees' },
    { key: 'contractors', label: 'Contractors', badge: pendingInvCount || null },
  ]

  return (
    <div className="w-full">
      <PageHeader title="Payroll" subtitle="Review pay by period"
        actions={
          tab !== 'contractors'
            ? <div className="flex gap-2">
                <Button variant="secondary" onClick={openGasReview}>Review Gas Allowances</Button>
                <Button onClick={() => setPrintOpen(true)}>Print Checks</Button>
              </div>
            : null
        }
      />

      {/* Period selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        {periods.map((p2, i) => (
          <button key={i} onClick={() => setPeriod(i)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              period === i ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}>{p2.label}</button>
        ))}
      </div>

      {/* 3-tab switcher */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
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
      {tab !== 'contractors' && (
        <>
          {/* Pay summary table */}
          {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
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
                    const gas   = gasByUser[emp.user_id]   ?? 0
                    const loan  = loanDeductions[emp.user_id] ?? 0
                    const bonus = bonusByUser[emp.user_id]  ?? 0
                    return (
                      <tr key={emp.user_id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() => openDrillDown(emp)}>
                        <td className="px-5 py-3 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{formatHours(emp.approved_hours ?? 0)}</td>
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
                        <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(emp.estimated_total ?? 0)}</td>
                      </tr>
                    )
                  })}
                  {filtered.length > 0 && (
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td className="px-5 py-3 text-gray-700">Totals</td>
                      <td className="px-4 py-3 text-right">{formatHours(filtered.reduce((s, e) => s + (e.approved_hours ?? 0), 0))}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(filtered.reduce((s, e) => s + (e.base_gross ?? 0), 0))}</td>
                      <td className="px-4 py-3 text-right text-amber-600">
                        {formatCurrency(filtered.reduce((s, e) => s + (gasByUser[e.user_id] ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-red-500">
                        −{formatCurrency(filtered.reduce((s, e) => s + (loanDeductions[e.user_id] ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatCurrency(filtered.reduce((s, e) => s + (bonusByUser[e.user_id] ?? 0), 0))}
                      </td>
                      <td className="px-5 py-3 text-right text-brand-500">{formatCurrency(filtered.reduce((s, e) => s + (e.estimated_total ?? 0), 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Note</th>
                    <th className="text-right px-5 py-3">Amount</th>
                    <th className="px-5 py-3 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="group hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{adj.user_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${adjColor(adj.type)}`}>
                          {adjLabel(adj.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {adj.description || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-green-600">{formatCurrency(adj.amount)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button onClick={() => openEditBonus(adj)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                            <EditIcon />
                          </button>
                          <button onClick={() => setDeleteAdj(adj)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Contractors tab content ────────────────────────────────── */}
      {tab === 'contractors' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-900">Contractor Invoices</h3>
              <p className="text-xs text-gray-400 mt-0.5">{p.label}</p>
            </div>
            {pendingInvCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">
                {pendingInvCount} pending review
              </span>
            )}
          </div>

          {loadingInvs ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : contractorInvs.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No contractor invoices for this period.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Contractor</th>
                  <th className="text-left px-4 py-3">Invoice File</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-5 py-3 w-36" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contractorInvs.map((inv) => {
                  const meta = INV_STATUS[inv.status] ?? INV_STATUS.submitted
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{inv.contractor_name}</td>
                      <td className="px-4 py-3">
                        <a href={getDownloadUrl(inv.id)} target="_blank" rel="noopener noreferrer"
                          className="text-brand-500 hover:underline text-xs max-w-[180px] block truncate">
                          {inv.file_original_name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {inv.amount ? formatCurrency(inv.amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openStatusModal(inv)}>
                          Update Status
                        </Button>
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
          <div className="flex flex-col gap-3">
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

      {/* Contractor invoice status */}
      <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)}
        title={`Update Invoice — ${statusModal?.contractor_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <p className="text-gray-500">File: <span className="font-medium text-gray-800">{statusModal?.file_original_name}</span></p>
            {statusModal?.amount && (
              <p className="text-gray-500 mt-0.5">Amount: <span className="font-medium text-gray-800">{formatCurrency(statusModal.amount)}</span></p>
            )}
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
                  {opt.value === 'check_ready' && (
                    <span className="block text-xs font-normal opacity-70 mt-0.5">Sends push notification</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Note to contractor (optional)</label>
            <input type="text" value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
              placeholder="e.g. Check ready at office, ask for Maria"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>

          {statusError && <p className="text-sm text-red-600">{statusError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setStatusModal(null)}>Cancel</Button>
            <Button fullWidth loading={statusSaving} onClick={handleSaveStatus}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Print checks overlay */}
      {printOpen && (
        <PrintChecks
          employees={filtered}
          period={p}
          gasByUser={gasByUser}
          bonusByUser={bonusByUser}
          loanDeductions={loanDeductions}
          onClose={() => setPrintOpen(false)}
        />
      )}

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
