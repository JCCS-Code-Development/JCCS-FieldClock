import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'
import PrintMiscCheck from '../../components/admin/PrintMiscCheck'
import {
  listChecks, createCheck, updateCheck, markPrinted, unmarkPrinted, voidCheck, deleteCheck, payInvoices, payVendorInvoices,
} from '../../api/checks'
import { listEmployees } from '../../api/employees'
import { listVendors } from '../../api/vendors'
import { listInvoices } from '../../api/contractor'
import { listVendorInvoices } from '../../api/vendorInvoices'
import { formatCurrency } from '../../utils/format'

const STATUS = {
  draft:   { label: 'Draft',   badge: 'pending',  tile: 'text-amber-600' },
  printed: { label: 'Printed', badge: 'active',   tile: 'text-blue-600' },
  cleared: { label: 'Cleared', badge: 'approved', tile: 'text-green-600' },
  voided:  { label: 'Voided',  badge: 'rejected', tile: 'text-red-600' },
}

// Who the check is for. Payroll and contractor checks come from their own
// flows (payday run / approved invoice); everything else is created here.
const PAYEE_OPTIONS = [
  { key: 'vendor',   title: 'Vendor / Provider', sub: 'Suppliers & service providers',  payee_type: 'vendor',   source: 'vendor'   },
  { key: 'employee', title: '1099 Employee',     sub: 'Gas/bonus-style adjustment',     payee_type: 'employee', source: 'misc'     },
  { key: 'donation', title: 'Donation',          sub: 'Charitable / community giving',  payee_type: 'other',    source: 'donation' },
  { key: 'other',    title: 'Someone else',      sub: 'Any other one-off payee',        payee_type: 'other',    source: 'misc'     },
]
const SOURCE_LABEL = { payroll: 'Payroll', contractor: 'Contractor', vendor: 'Vendor', donation: 'Donation', misc: 'Other', manual: 'Manual' }

// Payee sections — each narrows the list by payee type / category. The
// "registry" view (a full numbered-check ledger) sits apart on the tab bar.
const TABS = [
  { key: 'all',        label: 'All',            payee_type: '',           source: ''         },
  { key: 'employee',   label: '1099 Employees', payee_type: 'employee',   source: ''         },
  { key: 'vendor',     label: 'Vendors',        payee_type: 'vendor',     source: ''         },
  { key: 'contractor', label: 'Contractors',    payee_type: 'contractor', source: ''         },
  { key: 'donation',   label: 'Donations',      payee_type: '',           source: 'donation' },
]

const today = () => format(new Date(), 'yyyy-MM-dd')
const fmtDate = (d) => { try { return format(new Date(d + 'T12:00'), 'MMM d, yyyy') } catch { return d } }

// Invoice numbers linked to a check (contractor + vendor), as one string.
const linkedInvoices = (c) =>
  [c.contractor_invoice_numbers, c.vendor_invoice_numbers].filter(Boolean).join(', ')

