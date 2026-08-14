import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import PrintMiscCheck from '../../components/admin/PrintMiscCheck'
import { listMiscChecks, createMiscCheck, updateMiscCheck, deleteMiscCheck } from '../../api/miscChecks'
import { listVendors } from '../../api/vendors'
import { listEmployees } from '../../api/employees'
import { formatCurrency } from '../../utils/format'

const PAYEE_TYPES = [
  { value: 'vendor',     label: 'Vendor / Provider', sub: 'Suppliers & service providers' },
  { value: 'employee',   label: '1099 Employee',      sub: 'Gas/bonus-style adjustment' },
  { value: 'contractor', label: 'Contractor',         sub: 'Outside their normal invoice' },
]
const TYPE_COLORS = {
  vendor:     'bg-violet-100 text-violet-700',
  employee:   'bg-amber-100 text-amber-700',
  contractor: 'bg-blue-100 text-blue-700',
}
const STATUS_COLORS = { pending: 'bg-amber-100 text-amber-700', issued: 'bg-green-100 text-green-700' }

const EMPTY_FORM = { payee_type: 'vendor', vendor_id: '', user_id: '', amount: '', reason: '', check_date: format(new Date(), 'yyyy-MM-dd') }

export default function AdminMiscChecks() {
  const [checks,       setChecks]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterType,   setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [vendors,     setVendors]     = useState([])
  const [oneNineNine, setOneNineNine] = useState([]) // 1099-classified admin/employee users
  const [contractors, setContractors] = useState([])
  const [loadingPayees, setLoadingPayees] = useState(false)

  const [checkModal,  setCheckModal]  = useState(false)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const [printChecks, setPrintChecks] = useState(null)
  const [delCheck,    setDelCheck]    = useState(null)
  const [deleting,    setDeleting]    = useState(false)

  const load = () => {
    setLoading(true)
    const params = {}
    if (filterType)   params.payee_type = filterType
    if (filterStatus) params.status     = filterStatus
    listMiscChecks(params).then((d) => setChecks(d.checks ?? [])).finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filterType, filterStatus])

  const openCreateModal = async () => {
    setForm(EMPTY_FORM); setError(''); setCheckModal(true)
    if (!vendors.length && !oneNineNine.length && !contractors.length) {
      setLoadingPayees(true)
      try {
        // /employees/index.php has no server-side role filter (see Loans.jsx,
        // Payroll.jsx for the same pattern) — fetch active users once and
        // split by role/pay_type client-side.
        const [v, e] = await Promise.all([listVendors(), listEmployees({ active: 1 })])
        const active = e.employees ?? []
        setVendors(v.vendors ?? [])
        setOneNineNine(active.filter((u) => u.role !== 'contractor' && u.pay_type === '1099'))
        setContractors(active.filter((u) => u.role === 'contractor'))
      } catch { /* pickers just stay empty; the amount/reason/date fields still work */ }
      setLoadingPayees(false)
    }
  }

  const payeeOptions = form.payee_type === 'vendor' ? vendors
    : form.payee_type === 'employee' ? oneNineNine
    : contractors

  const handleSave = async () => {
    const payeeId = form.payee_type === 'vendor' ? form.vendor_id : form.user_id
    if (!payeeId) { setError('Select a payee.'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Enter a valid amount.'); return }
    if (!form.reason.trim()) { setError('Enter a reason.'); return }
    if (!form.check_date) { setError('Check date is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        payee_type: form.payee_type,
        amount:     parseFloat(form.amount),
        reason:     form.reason.trim(),
        check_date: form.check_date,
        ...(form.payee_type === 'vendor' ? { vendor_id: form.vendor_id } : { user_id: form.user_id }),
      }
      const { check } = await createMiscCheck(payload)
      setCheckModal(false); load()
      if (confirm('Check created. Print it now?')) setPrintChecks([check])
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  const handleMarkIssued = async (ck) => {
    try { await updateMiscCheck(ck.id, { status: 'issued' }); load() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not update.') }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try { await deleteMiscCheck(delCheck.id); setDelCheck(null); load() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not delete.') }
    setDeleting(false)
  }

  const pendingChecks = checks.filter((c) => c.status === 'pending')

  return (
    <div className="w-full">
      <PageHeader
        title="Misc Checks"
        subtitle="One-off adjustment or compensation checks — providers, 1099 employees, and contractors, outside the regular pay cycle or invoice"
        actions={<Button onClick={openCreateModal}>+ New Check</Button>}
      />

      {/* Filters */}
      <div className="flex gap-3 items-center mb-5 flex-wrap">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All payee types</option>
          {PAYEE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="issued">Issued</option>
        </select>
        {pendingChecks.length > 0 && (
          <Button variant="secondary" onClick={() => setPrintChecks(pendingChecks)}>
            Print All Pending ({pendingChecks.length})
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {checks.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">No checks yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Payee', 'Type', 'Reason', 'Amount', 'Check Date', 'Status', 'Created By', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checks.map((ck) => (
                    <tr key={ck.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{ck.payee_name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[ck.payee_type]}`}>
                          {PAYEE_TYPES.find((t) => t.value === ck.payee_type)?.label ?? ck.payee_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">{ck.reason}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(parseFloat(ck.amount))}</td>
                      <td className="px-4 py-3 text-gray-600">{format(parseISO(ck.check_date), 'MM/dd/yyyy')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[ck.status]}`}>
                          {ck.status.charAt(0).toUpperCase() + ck.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{ck.created_by_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="secondary" onClick={() => setPrintChecks([ck])}>Print</Button>
                          {ck.status === 'pending' && (
                            <Button size="sm" variant="secondary" onClick={() => handleMarkIssued(ck)}>Mark Issued</Button>
                          )}
                          <Button size="sm" variant="danger" onClick={() => setDelCheck(ck)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Create check modal ────────────────────────────────────── */}
      <Modal isOpen={checkModal} onClose={() => setCheckModal(false)} title="New Adjustment / Compensation Check">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Payee Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYEE_TYPES.map((t) => (
                <button key={t.value} type="button"
                  onClick={() => setForm((f) => ({ ...f, payee_type: t.value, vendor_id: '', user_id: '' }))}
                  className={`px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${form.payee_type === t.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className={`text-xs font-semibold ${form.payee_type === t.value ? 'text-brand-700' : 'text-gray-700'}`}>{t.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Payee *</label>
            <select
              value={form.payee_type === 'vendor' ? form.vendor_id : form.user_id}
              onChange={(e) => setForm((f) => ({
                ...f,
                ...(f.payee_type === 'vendor' ? { vendor_id: e.target.value } : { user_id: e.target.value }),
              }))}
              disabled={loadingPayees}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50 disabled:bg-gray-50"
            >
              <option value="">{loadingPayees ? 'Loading…' : '— Select —'}</option>
              {payeeOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!loadingPayees && payeeOptions.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {form.payee_type === 'employee' ? 'No employees are classified as 1099.' : 'No matches found.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount *" type="number" inputMode="decimal" value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            <Input label="Check Date *" type="date" value={form.check_date}
              onChange={(e) => setForm((f) => ({ ...f, check_date: e.target.value }))} />
          </div>

          <Input label="Reason *" value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="e.g. One-time correction, off-cycle bonus, extra compensation" />

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setCheckModal(false)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Create Check</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm ──────────────────────────────────────────── */}
      <Modal isOpen={!!delCheck} onClose={() => setDelCheck(null)} title="Delete Check">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-4 text-sm">
            <p className="font-medium text-gray-900">{delCheck?.payee_name}</p>
            <p className="text-gray-500 mt-0.5">{formatCurrency(parseFloat(delCheck?.amount ?? 0))} — {delCheck?.reason}</p>
          </div>
          <p className="text-sm text-gray-600">Are you sure you want to delete this check?</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDelCheck(null)}>Cancel</Button>
            <Button variant="danger" fullWidth loading={deleting} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>

      {/* ── Print ────────────────────────────────────────────────────── */}
      {printChecks && (
        <PrintMiscCheck checks={printChecks} onClose={() => { setPrintChecks(null); load() }} />
      )}
    </div>
  )
}
