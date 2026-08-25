import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listEmployees, createEmployee, updateEmployee, deactivateEmployee, reactivateEmployee, resetEmployeePassword } from '../../api/employees'
import { listSalaryHistory, createSalaryHistory, deleteSalaryHistory } from '../../api/salaryHistory'
import { getPersonalDetails, revealPersonalDetailField, savePersonalDetails } from '../../api/personalDetails'
import { listDocuments, getDocumentUrl } from '../../api/documents'
import { listJobs } from '../../api/jobs'
import { groupJobsByCompany } from '../../utils/jobs'
import { formatCurrency } from '../../utils/format'
import { format, parseISO, addDays, subDays } from 'date-fns'

// Weeks run Monday–Sunday (matches Payroll.jsx). A rate change made mid-period
// shouldn't retroactively apply to hours already worked this period, so the
// default effective date for a newly logged change is the Monday after the
// current week — mirrors the same rule api/employees/item.php applies when a
// rate change is auto-logged from the main Edit form.
function nextPayPeriodStart() {
  const today = new Date()
  const dow = today.getDay() === 0 ? 7 : today.getDay() // ISO: Mon=1 .. Sun=7
  return format(addDays(today, 8 - dow), 'yyyy-MM-dd')
}

// Annotates newest-first history rows with each entry's effective range and
// whether it's the currently-active rate or a not-yet-effective future one.
function annotateSalaryHistory(history) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  let currentFound = false
  return history.map((h, i) => {
    const isUpcoming = h.effective_date > todayStr
    const isCurrent = !isUpcoming && !currentFound
    if (isCurrent) currentFound = true
    return { ...h, isUpcoming, isCurrent, rangeEnd: i === 0 ? null : history[i - 1].effective_date }
  })
}

const EMPTY = {
  name: '', email: '', phone: '', address: '', role: 'employee',
  pay_type: 'w2', pay_structure: 'hourly', pay_rate: '', default_job_id: '',
}

const DOC_LABELS = {
  w9:           { label: 'W-9',                   color: 'bg-purple-100 text-purple-700' },
  workers_comp: { label: "Worker's Comp",          color: 'bg-blue-100 text-blue-700' },
}

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

const CheckCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 text-green-500 flex-shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const XCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 text-amber-400 flex-shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
  </svg>
)