// ─────────────────────────────────────────────────────────────────────────────
function CreateCheckModal({ onClose, onSaved }) {
  const [choice, setChoice] = useState('vendor')
  const [form, setForm] = useState({
    user_id: '', vendor_id: '', payee_name: '', payee_address: '',
    amount: '', memo: '', check_date: today(), check_number: '',
  })
  const [employees, setEmployees] = useState([])
  const [vendors, setVendors] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Employees only — contractors are paid from an approved invoice, never a hand-cut check.
    listEmployees().then((d) => setEmployees((d.employees ?? []).filter((e) => e.is_active && e.role !== 'contractor'))).catch(() => {})
    listVendors({ active: true }).then((d) => setVendors(d.vendors ?? [])).catch(() => {})
  }, [])

  const opt = PAYEE_OPTIONS.find((o) => o.key === choice)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const pick = (key) => { setChoice(key); setForm((f) => ({ ...f, user_id: '', vendor_id: '', payee_name: '' })) }

  const save = async () => {
    setError('')
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    const payload = {
      payee_type: opt.payee_type,
      source: opt.source,
      amount: amt,
      memo: form.memo.trim() || null,
      check_date: form.check_date,
      check_number: form.check_number.trim() || null,
    }
    if (opt.payee_type === 'vendor') {
      if (!form.vendor_id) { setError('Pick a vendor.'); return }
      payload.vendor_id = Number(form.vendor_id)
    } else if (opt.payee_type === 'employee') {
      if (!form.user_id) { setError('Pick an employee.'); return }
      payload.user_id = Number(form.user_id)
    } else {
      if (!form.payee_name.trim()) { setError('Enter the payee name.'); return }
      payload.payee_name = form.payee_name.trim()
      payload.payee_address = form.payee_address.trim() || null
    }
    setSaving(true)
    try {
      await createCheck(payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not create the check.')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Payee Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PAYEE_OPTIONS.map((o) => (
            <button key={o.key} type="button" onClick={() => pick(o.key)}
              className={`text-left px-3 py-2.5 rounded-xl border-2 transition-colors ${
                choice === o.key ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <p className={`text-sm font-semibold ${choice === o.key ? 'text-brand-700' : 'text-gray-800'}`}>{o.title}</p>
              <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{o.sub}</p>
            </button>
          ))}
        </div>
      </div>

      {opt.payee_type === 'vendor' && (
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Vendor</label>
          <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
            value={form.vendor_id} onChange={set('vendor_id')}>
            <option value="">— Select —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}
      {opt.payee_type === 'employee' && (
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Employee</label>
          <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
            value={form.user_id} onChange={set('user_id')}>
            <option value="">— Select —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}
      {opt.payee_type === 'other' && (
        <>
          <Input label="Payee name" value={form.payee_name} onChange={set('payee_name')}
            placeholder={choice === 'donation' ? 'e.g. Greenville Little League' : 'Name on the check'} />
          <Input label="Payee address (optional)" value={form.payee_address} onChange={set('payee_address')} />
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount" type="number" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" />
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Check date</label>
          <input type="date" value={form.check_date} onChange={set('check_date')}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
      </div>
      <Input label="Memo (optional)" value={form.memo} onChange={set('memo')}
        placeholder={choice === 'donation' ? 'e.g. 2026 season sponsorship' : 'What this check is for'} />
      <Input label="Check number (optional — leave blank to save as a draft)" value={form.check_number} onChange={set('check_number')}
        placeholder="e.g. 5012" helperText="Enter it now if you're writing the check straight away; otherwise fill it in when you print." />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={saving} onClick={save}>
          {form.check_number.trim() ? 'Record check' : 'Save draft'}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Combine one payee's unpaid (draft) invoices — contractor OR vendor —
// into a single check. One payee at a time.
function PayInvoicesModal({ onClose, onSaved }) {
  const [items, setItems] = useState([])   // normalized: {uid, kind, id, payeeKey, payeeName, invoice_number, amount, sub}
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())  // set of uid
  const [checkNumber, setCheckNumber] = useState('')
  const [checkDate, setCheckDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ready = (i) => i.status === 'draft' && !i.check_id && parseFloat(i.amount) > 0
    Promise.all([
      listInvoices().then((d) => d.invoices ?? []).catch(() => []),
      listVendorInvoices().then((d) => d.invoices ?? []).catch(() => []),
    ]).then(([contractor, vendor]) => {
      const norm = [
        ...contractor.filter(ready).map((i) => ({
          uid: `c:${i.id}`, kind: 'contractor', id: i.id,
          payeeKey: `c:${i.user_id}`, payeeName: i.contractor_name ?? `#${i.user_id}`,
          invoice_number: i.invoice_number, amount: parseFloat(i.amount),
          sub: i.job_location || i.job_name || '',
        })),
        ...vendor.filter(ready).map((i) => ({
          uid: `v:${i.id}`, kind: 'vendor', id: i.id,
          payeeKey: `v:${i.vendor_id}`, payeeName: i.vendor_name ?? `#${i.vendor_id}`,
          invoice_number: i.invoice_number, amount: parseFloat(i.amount),
          sub: i.memo || '',
        })),
      ]
      setItems(norm)
    }).finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const m = {}
    for (const it of items) (m[it.payeeKey] ??= { name: it.payeeName, kind: it.kind, items: [] }).items.push(it)
    return m
  }, [items])

  const selectedPayeeKey = useMemo(() => {
    for (const it of items) if (selected.has(it.uid)) return it.payeeKey
    return null
  }, [selected, items])

  const toggle = (it) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(it.uid)) next.delete(it.uid)
      else {
        if (selectedPayeeKey && selectedPayeeKey !== it.payeeKey) return prev // one payee at a time
        next.add(it.uid)
      }
      return next
    })
  }

  const chosen = items.filter((it) => selected.has(it.uid))
  const total = chosen.reduce((s, it) => s + it.amount, 0)

  const save = async () => {
    setError('')
    if (!chosen.length) { setError('Select at least one invoice.'); return }
    setSaving(true)
    try {
      const ids = chosen.map((it) => it.id)
      const opts = { check_number: checkNumber.trim() || undefined, check_date: checkDate }
      if (chosen[0].kind === 'vendor') await payVendorInvoices(ids, opts)
      else await payInvoices(ids, opts)
      onSaved()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not create the check.')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>
  if (!items.length) return <p className="text-sm text-gray-500 py-6 text-center">No unpaid contractor or vendor invoices with an amount are waiting for a check.</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500">Select invoices for one payee to combine into a single check.</p>
      <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
        {Object.entries(groups).map(([key, grp]) => (
          <div key={key}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
              {grp.name} <span className="text-gray-300 font-semibold">· {grp.kind === 'vendor' ? 'Vendor' : 'Contractor'}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              {grp.items.map((it) => {
                const disabled = selectedPayeeKey && selectedPayeeKey !== it.payeeKey
                return (
                  <label key={it.uid}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                      selected.has(it.uid) ? 'border-brand-400 bg-brand-50' : disabled ? 'border-gray-100 bg-gray-50 opacity-50' : 'border-gray-200'}`}>
                    <input type="checkbox" checked={selected.has(it.uid)} disabled={disabled} onChange={() => toggle(it)} />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900">{it.invoice_number || `Invoice #${it.id}`}</span>
                      {it.sub && <span className="text-gray-400"> · {it.sub}</span>}
                    </span>
                    <span className="font-semibold text-gray-900">{formatCurrency(it.amount)}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Check number (optional)" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="leave blank for a draft" />
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Check date</label>
          <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
        <span className="text-sm text-gray-600">{selected.size} invoice{selected.size === 1 ? '' : 's'}</span>
        <span className="text-lg font-bold text-gray-900">{formatCurrency(total)}</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={saving} onClick={save} disabled={!selected.size}>
          {checkNumber.trim() ? 'Cut check' : 'Create draft check'}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function PrintedModal({ check, onClose, onSaved }) {
  const [num, setNum] = useState(check.check_number ?? '')
  const [date, setDate] = useState(check.issued_date ?? today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    if (!num.trim()) { setError('Enter the check number.'); return }
    setSaving(true); setError('')
    try { await markPrinted(check.id, num.trim(), date); onSaved(); onClose() }
    catch (err) { setError(err?.response?.data?.error ?? 'Could not save.') }
    finally { setSaving(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">{check.payee_name} · {formatCurrency(parseFloat(check.amount))}</p>
      <Input label="Check number" value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. 5012" autoFocus />
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Check date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={saving} onClick={go}>Mark printed</Button>
      </div>
    </div>
  )
}

function VoidModal({ check, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    if (!reason.trim()) { setError('A reason is required.'); return }
    setSaving(true); setError('')
    try { await voidCheck(check.id, reason.trim()); onSaved(); onClose() }
    catch (err) { setError(err?.response?.data?.error ?? 'Could not void.') }
    finally { setSaving(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">
        Voiding {check.check_number ? `check #${check.check_number}` : 'this draft'} for {check.payee_name} ({formatCurrency(parseFloat(check.amount))}).
        {check.payee_type === 'contractor' && ' The invoice(s) it paid go back to "ready to pay".'}
      </p>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Reason</label>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 resize-none"
          placeholder="e.g. wrong amount, spoiled check stock" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button variant="danger" fullWidth loading={saving} onClick={go}>Void check</Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A draft check hasn't been written yet, so its details are still fair game.
// Once it's marked printed the record is frozen — void it and start over.
function EditCheckModal({ check, onClose, onSaved }) {
  const [form, setForm] = useState({
    payee_name: check.payee_name ?? '',
    payee_address: check.payee_address ?? '',
    amount: check.amount != null ? String(parseFloat(check.amount)) : '',
    check_date: check.issued_date ?? today(),
    memo: check.memo ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setError('')
    const amt = parseFloat(form.amount)
    if (!form.payee_name.trim()) { setError('Enter the payee name.'); return }
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    setSaving(true)
    try {
      await updateCheck({
        id: check.id,
        payee_name: form.payee_name.trim(),
        payee_address: form.payee_address.trim(),
        amount: amt,
        check_date: form.check_date,
        memo: form.memo.trim(),
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save the changes.')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">
        {SOURCE_LABEL[check.source] ?? check.source} draft · {check.vendor_name || check.updater_name || 'manual entry'}
      </p>
      <Input label="Payee name" value={form.payee_name} onChange={set('payee_name')} />
      <Input label="Payee address (optional)" value={form.payee_address} onChange={set('payee_address')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount" type="number" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" />
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Check date</label>
          <input type="date" value={form.check_date} onChange={set('check_date')}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
      </div>
      <Input label="Memo (optional)" value={form.memo} onChange={set('memo')} placeholder="What this check is for" />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
        <Button fullWidth loading={saving} onClick={save}>Save changes</Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The check register: every numbered check in check-number order, the way the
// old Check Registry page listed them — plus gap markers so a missing number
// stands out. Voided checks keep their number and count as accounted-for.
function RegistryView() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listChecks({ numbered: 1 }).then((d) => setRows(d.checks ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const { entries, numeric, nonNumeric, missingCount, minN, maxN } = useMemo(() => {
    const numeric = []
    const nonNumeric = []
    for (const c of rows) {
      const s = String(c.check_number ?? '').trim()
      if (/^\d+$/.test(s)) numeric.push({ ...c, n: parseInt(s, 10) })
      else if (s) nonNumeric.push(c)
    }
    numeric.sort((a, b) => a.n - b.n)

    const entries = []
    let prev = null
    let missingCount = 0
    for (const c of numeric) {
      if (prev != null && c.n > prev + 1) {
        const gap = c.n - prev - 1
        missingCount += gap
        if (gap <= 25) {
          for (let m = prev + 1; m < c.n; m++) entries.push({ gap: true, from: m, to: m, count: 1 })
        } else {
          entries.push({ gap: true, from: prev + 1, to: c.n - 1, count: gap })
        }
      }
      if (prev == null || c.n !== prev) entries.push({ check: c })
      prev = c.n
    }
    return {
      entries, numeric, nonNumeric, missingCount,
      minN: numeric.length ? numeric[0].n : null,
      maxN: numeric.length ? numeric[numeric.length - 1].n : null,
    }
  }, [rows])

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!numeric.length && !nonNumeric.length) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-sm font-medium">No numbered checks yet</p>
        <p className="text-xs mt-1">A check joins the register once it's marked printed.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {minN != null && (
          <span><span className="text-gray-400">Range </span><span className="font-semibold text-gray-900 tabular-nums">#{minN}–{maxN}</span></span>
        )}
        <span><span className="text-gray-400">Recorded </span><span className="font-semibold text-gray-900 tabular-nums">{numeric.length}</span></span>
        <span className={missingCount ? 'text-amber-700' : 'text-gray-500'}>
          <span className="text-gray-400">Missing </span><span className="font-semibold tabular-nums">{missingCount}</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {entries.map((e, i) => e.gap ? (
          <div key={`gap-${i}`} className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
            <div className="w-14 shrink-0 text-center">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Check</p>
              <p className="text-base font-bold text-amber-700 leading-tight tabular-nums">
                #{e.count === 1 ? e.from : `${e.from}–${e.to}`}
              </p>
            </div>
            <div className="w-px self-stretch bg-amber-200 shrink-0" />
            <p className="text-sm font-medium text-amber-700">
              {e.count === 1 ? 'Missing — no record in FieldClock' : `${e.count} checks missing — no record in FieldClock`}
            </p>
          </div>
        ) : (
          <div key={e.check.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
            <div className="w-14 shrink-0 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Check</p>
              <p className="text-base font-bold text-gray-900 leading-tight tabular-nums">#{e.check.check_number}</p>
            </div>
            <div className="w-px self-stretch bg-gray-100 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{e.check.payee_name}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {SOURCE_LABEL[e.check.source] ?? e.check.source} · {fmtDate(e.check.issued_date)}
                {linkedInvoices(e.check) ? ` · Inv ${linkedInvoices(e.check)}` : (e.check.memo ? ` · ${e.check.memo}` : '')}
              </p>
              {e.check.status === 'voided' && e.check.void_reason && (
                <p className="text-xs text-red-500 italic truncate mt-0.5">Voided: {e.check.void_reason}</p>
              )}
            </div>
            <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
              <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(parseFloat(e.check.amount))}</p>
              <Badge variant={STATUS[e.check.status]?.badge ?? 'pending'}>{STATUS[e.check.status]?.label ?? e.check.status}</Badge>
            </div>
          </div>
        ))}
      </div>

      {nonNumeric.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Non-sequential numbers</p>
          <div className="flex flex-wrap gap-2">
            {nonNumeric.map((c) => (
              <span key={c.id} className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                #{c.check_number} · {c.payee_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminChecks() {
  const [checks, setChecks] = useState([])
  const [counts, setCounts] = useState({ draft: 0, printed: 0, cleared: 0, voided: 0, total: 0 })
  const [totals, setTotals] = useState({ draft: 0, printed: 0, cleared: 0, voided: 0 })
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState('all')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [modal, setModal] = useState(null) // 'create' | 'pay' | {kind:'printed'|'void'|'edit', check}
  const [printing, setPrinting] = useState(null)     // array of checks to print | null
  const [selected, setSelected] = useState(() => new Set())  // check ids picked for batch print

  const load = useCallback(async () => {
    if (tab === 'registry') { setLoading(false); return }  // RegistryView fetches its own
    setLoading(true)
    setSelected(new Set())
    try {
      const t = TABS.find((x) => x.key === tab) ?? TABS[0]
      const params = {}
      if (status) params.status = status
      if (t.payee_type) params.payee_type = t.payee_type
      if (t.source) params.source = t.source
      if (search) params.search = search
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const d = await listChecks(params)
      setChecks(d.checks ?? [])
      setCounts(d.counts ?? counts)
      setTotals(d.totals ?? totals)
    } catch {}
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, status, search, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const refresh = () => load()

  const doDelete = async (c) => {
    if (!window.confirm('Delete this draft check?')) return
    await deleteCheck(c.id).catch(() => {}); refresh()
  }
  const doPrint = (c) => setPrinting([c])
  const doUndo = async (c) => { await unmarkPrinted(c.id).catch(() => {}); refresh() }

  const printable = (c) => c.status === 'draft' || c.status === 'printed'
  const toggleSelect = (c) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(c.id) ? next.delete(c.id) : next.add(c.id)
    return next
  })
  const printSelected = () => {
    const rows = checks.filter((c) => selected.has(c.id))
    if (rows.length) setPrinting(rows)
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Checks"
        subtitle="Every check — payroll, contractors, vendors, donations — in one place"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setModal('pay')}>Pay invoices</Button>
            <Button onClick={() => setModal('create')}>+ New check</Button>
          </div>
        }
      />

      {/* Sections — payee filters on the left, the check register set apart on the right */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === tb.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tb.label}
            </button>
          ))}
        </div>
        <button onClick={() => setTab('registry')}
          className={`shrink-0 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap border transition-colors ${
            tab === 'registry' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}>
          Registry
        </button>
      </div>

      {tab === 'registry' && <RegistryView />}

      {tab !== 'registry' && (
      <>
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {['draft', 'printed', 'voided'].map((k) => (
          <button key={k} onClick={() => setStatus(status === k ? '' : k)}
            className={`rounded-2xl border bg-white p-3.5 text-left transition-colors ${
              status === k ? 'border-brand-400 ring-1 ring-brand-200' : 'border-gray-100 hover:border-gray-200'}`}>
            <p className={`text-2xl font-bold ${STATUS[k].tile}`}>{counts[k] ?? 0}</p>
            <p className="text-xs font-medium text-gray-500 mt-0.5">{STATUS[k].label}</p>
            <p className="text-xs text-gray-400 tabular-nums">{formatCurrency(totals[k] ?? 0)}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 mb-5">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search check #, payee, or memo…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-400" />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400" />
        </div>
      </div>

      {/* Batch-print bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-brand-800">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" onClick={printSelected}>Print selected ({selected.size})</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : checks.length === 0 ? (
        <p className="text-center text-gray-400 py-16 text-sm">No checks match these filters.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {checks.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-4 flex-wrap">
              <input type="checkbox" className="w-4 h-4 shrink-0 accent-brand-500 disabled:opacity-30"
                checked={selected.has(c.id)} disabled={!printable(c)}
                onChange={() => toggleSelect(c)}
                title={printable(c) ? 'Select to batch-print' : 'Only draft or printed checks can be printed'} />
              <div className="w-16 shrink-0 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Check</p>
                <p className="text-base font-bold text-gray-900 leading-tight">{c.check_number ? `#${c.check_number}` : '—'}</p>
              </div>
              <div className="flex-1 min-w-[140px]">
                <p className="font-semibold text-gray-900 text-sm">{c.payee_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {SOURCE_LABEL[c.source] ?? c.source} · {fmtDate(c.issued_date)}
                  {c.memo && !linkedInvoices(c) ? ` · ${c.memo}` : ''}
                </p>
                {linkedInvoices(c) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-600">Invoices:</span> {linkedInvoices(c)}
                  </p>
                )}
                {c.status === 'voided' && c.void_reason && (
                  <p className="text-xs text-red-500 italic mt-0.5">Voided: {c.void_reason}</p>
                )}
              </div>
              <p className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">{formatCurrency(parseFloat(c.amount))}</p>
              <Badge variant={STATUS[c.status]?.badge ?? 'pending'}>{STATUS[c.status]?.label ?? c.status}</Badge>
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                {c.status === 'draft' && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'edit', check: c })}>Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => doPrint(c)}>Print</Button>
                    <Button size="sm" onClick={() => setModal({ kind: 'printed', check: c })}>Mark printed</Button>
                    <Button size="sm" variant="danger" onClick={() => doDelete(c)}>Delete</Button>
                  </>
                )}
                {c.status === 'printed' && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => doPrint(c)}>Print</Button>
                    <Button size="sm" variant="secondary" onClick={() => doUndo(c)}>Undo</Button>
                    <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'void', check: c })}>Void</Button>
                  </>
                )}
                {c.status === 'cleared' && (
                  <Button size="sm" variant="danger" onClick={() => setModal({ kind: 'void', check: c })}>Void</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      <Modal isOpen={modal === 'create'} onClose={() => setModal(null)} title="New check">
        {modal === 'create' && <CreateCheckModal onClose={() => setModal(null)} onSaved={refresh} />}
      </Modal>
      <Modal isOpen={modal === 'pay'} onClose={() => setModal(null)} title="Pay invoices">
        {modal === 'pay' && <PayInvoicesModal onClose={() => setModal(null)} onSaved={refresh} />}
      </Modal>
      <Modal isOpen={modal?.kind === 'printed'} onClose={() => setModal(null)} title="Record the printed check">
        {modal?.kind === 'printed' && <PrintedModal check={modal.check} onClose={() => setModal(null)} onSaved={refresh} />}
      </Modal>
      <Modal isOpen={modal?.kind === 'void'} onClose={() => setModal(null)} title="Void check">
        {modal?.kind === 'void' && <VoidModal check={modal.check} onClose={() => setModal(null)} onSaved={refresh} />}
      </Modal>
      <Modal isOpen={modal?.kind === 'edit'} onClose={() => setModal(null)} title="Edit draft check">
        {modal?.kind === 'edit' && <EditCheckModal check={modal.check} onClose={() => setModal(null)} onSaved={refresh} />}
      </Modal>

      {printing && (
        <PrintMiscCheck
          checks={printing.map((c) => ({ ...c, reason: c.memo || '', check_date: c.issued_date }))}
          onClose={() => setPrinting(null)}
        />
      )}
    </div>
  )
}
