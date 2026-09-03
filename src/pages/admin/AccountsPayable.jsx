import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { format, startOfWeek, endOfWeek, subWeeks, startOfYear, differenceInWeeks } from 'date-fns'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listInvoices, uploadInvoice, updateInvoiceStatus, deleteInvoice, getDownloadUrl } from '../../api/contractor'
import {
  listVendorInvoices, createVendorInvoice, updateVendorInvoice, deleteVendorInvoice, getVendorInvoiceDownloadUrl,
} from '../../api/vendorInvoices'
import {
  listEmployees, createEmployee, updateEmployee, deactivateEmployee, reactivateEmployee,
} from '../../api/employees'
import { listVendors, createVendor, updateVendor, deactivateVendor } from '../../api/vendors'
import { listDocuments, getDocumentUrl } from '../../api/documents'
import { listEstimates } from '../../api/estimates'
import { formatCurrency } from '../../utils/format'

// Same weekly pay periods Payroll uses, so a contractor invoice's period
// lines up with the payroll run it belongs to.
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

// Invoice lifecycle: draft (unpaid) → printed (a check was cut) → voided.
const INV_STATUS = {
  draft:   { label: 'Draft',   color: 'bg-amber-100 text-amber-700' },
  printed: { label: 'Printed', color: 'bg-blue-100 text-blue-700' },
  voided:  { label: 'Voided',  color: 'bg-red-100 text-red-700' },
}
const STATUS_ORDER = ['draft', 'printed', 'voided']
const STATUS_PICKER = [
  { value: 'draft',   label: 'Draft',   style: 'text-amber-700 border-amber-300 bg-amber-50' },
  { value: 'printed', label: 'Printed', style: 'text-blue-700 border-blue-300 bg-blue-50' },
  { value: 'voided',  label: 'Voided',  style: 'text-red-700 border-red-300 bg-red-50' },
]

// The invoice's uploaded file as a small thumbnail; click to blow it up in a
// full-screen lightbox (image inline, PDF in an iframe). `fileType` is the
// API's 'image' | 'pdf'; `url` already carries the auth token.
function InvoiceThumb({ url, name, fileType, size = 'w-14 h-14' }) {
  const [open, setOpen] = useState(false)

  if (!url) {
    return <div className={`${size} rounded-lg border border-dashed border-gray-200 shrink-0 flex items-center justify-center text-gray-300`}>—</div>
  }

  const isImage = fileType === 'image'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={name || 'View file'}
        className={`group relative ${size} rounded-lg border border-gray-200 overflow-hidden bg-gray-50 shrink-0 hover:border-brand-400 transition-colors`}>
        {isImage ? (
          <img src={url} alt={name || 'Invoice'} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center justify-center w-full h-full gap-0.5 text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[9px] font-bold tracking-wide">PDF</span>
          </span>
        )}
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 flex items-center justify-center transition-colors">
          <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 drop-shadow transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 sm:p-8 bg-black/80"
          onClick={() => setOpen(false)}>
          <button onClick={() => setOpen(false)} aria-label="Close"
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative max-w-[92vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
            {isImage ? (
              <img src={url} alt={name || 'Invoice'} className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg shadow-2xl" />
            ) : (
              <iframe src={url} title={name || 'Invoice'} className="w-[92vw] h-[82vh] bg-white rounded-lg shadow-2xl" />
            )}
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="mt-3 text-white/80 hover:text-white text-sm underline">
            Open original{name ? ` — ${name}` : ''}
          </a>
        </div>,
        document.body
      )}
    </>
  )
}

