import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listEmployees, createEmployee, updateEmployee, deactivateEmployee, resetEmployeePassword } from '../../api/employees'
import { listDocuments, getDocumentUrl } from '../../api/documents'
import { formatCurrency } from '../../utils/format'
import { format, parseISO } from 'date-fns'

const EMPTY = {
  name: '', email: '', phone: '', role: 'employee',
  pay_type: 'w2', pay_structure: 'hourly', pay_rate: '',
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

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Password reset modal
  const [pwModal,    setPwModal]    = useState(null)  // employee row | null
  const [pwInput,    setPwInput]    = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [pwError,    setPwError]    = useState('')

  // Contractor documents modal
  const [docsModal,    setDocsModal]    = useState(null)  // employee row | null
  const [docs,         setDocs]         = useState([])
  const [loadingDocs,  setLoadingDocs]  = useState(false)

  const load = () => {
    setLoading(true)
    listEmployees().then((d) => setEmployees(d.employees ?? [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create') }
  const openEdit   = (emp) => {
    setForm({
      name:     emp.name     ?? '',
      email:    emp.email    ?? '',
      phone:    emp.phone    ?? '',
      role:     emp.role     ?? 'employee',
      pay_type:      emp.pay_type      ?? 'w2',
      pay_structure: emp.pay_structure ?? 'hourly',
      pay_rate:      emp.pay_rate      ?? '',
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
    if (!form.email.trim()) { setError('Email is required so the employee can log in.'); return }
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
      email:         form.email.trim(),
      phone:         form.phone.trim() || null,
      role:          form.role,
      ...(form.role !== 'contractor' && {
        pay_type:      form.pay_type,
        pay_structure: form.pay_structure,
        pay_rate:      parseFloat(form.pay_rate) || 0,
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

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this employee?')) return
    await deactivateEmployee(id); load()
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

  const columns = [
    { key: 'name',      label: 'Name' },
    { key: 'email',     label: 'Email' },
    { key: 'phone',     label: 'Phone',  render: (v) => v || '—' },
    {
      key: 'role', label: 'Role',
      render: (v) => (
        <Badge variant={v === 'admin' ? 'active' : v === 'contractor' ? 'pending' : 'approved'}>
          {v}
        </Badge>
      ),
    },
    { key: 'pay_type',  label: 'Type',   render: (v) => <span className="font-mono text-xs font-semibold">{v?.toUpperCase()}</span> },
    {
      key: 'pay_rate', label: 'Rate',
      render: (v, row) => v ? `${formatCurrency(v)}${row.pay_structure === 'salary' ? '/wk' : '/hr'}` : '—',
    },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'approved' : 'rejected'}>{v ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'id', label: '',
      render: (_, row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</Button>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openPwModal(row) }}>Reset Password</Button>
          {row.role === 'contractor' && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openDocs(row) }}>Documents</Button>
          )}
          {row.is_active && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDeactivate(row.id) }}>Deactivate</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="w-full">
      <PageHeader
        title="Employees"
        subtitle="Manage team members and pay settings"
        actions={<Button onClick={openCreate}>+ Add Employee</Button>}
      />
      {loading
        ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : <DataTable columns={columns} data={employees} emptyMessage="No employees yet." />
      }

      {/* Create / Edit modal */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Employee' : 'Edit Employee'}>
        <div className="flex flex-col gap-4">
          <Input label="Full Name *" value={form.name} onChange={set('name')} />
          <Input
            label="Email Address *" type="email" inputMode="email"
            value={form.email} onChange={set('email')}
            helperText="Used to log in to the app"
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
            <p className="text-xs text-gray-500 bg-blue-50 rounded-xl px-4 py-3">
              Contractors log in to upload invoices and legal documents (W-9 and Worker's Compensation). Pay rates are handled per invoice.
            </p>
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