// A sensitive field (Tax ID, bank account #) the server sends back masked
// (last 4 only) — "Show" fetches the real value on demand rather than it
// ever being included in the general fetch. Editing always goes through a
// separate blank-by-default input so leaving it untouched can never save
// the masked display text back over the real value.
function MaskedField({ label, masked, revealedValue, revealing, onReveal, newValue, onNewValue, placeholder }) {
  const shown = revealedValue ?? masked
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {masked && revealedValue === undefined && (
          <button type="button" onClick={onReveal} disabled={revealing}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
            {revealing ? 'Loading…' : 'Show'}
          </button>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 font-mono">
        {shown || <span className="text-gray-400 font-sans italic">Not on file</span>}
      </div>
      <input
        type="text"
        value={newValue}
        onChange={(e) => onNewValue(e.target.value)}
        placeholder={masked ? `Enter to change — ${placeholder}` : placeholder}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
      />
    </div>
  )
}

export default function AdminEmployees() {
  const [employees, setEmployees]     = useState([])
  const [inactive, setInactive]       = useState([])
  const [jobs, setJobs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(null)
  const [form, setForm]               = useState(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  // Password reset modal
  const [pwModal,    setPwModal]    = useState(null)  // employee row | null
  const [pwInput,    setPwInput]    = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwError,    setPwError]    = useState('')

  // Contractor documents modal
  const [docsModal,    setDocsModal]    = useState(null)  // employee row | null
  const [docs,         setDocs]         = useState([])
  const [loadingDocs,  setLoadingDocs]  = useState(false)

  // Salary history (inside the Edit Employee modal)
  const [salaryHistory,  setSalaryHistory]  = useState([])
  const [loadingSalary,  setLoadingSalary]  = useState(false)
  const [showAddRate,    setShowAddRate]    = useState(false)
  const [rateForm,       setRateForm]       = useState({ pay_rate: '', pay_structure: 'hourly', effective_date: '', note: '' })
  const [rateSaving,     setRateSaving]     = useState(false)
  const [rateError,      setRateError]      = useState('')

  const loadSalaryHistory = (userId) =>
    listSalaryHistory(userId).then((d) => setSalaryHistory(d.history ?? []))

  useEffect(() => {
    if (modal && modal !== 'create') {
      setLoadingSalary(true)
      loadSalaryHistory(modal.id).finally(() => setLoadingSalary(false))
      setShowAddRate(false)
      setRateError('')
      setRateForm({ pay_rate: '', pay_structure: modal.pay_structure ?? 'hourly', effective_date: nextPayPeriodStart(), note: '' })
      loadPersonalDetails(modal.id)
    } else {
      setSalaryHistory([])
      setPersonalDetails(null)
    }
  }, [modal])

  const handleAddRate = async () => {
    const rate = parseFloat(rateForm.pay_rate)
    if (!rateForm.pay_rate || isNaN(rate) || rate <= 0) { setRateError('Enter a rate greater than 0.'); return }
    if (!rateForm.effective_date) { setRateError('Pick an effective date.'); return }
    setRateSaving(true); setRateError('')
    try {
      await createSalaryHistory({
        user_id: modal.id,
        pay_rate: rate,
        pay_structure: rateForm.pay_structure,
        effective_date: rateForm.effective_date,
        note: rateForm.note.trim() || undefined,
      })
      await loadSalaryHistory(modal.id)
      setShowAddRate(false)
    } catch (err) {
      setRateError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setRateSaving(false) }
  }

  const handleDeleteRate = async (id) => {
    if (!confirm('Delete this history entry?')) return
    await deleteSalaryHistory(id)
    loadSalaryHistory(modal.id)
  }

  // Personal details (Tax ID, birthdate, emergency contact, direct deposit —
  // inside the Edit Employee modal, admin-only). tax_id and
  // bank_account_number come back masked from the server; editing either
  // uses a separate blank-by-default "new value" field so an untouched
  // masked display never gets saved back over the real value.
  const [personalDetails, setPersonalDetails]   = useState(null)
  const [loadingPersonal, setLoadingPersonal]   = useState(false)
  const [personalForm,    setPersonalForm]      = useState({
    birth_date: '', emergency_contact_name: '', emergency_contact_phone: '', bank_routing_number: '',
  })
  const [newTaxId,        setNewTaxId]          = useState('')
  const [newBankAccount,  setNewBankAccount]    = useState('')
  const [revealed,        setRevealed]          = useState({}) // { tax_id: '123-45-6789', bank_account_number: '...' }
  const [revealing,       setRevealing]         = useState('') // field currently being fetched
  const [personalSaving,  setPersonalSaving]    = useState(false)
  const [personalError,   setPersonalError]     = useState('')

  const loadPersonalDetails = (userId) => {
    setLoadingPersonal(true)
    getPersonalDetails(userId).then((d) => {
      const det = d.details ?? {}
      setPersonalDetails(det)
      setPersonalForm({
        birth_date:              det.birth_date ?? '',
        emergency_contact_name:  det.emergency_contact_name ?? '',
        emergency_contact_phone: det.emergency_contact_phone ?? '',
        bank_routing_number:     det.bank_routing_number ?? '',
      })
      setNewTaxId(''); setNewBankAccount(''); setRevealed({}); setPersonalError('')
    }).finally(() => setLoadingPersonal(false))
  }

  const handleReveal = async (field) => {
    setRevealing(field)
    try {
      const d = await revealPersonalDetailField(modal.id, field)
      setRevealed((r) => ({ ...r, [field]: d.details?.[field] ?? '' }))
    } catch {
      setPersonalError('Could not reveal that field. Try again.')
    } finally { setRevealing('') }
  }

  const handleSavePersonal = async () => {
    setPersonalSaving(true); setPersonalError('')
    try {
      await savePersonalDetails({
        user_id: modal.id,
        ...personalForm,
        ...(newTaxId.trim()       && { tax_id: newTaxId.trim() }),
        ...(newBankAccount.trim() && { bank_account_number: newBankAccount.trim() }),
      })
      loadPersonalDetails(modal.id)
    } catch (err) {
      setPersonalError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setPersonalSaving(false) }
  }

  const load = () => {
    setLoading(true)
    Promise.all([listEmployees({ active: 1 }), listEmployees({ active: 0 }), listJobs({ status: 'active' })])
      .then(([active, inactiveRes, jobsRes]) => {
        setEmployees(active.employees ?? [])
        setInactive(inactiveRes.employees ?? [])
        setJobs(jobsRes.jobs ?? [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create') }
  const openEdit   = (emp) => {
    setForm({
      name:     emp.name     ?? '',
      email:    emp.email    ?? '',
      phone:    emp.phone    ?? '',
      address:  emp.address  ?? '',
      role:     emp.role     ?? 'employee',
      pay_type:      emp.pay_type      ?? 'w2',
      pay_structure: emp.pay_structure ?? 'hourly',
      pay_rate:      emp.pay_rate      ?? '',
      default_job_id: emp.default_job_id ?? '',
    })
    setError('')
    setModal(emp)
  }

  const openDocs = async (emp) => {
    setDocsModal(emp); setDocs([]); setLoadingDocs(true)
    try {
      const data = await listDocuments({ user_id: emp.id })
      setDocs(data.documents ?? [])
    } finally { setLoadingDocs(false) }
  }

  const handleSave = async () => {
    if (!form.name.trim())  { setError('Name is required.'); return }
    // Contractors don't log in, so unlike employees/admins their email isn't required.
    if (form.role !== 'contractor' && !form.email.trim()) { setError('Email is required so the employee can log in.'); return }
    if (form.role !== 'contractor') {
      const rate = parseFloat(form.pay_rate)
      if (!form.pay_rate || isNaN(rate) || rate <= 0) {
        setError(form.pay_structure === 'salary' ? 'Weekly salary must be a number greater than 0.' : 'Hourly rate must be a number greater than 0.')
        return
      }
    }
    setSaving(true); setError('')
    const payload = {
      name:          form.name.trim(),
      email:         form.email.trim() || null,
      phone:         form.phone.trim() || null,
      address:       form.address.trim() || null,
      role:          form.role,
      ...(form.role !== 'contractor' && {
        pay_type:      form.pay_type,
        pay_structure: form.pay_structure,
        pay_rate:      parseFloat(form.pay_rate) || 0,
      }),
      // Contractors invoice per job and never clock in, so they're never
      // assigned a default job site.
      ...(modal !== 'create' && form.role !== 'contractor' && {
        default_job_id: form.default_job_id || null,
      }),
    }
    try {
      if (modal === 'create') await createEmployee(payload)
      else await updateEmployee(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (emp) => {
    if (!confirm(`Deactivate ${emp.name}? They will no longer be able to log in.`)) return
    try {
      await deactivateEmployee(emp.id)
      load()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not deactivate. Try again.')
    }
  }

  const handleReactivate = async (emp) => {
    if (!confirm(`Reactivate ${emp.name}? They will be able to log in again.`)) return
    try {
      await reactivateEmployee(emp.id)
      load()
    } catch (err) {
      alert(err?.response?.data?.error ?? 'Could not reactivate. Try again.')
    }
  }

  const openPwModal = (emp) => { setPwModal(emp); setPwInput(''); setPwError('') }

  const handlePromptReset = async () => {
    setPwSaving(true); setPwError('')
    try {
      await resetEmployeePassword(pwModal.id)
      setPwModal(null)
      alert(`${pwModal.name} will be prompted to set a new password on next login.`)
    } catch (err) {
      setPwError(err?.response?.data?.error ?? 'Could not reset. Try again.')
    } finally { setPwSaving(false) }
  }

  const handleSetPassword = async () => {
    if (!pwInput.trim()) { setPwError('Enter a password.'); return }
    if (pwInput.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    setPwSaving(true); setPwError('')
    try {
      await resetEmployeePassword(pwModal.id, pwInput)
      setPwModal(null)
      alert(`Password updated for ${pwModal.name}.`)
    } catch (err) {
      setPwError(err?.response?.data?.error ?? 'Could not set password. Try again.')
    } finally { setPwSaving(false) }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Per doc_type: most recent upload
  const mostRecent = (type) => docs.filter((d) => d.doc_type === type)[0] ?? null
  const docHistory = (type) => docs.filter((d) => d.doc_type === type)

  // Explicit shared widths (rather than per-table auto-sizing) so the Admins/
  // Employees/Contractors tables — each a separate <table> — line up with each
  // other regardless of what content each section happens to contain.
  const columns = [
    { key: 'name',      label: 'Name',  className: 'w-[13%]' },
    { key: 'email',     label: 'Email', className: 'w-[19%]' },
    { key: 'phone',     label: 'Phone', className: 'w-[10%]', render: (v) => v || '—' },
    {
      key: 'role', label: 'Role', className: 'w-[8%]',
      render: (v) => (
        <Badge variant={v === 'admin' ? 'active' : v === 'contractor' ? 'pending' : 'approved'}>
          {v}
        </Badge>
      ),
    },
    { key: 'pay_type',  label: 'Type', className: 'w-[6%]',   render: (v) => <span className="font-mono text-xs font-semibold">{v?.toUpperCase()}</span> },
    {
      key: 'pay_rate', label: 'Rate', className: 'w-[7%]',
      render: (v, row) => v ? `${formatCurrency(v)}${row.pay_structure === 'salary' ? '/wk' : '/hr'}` : '—',
    },
    { key: 'is_active', label: 'Status', className: 'w-[7%]', render: (v) => <Badge variant={v ? 'approved' : 'rejected'}>{v ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'id', label: '',
      render: (_, row) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</Button>
          {row.role !== 'contractor' && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openPwModal(row) }}>Reset Password</Button>
          )}
          {row.role === 'contractor' && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openDocs(row) }}>Documents</Button>
          )}
          {row.is_active && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDeactivate(row) }}>Deactivate</Button>
          )}
        </div>
      ),
    },
  ]

  const inactiveColumns = [
    { key: 'name',  label: 'Name',  className: 'w-[16%]' },
    { key: 'email', label: 'Email', className: 'w-[24%]' },
    {
      key: 'role', label: 'Role', className: 'w-[10%]',
      render: (v) => (
        <Badge variant={v === 'admin' ? 'active' : v === 'contractor' ? 'pending' : 'approved'}>
          {v}
        </Badge>
      ),
    },
    {
      key: 'deactivated_at', label: 'Deactivated', className: 'w-[15%]',
      render: (v) => v ? format(parseISO(v), 'MMM d, yyyy') : '—',
    },
    {
      key: 'id', label: '',
      render: (_, row) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleReactivate(row) }}>Reactivate</Button>
        </div>
      ),
    },
  ]

  const ROLE_ORDER = ['admin', 'employee', 'contractor']
  const ROLE_LABELS = { admin: 'Admins', employee: 'Employees', contractor: 'Contractors' }
  const grouped = ROLE_ORDER.map(role => ({
    role,
    label: ROLE_LABELS[role],
    rows: employees.filter(e => e.role === role),
  })).filter(g => g.rows.length > 0)

  return (
    <div className="w-full">
      <PageHeader
        title="Employees"
        subtitle="Manage team members and pay settings"
        actions={<Button onClick={openCreate}>+ Add Employee</Button>}
      />
      {loading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : (
          <div className="flex flex-col gap-8">
            {grouped.length === 0 && (
              <p className="text-center text-gray-400 py-16 text-sm">No employees yet.</p>
            )}
            {grouped.map(({ role, label, rows }) => (
              <div key={role}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">{label}</h3>
                <DataTable columns={columns} data={rows} fixed />
              </div>
            ))}
            {inactive.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
                  Deactivated Employees
                </h3>
                <DataTable columns={inactiveColumns} data={inactive} fixed />
              </div>
            )}
          </div>
        )
      }

      {/* Create / Edit modal */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Employee' : 'Edit Employee'}>
        <div className="flex flex-col gap-4">
          <Input label="Full Name *" value={form.name} onChange={set('name')} />
          <Input
            label={form.role === 'contractor' ? 'Email Address' : 'Email Address *'} type="email" inputMode="email"
            value={form.email} onChange={set('email')}
            helperText={form.role === 'contractor' ? 'Optional — contractors don’t log in' : 'Used to log in to the app'}
          />
          <Input
            label="Phone Number" type="tel" inputMode="tel"
            value={form.phone} onChange={set('phone')}
            helperText="Optional — can also be used to log in"
          />

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Role</label>
            <select
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
              value={form.role} onChange={set('role')}
            >
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>

          {form.role === 'contractor' ? (
            <>
              <p className="text-xs text-gray-500 bg-blue-50 rounded-xl px-4 py-3">
                Contractors don't log in to the app — invoices, estimates, and checks are all managed here by an admin (Payroll → Contractors). Pay rates are handled per invoice, not as a fixed rate.
              </p>
              <Input
                label="Mailing Address"
                value={form.address} onChange={set('address')}
                placeholder="Street, City, State ZIP"
                helperText="Shown on printed checks"
              />
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Pay Type</label>
                <select
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
                  value={form.pay_type} onChange={set('pay_type')}
                >
                  <option value="w2">W-2 Employee</option>
                  <option value="1099">1099 Employee</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Pay Structure</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'hourly', label: 'Hourly', sub: 'Rate × hours worked' },
                    { value: 'salary', label: 'Salary', sub: 'Fixed amount per week' },
                  ].map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm((f) => ({ ...f, pay_structure: opt.value }))}
                      className={`px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                        form.pay_structure === opt.value
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${form.pay_structure === opt.value ? 'text-brand-700' : 'text-gray-700'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label={form.pay_structure === 'salary' ? 'Weekly Salary *' : 'Hourly Rate *'}
                type="number" inputMode="decimal"
                value={form.pay_rate} onChange={set('pay_rate')}
                placeholder="0.00"
                helperText={form.pay_structure === 'salary' ? 'Paid each week regardless of hours clocked' : undefined}
              />
            </>
          )}

          {modal && modal !== 'create' && form.role !== 'contractor' && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Default Job Site</label>
              <select
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
                value={form.default_job_id} onChange={set('default_job_id')}
              >
                <option value="">— None —</option>
                {groupJobsByCompany(jobs).map(({ company, jobs: groupJobs }) => (
                  <optgroup key={company} label={company}>
                    {groupJobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Auto-selected when this person clocks in — they can still change it</p>
            </div>
          )}

          {modal && modal !== 'create' && form.role !== 'contractor' && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Salary History</label>
                <button type="button" onClick={() => setShowAddRate((s) => !s)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  {showAddRate ? 'Cancel' : '+ Log Rate Change'}
                </button>
              </div>

              {showAddRate && (
                <div className="bg-gray-50 rounded-xl p-3 mb-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label={rateForm.pay_structure === 'salary' ? 'Weekly Salary' : 'Hourly Rate'}
                      type="number" inputMode="decimal"
                      value={rateForm.pay_rate}
                      onChange={(e) => setRateForm((f) => ({ ...f, pay_rate: e.target.value }))}
                      placeholder="0.00"
                    />
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Structure</label>
                      <select
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-brand-500"
                        value={rateForm.pay_structure}
                        onChange={(e) => setRateForm((f) => ({ ...f, pay_structure: e.target.value }))}
                      >
                        <option value="hourly">Hourly</option>
                        <option value="salary">Salary</option>
                      </select>
                    </div>
                  </div>
                  <Input
                    label="Effective Date" type="date"
                    value={rateForm.effective_date}
                    onChange={(e) => setRateForm((f) => ({ ...f, effective_date: e.target.value }))}
                    helperText="Defaults to the start of next pay period — change it to backdate or apply immediately"
                  />
                  <Input
                    label="Note (optional)"
                    value={rateForm.note}
                    onChange={(e) => setRateForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="e.g. Annual raise"
                  />
                  {rateError && <p className="text-xs text-red-600">{rateError}</p>}
                  <Button size="sm" loading={rateSaving} onClick={handleAddRate}>Save Entry</Button>
                </div>
              )}

              {loadingSalary
                ? <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                : salaryHistory.length === 0
                  ? <p className="text-xs text-gray-400">No rate history recorded.</p>
                  : (
                    <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                      {annotateSalaryHistory(salaryHistory).map((h) => (
                        <div key={h.id} className="flex items-start justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(h.pay_rate)}{h.pay_structure === 'salary' ? '/wk' : '/hr'}
                            </span>
                            {h.isUpcoming && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Upcoming</span>
                            )}
                            {h.isCurrent && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Current</span>
                            )}
                            <p className="text-gray-400 mt-0.5">
                              {format(parseISO(h.effective_date), 'MMM d, yyyy')}
                              {' – '}
                              {h.rangeEnd ? format(subDays(parseISO(h.rangeEnd), 1), 'MMM d, yyyy') : 'Present'}
                            </p>
                            {h.note && <p className="text-gray-400 italic mt-0.5 truncate">{h.note}</p>}
                          </div>
                          <button type="button" onClick={() => handleDeleteRate(h.id)}
                            className="text-gray-300 hover:text-red-500 shrink-0 px-1 text-sm leading-none">✕</button>
                        </div>
                      ))}
                    </div>
                  )
              }
            </div>
          )}

          {modal && modal !== 'create' && (
            <div className="border-t border-gray-100 pt-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Personal Details</label>
              {loadingPersonal ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : (
                <div className="flex flex-col gap-3">
                  <MaskedField
                    label="Tax ID (SSN/EIN)"
                    masked={personalDetails?.tax_id}
                    revealedValue={revealed.tax_id}
                    revealing={revealing === 'tax_id'}
                    onReveal={() => handleReveal('tax_id')}
                    newValue={newTaxId}
                    onNewValue={setNewTaxId}
                    placeholder="XXX-XX-XXXX"
                  />
                  <Input
                    label="Birth Date" type="date"
                    value={personalForm.birth_date}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, birth_date: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Emergency Contact Name"
                      value={personalForm.emergency_contact_name}
                      onChange={(e) => setPersonalForm((f) => ({ ...f, emergency_contact_name: e.target.value }))}
                    />
                    <Input
                      label="Emergency Contact Phone"
                      value={personalForm.emergency_contact_phone}
                      onChange={(e) => setPersonalForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))}
                    />
                  </div>
                  <Input
                    label="Bank Routing Number"
                    value={personalForm.bank_routing_number}
                    onChange={(e) => setPersonalForm((f) => ({ ...f, bank_routing_number: e.target.value }))}
                  />
                  <MaskedField
                    label="Bank Account Number"
                    masked={personalDetails?.bank_account_number}
                    revealedValue={revealed.bank_account_number}
                    revealing={revealing === 'bank_account_number'}
                    onReveal={() => handleReveal('bank_account_number')}
                    newValue={newBankAccount}
                    onNewValue={setNewBankAccount}
                    placeholder="Account number"
                  />
                  {personalError && <p className="text-xs text-red-600">{personalError}</p>}
                  <Button size="sm" loading={personalSaving} onClick={handleSavePersonal}>Save Personal Details</Button>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal isOpen={!!pwModal} onClose={() => setPwModal(null)} title={`Reset Password — ${pwModal?.name ?? ''}`}>
        <div className="flex flex-col gap-5">
          {/* Option 1: prompt on next login */}
          <div className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-3">
            <div>
              <p className="font-semibold text-sm text-gray-900">Prompt reset on next login</p>
              <p className="text-xs text-gray-500 mt-0.5">Clears their current password. They will be asked to set a new one when they next log in.</p>
            </div>
            <Button variant="secondary" loading={pwSaving} onClick={handlePromptReset}>
              Clear Password &amp; Prompt Reset
            </Button>
          </div>

          {/* Option 2: set password directly */}
          <div className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-3">
            <div>
              <p className="font-semibold text-sm text-gray-900">Set a password directly</p>
              <p className="text-xs text-gray-500 mt-0.5">Choose a password for them. Share it with the employee so they can log in.</p>
            </div>
            <Input
              label="New Password"
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              placeholder="Min. 8 characters"
            />
            <Button loading={pwSaving} onClick={handleSetPassword}>Set Password</Button>
          </div>

          {pwError && <p className="text-sm text-red-600 font-medium">{pwError}</p>}
          <Button variant="secondary" fullWidth onClick={() => setPwModal(null)}>Cancel</Button>
        </div>
      </Modal>

      {/* Contractor documents modal */}
      <Modal
        isOpen={!!docsModal}
        onClose={() => setDocsModal(null)}
        title={`Legal Documents — ${docsModal?.name ?? ''}`}
        size="lg"
      >
        {loadingDocs ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-gray-500">
              Required contractor documents on file. These cannot be deleted once uploaded.
            </p>

            {['w9', 'workers_comp'].map((type) => {
              const latest  = mostRecent(type)
              const history = docHistory(type)
              const meta    = DOC_LABELS[type]

              return (
                <div key={type} className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {latest ? <CheckCircle /> : <XCircle />}
                      <span className="font-semibold text-sm text-gray-900">{meta.label}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                        {latest ? 'On file' : 'Missing'}
                      </span>
                    </div>
                    {latest && (
                      <span className="text-xs text-gray-400">
                        Last uploaded {format(parseISO(latest.uploaded_at), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>

                  {!latest && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                      Contractor has not uploaded this document yet.
                    </p>
                  )}

                  {history.length > 0 && (
                    <div className="space-y-1.5">
                      {history.map((doc, i) => (
                        <div key={doc.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-gray-200">
                          <div className="flex items-center gap-2 min-w-0">
                            {i === 0 && (
                              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                                Current
                              </span>
                            )}
                            <span className="text-sm text-gray-700 truncate">{doc.file_original_name}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                            <span className="text-xs text-gray-400 hidden sm:block">
                              {format(parseISO(doc.uploaded_at), 'MMM d, yyyy')}
                            </span>
                            <a
                              href={getDocumentUrl(doc.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-brand-500 hover:text-brand-700 text-xs font-medium transition-colors"
                            >
                              <ExternalIcon />
                              View
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <Button variant="secondary" fullWidth onClick={() => setDocsModal(null)}>Close</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
