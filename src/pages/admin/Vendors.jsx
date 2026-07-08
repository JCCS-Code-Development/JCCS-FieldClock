import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import PrintVendorCheck from '../../components/admin/PrintVendorCheck'
import {
  listVendors, createVendor, updateVendor, deactivateVendor,
  listVendorChecks, createVendorCheck, updateVendorCheck, deleteVendorCheck,
} from '../../api/vendors'
import { formatCurrency } from '../../utils/format'

const EMPTY_VENDOR = { name: '', type: 'supplier', contact_name: '', email: '', phone: '', address: '', tax_id: '', notes: '' }
const EMPTY_CHECK  = { vendor_id: '', amount: '', memo: '', check_date: format(new Date(), 'yyyy-MM-dd'), period_label: '' }

const TYPE_COLORS = { supplier: 'bg-blue-100 text-blue-700', provider: 'bg-violet-100 text-violet-700' }
const STATUS_COLORS = { pending: 'bg-amber-100 text-amber-700', issued: 'bg-green-100 text-green-700' }

export default function AdminVendors() {
  const [tab, setTab] = useState('vendors')

  // Vendors state
  const [vendors,       setVendors]       = useState([])
  const [loadingV,      setLoadingV]      = useState(true)
  const [vendorModal,   setVendorModal]   = useState(null) // null | 'create' | vendor obj
  const [vendorForm,    setVendorForm]    = useState(EMPTY_VENDOR)
  const [vendorSaving,  setVendorSaving]  = useState(false)
  const [vendorError,   setVendorError]   = useState('')

  // Checks state
  const [checks,        setChecks]        = useState([])
  const [loadingC,      setLoadingC]      = useState(true)
  const [checkModal,    setCheckModal]    = useState(false)
  const [checkForm,     setCheckForm]     = useState(EMPTY_CHECK)
  const [checkSaving,   setCheckSaving]   = useState(false)
  const [checkError,    setCheckError]    = useState('')
  const [printChecks,   setPrintChecks]   = useState(null) // array of checks to print | null
  const [filterVendor,  setFilterVendor]  = useState('')

  const loadVendors = () => {
    setLoadingV(true)
    listVendors().then(d => setVendors(d.vendors ?? [])).finally(() => setLoadingV(false))
  }
  const loadChecks = () => {
    setLoadingC(true)
    listVendorChecks().then(d => setChecks(d.checks ?? [])).finally(() => setLoadingC(false))
  }

  useEffect(() => { loadVendors(); loadChecks() }, [])

  // ── Vendor handlers ──────────────────────────────────────────────
  const openCreateVendor = () => { setVendorForm(EMPTY_VENDOR); setVendorError(''); setVendorModal('create') }
  const openEditVendor   = (v) => { setVendorForm({ name: v.name, type: v.type, contact_name: v.contact_name ?? '', email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '', tax_id: v.tax_id ?? '', notes: v.notes ?? '' }); setVendorError(''); setVendorModal(v) }

  const handleSaveVendor = async () => {
    if (!vendorForm.name.trim()) { setVendorError('Name is required.'); return }
    setVendorSaving(true); setVendorError('')
    try {
      const payload = { ...vendorForm, name: vendorForm.name.trim() }
      if (vendorModal === 'create') await createVendor(payload)
      else await updateVendor(vendorModal.id, payload)
      setVendorModal(null); loadVendors()
    } catch (err) {
      setVendorError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setVendorSaving(false) }
  }

  const handleDeactivateVendor = async (v) => {
    if (!confirm(`Deactivate ${v.name}?`)) return
    try { await deactivateVendor(v.id); loadVendors() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not deactivate.') }
  }

  // ── Check handlers ───────────────────────────────────────────────
  const openCreateCheck = () => { setCheckForm(EMPTY_CHECK); setCheckError(''); setCheckModal(true) }

  const handleSaveCheck = async () => {
    if (!checkForm.vendor_id) { setCheckError('Select a vendor.'); return }
    if (!checkForm.amount || parseFloat(checkForm.amount) <= 0) { setCheckError('Enter a valid amount.'); return }
    if (!checkForm.check_date) { setCheckError('Check date is required.'); return }
    setCheckSaving(true); setCheckError('')
    try {
      const { check } = await createVendorCheck({ ...checkForm, amount: parseFloat(checkForm.amount) })
      setCheckModal(false); loadChecks()
      if (confirm('Check created. Print it now?')) setPrintChecks([check])
    } catch (err) {
      setCheckError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setCheckSaving(false) }
  }

  const handleMarkIssued = async (ck) => {
    try { await updateVendorCheck(ck.id, { status: 'issued' }); loadChecks() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not update.') }
  }

  const handleDeleteCheck = async (ck) => {
    if (!confirm(`Delete check for ${ck.vendor_name} — ${formatCurrency(parseFloat(ck.amount))}?`)) return
    try { await deleteVendorCheck(ck.id); loadChecks() }
    catch (err) { alert(err?.response?.data?.error ?? 'Could not delete.') }
  }

  const setV = (k) => (e) => setVendorForm(f => ({ ...f, [k]: e.target.value }))
  const setC = (k) => (e) => setCheckForm(f => ({ ...f, [k]: e.target.value }))

  const filteredChecks = filterVendor
    ? checks.filter(c => String(c.vendor_id) === filterVendor)
    : checks

  if (printChecks) return <PrintVendorCheck checks={printChecks} onClose={() => { setPrintChecks(null); loadChecks() }} />

  return (
    <div className="w-full">
      <PageHeader
        title="Vendors & Checks"
        subtitle="Manage suppliers, providers, and issue checks"
        actions={
          <div className="flex gap-2">
            {tab === 'vendors' && <Button onClick={openCreateVendor}>+ Add Vendor</Button>}
            {tab === 'checks'  && <Button onClick={openCreateCheck}>+ New Check</Button>}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {[['vendors', 'Vendors & Suppliers'], ['checks', 'Check Records']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Vendors tab ───────────────────────────────────────────── */}
      {tab === 'vendors' && (
        loadingV ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {vendors.length === 0 ? (
              <p className="text-center text-gray-400 py-16 text-sm">No vendors yet. Add your first vendor or supplier.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Name', 'Type', 'Contact', 'Phone', 'Email', 'Tax ID', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(v => (
                      <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900">{v.name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[v.type]}`}>
                            {v.type.charAt(0).toUpperCase() + v.type.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{v.contact_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{v.phone || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{v.email || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{v.tax_id || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openEditVendor(v)}>Edit</Button>
                            {v.is_active && (
                              <Button size="sm" variant="danger" onClick={() => handleDeactivateVendor(v)}>Remove</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Checks tab ────────────────────────────────────────────── */}
      {tab === 'checks' && (
        loadingC ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
          <div className="flex flex-col gap-4">
            {/* Filter */}
            <div className="flex gap-3 items-center">
              <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="">All vendors</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {filteredChecks.some(c => c.status === 'pending') && (
                <Button variant="secondary" onClick={() => setPrintChecks(filteredChecks.filter(c => c.status === 'pending'))}>
                  Print All Pending ({filteredChecks.filter(c => c.status === 'pending').length})
                </Button>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {filteredChecks.length === 0 ? (
                <p className="text-center text-gray-400 py-16 text-sm">No checks yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Vendor', 'Type', 'Amount', 'Memo', 'Check Date', 'Status', 'Created By', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChecks.map(ck => (
                        <tr key={ck.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900">{ck.vendor_name}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[ck.vendor_type]}`}>
                              {ck.vendor_type?.charAt(0).toUpperCase() + ck.vendor_type?.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(parseFloat(ck.amount))}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{ck.memo || '—'}</td>
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
                              <Button size="sm" variant="danger" onClick={() => handleDeleteCheck(ck)}>Delete</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ── Vendor modal ──────────────────────────────────────────── */}
      <Modal isOpen={!!vendorModal} onClose={() => setVendorModal(null)} title={vendorModal === 'create' ? 'Add Vendor' : 'Edit Vendor'}>
        <div className="flex flex-col gap-4">
          <Input label="Name *" value={vendorForm.name} onChange={setV('name')} placeholder="Company or individual name" />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {[['supplier', 'Supplier', 'Materials & goods'], ['provider', 'Provider', 'Services & labor']].map(([val, label, sub]) => (
                <button key={val} type="button" onClick={() => setVendorForm(f => ({ ...f, type: val }))}
                  className={`px-4 py-3 rounded-xl border-2 text-left transition-colors ${vendorForm.type === val ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className={`text-sm font-semibold ${vendorForm.type === val ? 'text-brand-700' : 'text-gray-700'}`}>{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </button>
              ))}
            </div>
          </div>
          <Input label="Contact Name" value={vendorForm.contact_name} onChange={setV('contact_name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" type="tel" value={vendorForm.phone} onChange={setV('phone')} />
            <Input label="Email" type="email" value={vendorForm.email} onChange={setV('email')} />
          </div>
          <Input label="Address" value={vendorForm.address} onChange={setV('address')} placeholder="Street, City, State" />
          <Input label="Tax ID / EIN" value={vendorForm.tax_id} onChange={setV('tax_id')} placeholder="XX-XXXXXXX" />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
            <textarea rows={2} value={vendorForm.notes} onChange={setV('notes')}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none" />
          </div>
          {vendorError && <p className="text-sm text-red-600 font-medium">{vendorError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setVendorModal(null)}>Cancel</Button>
            <Button fullWidth loading={vendorSaving} onClick={handleSaveVendor}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* ── Create check modal ────────────────────────────────────── */}
      <Modal isOpen={checkModal} onClose={() => setCheckModal(false)} title="New Vendor Check">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Vendor *</label>
            <select value={checkForm.vendor_id} onChange={setC('vendor_id')}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">— Select a vendor —</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name} · {v.type.charAt(0).toUpperCase() + v.type.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount *" type="number" inputMode="decimal" value={checkForm.amount} onChange={setC('amount')} placeholder="0.00" />
            <Input label="Check Date *" type="date" value={checkForm.check_date} onChange={setC('check_date')} />
          </div>
          <Input label="Memo / Purpose" value={checkForm.memo} onChange={setC('memo')} placeholder="e.g. Invoice #1042 — Lumber delivery" />
          <Input label="Period (optional)" value={checkForm.period_label} onChange={setC('period_label')} placeholder="e.g. July 2026" />
          {checkError && <p className="text-sm text-red-600 font-medium">{checkError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setCheckModal(false)}>Cancel</Button>
            <Button fullWidth loading={checkSaving} onClick={handleSaveCheck}>Create Check</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