function StatusFilterBar({ value, onChange, counts }) {
  return (
    <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {[['all', 'All'], ...STATUS_ORDER.map((s) => [s, INV_STATUS[s].label])].map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
            value === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {label}
          <span className="ml-1.5 text-xs text-gray-400">{counts[key] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Contractors
// ═══════════════════════════════════════════════════════════════════════════
function ContractorsPanel() {
  const [periodIdx, setPeriodIdx] = useState('all') // 'all' | number
  const [statusFilter, setStatusFilter] = useState('all')
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])

  const selPeriod = periodIdx === 'all' ? null : periods[periodIdx]

  const [statusModal, setStatusModal] = useState(null)
  const [statusValue, setStatusValue] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [statusEstimateNumber, setStatusEstimateNumber] = useState('')
  const [statusJobLocation, setStatusJobLocation] = useState('')
  const [statusInvNum, setStatusInvNum] = useState('')
  const [statusAmount, setStatusAmount] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState('')

  const [invModal, setInvModal] = useState(false)
  const [invForm, setInvForm] = useState({ user_id: '', estimate_number: '', job_location: '', invoice_number: '', amount: '', file: null })
  const [invSaving, setInvSaving] = useState(false)
  const [invError, setInvError] = useState('')
  const invFileRef = useRef(null)
  const [invContractorQuery, setInvContractorQuery] = useState('')
  const [invContractorOpen, setInvContractorOpen] = useState(false)

  const [quickAddContractor, setQuickAddContractor] = useState(null)
  const [qacSaving, setQacSaving] = useState(false)
  const [qacError, setQacError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    setLoading(true)
    listInvoices(selPeriod ? { period_start: selPeriod.start, period_end: selPeriod.end } : undefined)
      .then((d) => setInvoices(d.invoices ?? []))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [periodIdx])

  useEffect(() => {
    listEmployees({ active: 1 }).then((d) => setEmployees(d.employees ?? [])).catch(() => {})
  }, [])

  const counts = useMemo(() => {
    const c = { all: invoices.length, draft: 0, printed: 0, voided: 0 }
    for (const i of invoices) if (c[i.status] != null) c[i.status]++
    return c
  }, [invoices])

  const shown = statusFilter === 'all' ? invoices : invoices.filter((i) => i.status === statusFilter)

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

  const handleEstimateNumberBlur = async (estimateNumber, setJobLocation) => {
    const trimmed = estimateNumber.trim()
    if (!trimmed) return
    try {
      const d = await listEstimates({ estimate_number: trimmed })
      if (d.estimate) setJobLocation(d.estimate.job_name)
    } catch { /* no match — leave as typed */ }
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
      setStatusModal(null); load()
    } catch (err) {
      setStatusError(err?.response?.data?.error ?? 'Could not update. Try again.')
    }
    setStatusSaving(false)
  }

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
        name, role: 'contractor',
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
    if (!selPeriod) { setInvError('Pick a pay period at the top before uploading.'); return }
    if (!invForm.user_id) { setInvError('Select a contractor.'); return }
    if (!invForm.file)    { setInvError('Attach a picture or PDF of the invoice.'); return }
    setInvSaving(true); setInvError('')
    try {
      const form = new FormData()
      form.append('user_id', invForm.user_id)
      form.append('period_start', selPeriod.start)
      form.append('period_end', selPeriod.end)
      if (invForm.estimate_number.trim()) form.append('estimate_number', invForm.estimate_number.trim())
      if (invForm.job_location.trim())    form.append('job_location', invForm.job_location.trim())
      if (invForm.invoice_number.trim())  form.append('invoice_number', invForm.invoice_number.trim())
      if (invForm.amount)                 form.append('amount', invForm.amount)
      form.append('file', invForm.file)
      await uploadInvoice(form)
      setInvModal(false)
      load()
    } catch (err) {
      setInvError(err?.response?.data?.error ?? 'Could not upload. Try again.')
    }
    setInvSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteInvoice(deleteTarget.id)
      setDeleteTarget(null); load()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not delete. Try again.')
    }
    setDeleting(false)
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <select
          value={periodIdx}
          onChange={(e) => setPeriodIdx(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="w-full sm:w-64 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          <option value="all">All pay periods</option>
          {periods.map((p2, i) => <option key={i} value={i}>{p2.label}</option>)}
        </select>
        <div className="sm:ml-auto">
          <Button onClick={openInvoiceModal} disabled={!selPeriod}>+ Upload Invoice</Button>
        </div>
      </div>
      {!selPeriod && <p className="text-xs text-gray-400 -mt-3 mb-4">Switch to a pay period to upload a new invoice.</p>}

      <StatusFilterBar value={statusFilter} onChange={setStatusFilter} counts={counts} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          No contractor invoices{statusFilter === 'all' ? '' : ` in "${INV_STATUS[statusFilter].label}"`}
          {selPeriod ? ` for ${selPeriod.label}` : ''}.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((inv) => {
            const meta = INV_STATUS[inv.status] ?? INV_STATUS.draft
            const estNum = inv.resolved_estimate_number ?? inv.estimate_number
            const jobRef = inv.job_name ?? inv.job_location
            return (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-start gap-3">
                <InvoiceThumb url={getDownloadUrl(inv.id)} name={inv.file_original_name} fileType={inv.file_type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{inv.contractor_name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{estNum ? <>Est. #{estNum}{jobRef && ` — ${jobRef}`}</> : 'No estimate linked'}</span>
                    {inv.invoice_number && <><span className="text-gray-300">·</span><span>Inv #{inv.invoice_number}</span></>}
                  </div>
                  {inv.admin_note && <p className="text-xs text-gray-400 italic mt-1">{inv.admin_note}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="font-semibold text-gray-900 text-sm">
                    {inv.amount ? formatCurrency(inv.amount) : <span className="text-gray-300">—</span>}
                  </span>
                  <div className="flex gap-2">
                    {inv.status !== 'printed' && (
                      <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(inv)}>Delete</Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => openStatusModal(inv)}>Update</Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Update status */}
      <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)}
        title={`Update Invoice — ${statusModal?.contractor_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl px-3 py-3 text-sm flex items-center gap-3">
            {statusModal && (
              <InvoiceThumb url={getDownloadUrl(statusModal.id)} name={statusModal.file_original_name} fileType={statusModal.file_type} />
            )}
            <p className="text-gray-500 min-w-0">File: <span className="font-medium text-gray-800 break-words">{statusModal?.file_original_name}</span></p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_PICKER.map((opt) => (
                <button key={opt.value} onClick={() => setStatusValue(opt.value)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors text-left ${
                    statusValue === opt.value ? opt.style + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Any <span className="font-semibold">Draft</span> invoice with an amount shows up in the Checks hub, ready to pay.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={statusAmount}
                onChange={(e) => setStatusAmount(e.target.value)} placeholder="0.00"
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

      {/* Upload invoice */}
      <Modal isOpen={invModal} onClose={() => setInvModal(false)} title="Upload Contractor Invoice">
        <div className="flex flex-col gap-4">
          {selPeriod && (
            <p className="text-xs text-gray-400">Filing against <span className="font-semibold text-gray-600">{selPeriod.label}</span>.</p>
          )}
          <div className="relative">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Contractor</label>
            <input
              type="text"
              value={invContractorQuery}
              onChange={(e) => {
                setInvContractorQuery(e.target.value)
                setInvForm((f) => ({ ...f, user_id: '' }))
                setInvContractorOpen(true)
              }}
              onFocus={() => setInvContractorOpen(true)}
              onBlur={() => setTimeout(() => setInvContractorOpen(false), 150)}
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

      {/* Quick-add contractor */}
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

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Invoice">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Delete {deleteTarget?.contractor_name}'s invoice{deleteTarget?.invoice_number ? ` #${deleteTarget.invoice_number}` : ''}?
            The uploaded file will be removed. This can't be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Vendors
// ═══════════════════════════════════════════════════════════════════════════
const BLANK_VENDOR_INV = { vendor_id: '', invoice_number: '', amount: '', invoice_date: '', memo: '', file: null }

function VendorsPanel() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [vendorFilter, setVendorFilter] = useState('')
  const [invoices, setInvoices] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  const [regModal, setRegModal] = useState(false)
  const [regForm, setRegForm] = useState(BLANK_VENDOR_INV)
  const [regSaving, setRegSaving] = useState(false)
  const [regError, setRegError] = useState('')
  const regFileRef = useRef(null)

  const [statusModal, setStatusModal] = useState(null)
  const [stValue, setStValue] = useState('')
  const [stAmount, setStAmount] = useState('')
  const [stInvNum, setStInvNum] = useState('')
  const [stMemo, setStMemo] = useState('')
  const [stNote, setStNote] = useState('')
  const [stSaving, setStSaving] = useState(false)
  const [stError, setStError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    setLoading(true)
    listVendorInvoices()
      .then((d) => setInvoices(d.invoices ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    listVendors({ active: 1 }).then((d) => setVendors(d.vendors ?? [])).catch(() => {})
  }, [])

  const counts = useMemo(() => {
    const c = { all: invoices.length, draft: 0, printed: 0, voided: 0 }
    for (const i of invoices) if (c[i.status] != null) c[i.status]++
    return c
  }, [invoices])

  const shown = invoices.filter((i) =>
    (statusFilter === 'all' || i.status === statusFilter) &&
    (!vendorFilter || String(i.vendor_id) === vendorFilter)
  )

  const openRegModal = () => {
    setRegForm(BLANK_VENDOR_INV); setRegError('')
    if (regFileRef.current) regFileRef.current.value = ''
    setRegModal(true)
  }

  const handleRegister = async () => {
    if (!regForm.vendor_id) { setRegError('Select a vendor.'); return }
    setRegSaving(true); setRegError('')
    try {
      const form = new FormData()
      form.append('vendor_id', regForm.vendor_id)
      if (regForm.invoice_number.trim()) form.append('invoice_number', regForm.invoice_number.trim())
      if (regForm.amount)                form.append('amount', regForm.amount)
      if (regForm.invoice_date)          form.append('invoice_date', regForm.invoice_date)
      if (regForm.memo.trim())           form.append('memo', regForm.memo.trim())
      if (regForm.file)                  form.append('file', regForm.file)
      await createVendorInvoice(form)
      setRegModal(false)
      load()
    } catch (err) {
      setRegError(err?.response?.data?.error ?? 'Could not register. Try again.')
    }
    setRegSaving(false)
  }

  const openStatusModal = (inv) => {
    setStatusModal(inv)
    setStValue(inv.status)
    setStAmount(inv.amount != null ? String(parseFloat(inv.amount)) : '')
    setStInvNum(inv.invoice_number ?? '')
    setStMemo(inv.memo ?? '')
    setStNote(inv.admin_note ?? '')
    setStError('')
  }

  const handleSaveStatus = async () => {
    setStSaving(true); setStError('')
    try {
      await updateVendorInvoice({
        id: statusModal.id,
        status: stValue,
        amount: stAmount !== '' ? parseFloat(stAmount) : null,
        invoice_number: stInvNum.trim() || null,
        memo: stMemo.trim() || null,
        admin_note: stNote.trim() || null,
      })
      setStatusModal(null); load()
    } catch (err) {
      setStError(err?.response?.data?.error ?? 'Could not update. Try again.')
    }
    setStSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteVendorInvoice(deleteTarget.id)
      setDeleteTarget(null); load()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not delete. Try again.')
    }
    setDeleting(false)
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="sm:ml-auto">
          <Button onClick={openRegModal} disabled={!vendors.length}>+ Register Invoice</Button>
        </div>
      </div>
      {!vendors.length && <p className="text-xs text-gray-400 -mt-3 mb-4">Add a vendor first (Vendors page) before registering an invoice.</p>}

      <StatusFilterBar value={statusFilter} onChange={setStatusFilter} counts={counts} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          No vendor invoices{statusFilter === 'all' ? '' : ` in "${INV_STATUS[statusFilter].label}"`}.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((inv) => {
            const meta = INV_STATUS[inv.status] ?? INV_STATUS.draft
            return (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-start gap-3">
                <InvoiceThumb
                  url={inv.file_original_name ? getVendorInvoiceDownloadUrl(inv.id) : null}
                  name={inv.file_original_name} fileType={inv.file_type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{inv.vendor_name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    {inv.invoice_number
                      ? <span>Inv #{inv.invoice_number}</span>
                      : <span className="text-gray-300">No invoice #</span>}
                    {inv.status === 'printed' && inv.check_number && (
                      <><span className="text-gray-300">·</span><span>on check #{inv.check_number}</span></>
                    )}
                    {inv.memo && <><span className="text-gray-300">·</span><span className="truncate max-w-[220px]">{inv.memo}</span></>}
                  </div>
                  {inv.admin_note && <p className="text-xs text-gray-400 italic mt-1">{inv.admin_note}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="font-semibold text-gray-900 text-sm">
                    {inv.amount ? formatCurrency(inv.amount) : <span className="text-gray-300">—</span>}
                  </span>
                  <div className="flex gap-2">
                    {inv.status !== 'printed' && (
                      <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(inv)}>Delete</Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => openStatusModal(inv)}>Update</Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Register vendor invoice */}
      <Modal isOpen={regModal} onClose={() => setRegModal(false)} title="Register Vendor Invoice">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Vendor *</label>
            <select value={regForm.vendor_id} onChange={(e) => setRegForm((f) => ({ ...f, vendor_id: e.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">— Select a vendor —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Invoice # (optional)" value={regForm.invoice_number}
              onChange={(e) => setRegForm((f) => ({ ...f, invoice_number: e.target.value }))} placeholder="e.g. 1042" />
            <Input label="Invoice date (optional)" type="date" value={regForm.invoice_date}
              onChange={(e) => setRegForm((f) => ({ ...f, invoice_date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={regForm.amount}
                onChange={(e) => setRegForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <Input label="Memo / purpose (optional)" value={regForm.memo}
            onChange={(e) => setRegForm((f) => ({ ...f, memo: e.target.value }))} placeholder="e.g. Lumber delivery — Main St." />
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Invoice file (optional)</label>
            <input
              ref={regFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setRegForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-semibold"
            />
            <p className="text-xs text-gray-400 mt-1">A picture or PDF of the vendor's invoice/receipt.</p>
          </div>
          {regError && <p className="text-sm text-red-600">{regError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setRegModal(false)}>Cancel</Button>
            <Button fullWidth loading={regSaving} onClick={handleRegister}>Register</Button>
          </div>
        </div>
      </Modal>

      {/* Update vendor invoice */}
      <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)}
        title={`Update Invoice — ${statusModal?.vendor_name ?? ''}`}>
        <div className="flex flex-col gap-4">
          {statusModal?.file_original_name && (
            <div className="bg-gray-50 rounded-xl px-3 py-3 text-sm flex items-center gap-3">
              <InvoiceThumb url={getVendorInvoiceDownloadUrl(statusModal.id)} name={statusModal.file_original_name} fileType={statusModal.file_type} />
              <p className="text-gray-500 min-w-0">File: <span className="font-medium text-gray-800 break-words">{statusModal.file_original_name}</span></p>
            </div>
          )}
          {statusModal?.check_id && (
            <p className="text-xs text-amber-600">
              This invoice is on {statusModal.check_number ? `check #${statusModal.check_number}` : 'a check'}. Void that check to change its status.
            </p>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_PICKER.map((opt) => (
                <button key={opt.value} onClick={() => setStValue(opt.value)}
                  disabled={!!statusModal?.check_id && opt.value !== 'printed'}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors text-left disabled:opacity-40 ${
                    stValue === opt.value ? opt.style + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Any <span className="font-semibold">Draft</span> invoice with an amount shows up in the Checks hub, ready to pay.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" min="0" step="0.01" value={stAmount}
                onChange={(e) => setStAmount(e.target.value)} placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-2.5 text-sm outline-none focus:border-brand-500" />
            </div>
          </div>
          <Input label="Invoice Number (if applicable)" value={stInvNum}
            onChange={(e) => setStInvNum(e.target.value)} placeholder="e.g. 1042" />
          <Input label="Memo / purpose" value={stMemo}
            onChange={(e) => setStMemo(e.target.value)} placeholder="e.g. Lumber delivery — Main St." />
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Internal note (optional)</label>
            <input type="text" value={stNote} onChange={(e) => setStNote(e.target.value)}
              placeholder="e.g. Waiting on itemized breakdown"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          {stError && <p className="text-sm text-red-600">{stError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setStatusModal(null)}>Cancel</Button>
            <Button fullWidth loading={stSaving} onClick={handleSaveStatus}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Invoice">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Delete {deleteTarget?.vendor_name}'s invoice{deleteTarget?.invoice_number ? ` #${deleteTarget.invoice_number}` : ''}?
            {deleteTarget?.file_original_name ? ' The uploaded file will be removed.' : ''} This can't be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Contractor directory — the people who invoice us. Contractors are users with
// role='contractor'; they don't log in, so this is admin-managed CRUD.
const DOC_LABELS = {
  w9:           { label: 'W-9',            color: 'bg-purple-100 text-purple-700' },
  workers_comp: { label: "Worker's Comp",  color: 'bg-blue-100 text-blue-700' },
}
const BLANK_CONTRACTOR = { name: '', email: '', phone: '', address: '' }

function ContractorDirectory() {
  const [active, setActive] = useState([])
  const [inactive, setInactive] = useState([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(null) // 'create' | contractor obj
  const [form, setForm] = useState(BLANK_CONTRACTOR)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [docsFor, setDocsFor] = useState(null)
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([listEmployees({ active: 1 }), listEmployees({ active: 0 })])
      .then(([a, i]) => {
        setActive((a.employees ?? []).filter((e) => e.role === 'contractor'))
        setInactive((i.employees ?? []).filter((e) => e.role === 'contractor'))
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const openCreate = () => { setForm(BLANK_CONTRACTOR); setError(''); setModal('create') }
  const openEdit = (c) => {
    setForm({ name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '' })
    setError(''); setModal(c)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name.trim(),
      role: 'contractor',
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    }
    try {
      if (modal === 'create') await createEmployee(payload)
      else await updateEmployee(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  const doDeactivate = async (c) => {
    if (!confirm(`Deactivate ${c.name}?`)) return
    try { await deactivateEmployee(c.id); load() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not deactivate.') }
  }
  const doReactivate = async (c) => {
    try { await reactivateEmployee(c.id); load() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not reactivate.') }
  }

  const openDocs = async (c) => {
    setDocsFor(c); setDocs([]); setDocsLoading(true)
    try { setDocs((await listDocuments({ user_id: c.id })).documents ?? []) }
    finally { setDocsLoading(false) }
  }
  const latestDoc = (type) => docs.filter((d) => d.doc_type === type).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0]

  const Row = ({ c, inactive: isInactive }) => (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
          {isInactive && c.deactivated_at ? ` · deactivated ${fmtShort(c.deactivated_at)}` : ''}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>Edit</Button>
        <Button size="sm" variant="secondary" onClick={() => openDocs(c)}>Documents</Button>
        {isInactive
          ? <Button size="sm" onClick={() => doReactivate(c)}>Reactivate</Button>
          : <Button size="sm" variant="danger" onClick={() => doDeactivate(c)}>Deactivate</Button>}
      </div>
    </div>
  )

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ Add Contractor</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (active.length === 0 && inactive.length === 0) ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          No contractors yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <div className="flex flex-col gap-2">{active.map((c) => <Row key={c.id} c={c} />)}</div>
          )}
          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Deactivated</p>
              <div className="flex flex-col gap-2">{inactive.map((c) => <Row key={c.id} c={c} inactive />)}</div>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Contractor' : 'Edit Contractor'}>
        <div className="flex flex-col gap-4">
          <Input label="Full name *" value={form.name} onChange={set('name')} />
          <Input label="Email (optional)" type="email" value={form.email} onChange={set('email')}
            helperText="Contractors don't log in — for your records only." />
          <Input label="Phone (optional)" type="tel" value={form.phone} onChange={set('phone')} />
          <Input label="Mailing address (optional)" value={form.address} onChange={set('address')}
            placeholder="Street, City, State ZIP" helperText="Shown on printed checks." />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!docsFor} onClose={() => setDocsFor(null)} title={`Documents — ${docsFor?.name ?? ''}`} size="lg">
        {docsLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">Required contractor documents on file.</p>
            {['w9', 'workers_comp'].map((type) => {
              const latest = latestDoc(type)
              const meta = DOC_LABELS[type]
              return (
                <div key={type} className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm text-gray-900">{meta.label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                      {latest ? 'On file' : 'Missing'}
                    </span>
                  </div>
                  {latest && (
                    <a href={getDocumentUrl(latest.id)} target="_blank" rel="noopener noreferrer"
                      className="text-brand-500 hover:text-brand-700 text-xs font-semibold shrink-0">View</a>
                  )}
                </div>
              )
            })}
            <Button variant="secondary" fullWidth onClick={() => setDocsFor(null)}>Close</Button>
          </div>
        )}
      </Modal>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Vendor directory — suppliers & service providers.
const TYPE_COLORS = { supplier: 'bg-blue-100 text-blue-700', provider: 'bg-violet-100 text-violet-700' }
const BLANK_VENDOR = { name: '', type: 'supplier', contact_name: '', email: '', phone: '', address: '', tax_id: '', notes: '' }

function VendorDirectory() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'create' | vendor obj
  const [form, setForm] = useState(BLANK_VENDOR)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    listVendors().then((d) => setVendors(d.vendors ?? [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const openCreate = () => { setForm(BLANK_VENDOR); setError(''); setModal('create') }
  const openEdit = (v) => {
    setForm({
      name: v.name, type: v.type, contact_name: v.contact_name ?? '', email: v.email ?? '',
      phone: v.phone ?? '', address: v.address ?? '', tax_id: v.tax_id ?? '', notes: v.notes ?? '',
    })
    setError(''); setModal(v)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form, name: form.name.trim() }
      if (modal === 'create') await createVendor(payload)
      else await updateVendor(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  const doDeactivate = async (v) => {
    if (!confirm(`Deactivate ${v.name}?`)) return
    try { await deactivateVendor(v.id); load() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not deactivate.') }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ Add Vendor</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : vendors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          No vendors yet. Add your first supplier or provider.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {vendors.map((v) => (
            <div key={v.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{v.name}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[v.type]}`}>
                    {v.type.charAt(0).toUpperCase() + v.type.slice(1)}
                  </span>
                  {!v.is_active && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {[v.contact_name, v.phone, v.email, v.tax_id && `EIN ${v.tax_id}`].filter(Boolean).join(' · ') || 'No contact info'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => openEdit(v)}>Edit</Button>
                {v.is_active && <Button size="sm" variant="danger" onClick={() => doDeactivate(v)}>Remove</Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Vendor' : 'Edit Vendor'}>
        <div className="flex flex-col gap-4">
          <Input label="Name *" value={form.name} onChange={set('name')} placeholder="Company or individual name" />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {[['supplier', 'Supplier', 'Materials & goods'], ['provider', 'Provider', 'Services & labor']].map(([val, label, sub]) => (
                <button key={val} type="button" onClick={() => setForm((f) => ({ ...f, type: val }))}
                  className={`px-4 py-3 rounded-xl border-2 text-left transition-colors ${form.type === val ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className={`text-sm font-semibold ${form.type === val ? 'text-brand-700' : 'text-gray-700'}`}>{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </button>
              ))}
            </div>
          </div>
          <Input label="Contact name" value={form.contact_name} onChange={set('contact_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} />
          </div>
          <Input label="Address" value={form.address} onChange={set('address')} placeholder="Street, City, State" />
          <Input label="Tax ID / EIN" value={form.tax_id} onChange={set('tax_id')} placeholder="XX-XXXXXXX" />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function fmtShort(d) { try { return format(new Date(d), 'MMM d, yyyy') } catch { return d } }

// ═══════════════════════════════════════════════════════════════════════════
export default function VendorsContractors() {
  const [party, setParty] = useState('contractors') // contractors | vendors
  const [view, setView] = useState('directory')     // directory | invoices

  return (
    <div className="w-full max-w-5xl">
      <PageHeader
        title="Vendors & Contractors"
        subtitle="Directories and invoices for the people and companies we pay. Cut checks from the Checks hub."
      />

      {/* Primary: which party's records. Secondary: directory vs invoices. Two
          different visual languages so the axes don't read as one long strip. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          {[['contractors', 'Contractors'], ['vendors', 'Vendors']].map(([key, label]) => (
            <button key={key} onClick={() => setParty(key)}
              className={`pb-2.5 -mb-px text-sm font-bold border-b-2 transition-colors ${
                party === key ? 'border-brand-500 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-2">
          {[['directory', 'Directory'], ['invoices', 'Invoices']].map(([key, label]) => (
            <button key={key} onClick={() => setView(key)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {party === 'contractors' ? 'Contractors' : 'Vendors'} · {view === 'directory' ? 'Directory' : 'Invoices'}
      </p>

      {party === 'contractors' && view === 'directory' && <ContractorDirectory />}
      {party === 'contractors' && view === 'invoices'  && <ContractorsPanel />}
      {party === 'vendors'     && view === 'directory' && <VendorDirectory />}
      {party === 'vendors'     && view === 'invoices'  && <VendorsPanel />}
    </div>
  )
}
