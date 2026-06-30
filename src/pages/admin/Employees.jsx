import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import DataTable from '../../components/admin/DataTable'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { listEmployees, createEmployee, updateEmployee, deactivateEmployee } from '../../api/employees'
import { formatCurrency, formatPhone } from '../../utils/format'

const EMPTY = { name: '', phone: '', role: 'employee', pay_type: 'w2', pay_rate: '', overtime_rate: '', gas_weekly_allowance: '' }

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [gasEnabled, setGasEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    listEmployees().then((d) => setEmployees(d.employees ?? [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setGasEnabled(false); setModal('create') }
  const openEdit = (emp) => {
    setForm({ ...emp, pay_rate: emp.pay_rate ?? '', overtime_rate: emp.overtime_rate ?? '', gas_weekly_allowance: emp.gas_weekly_allowance ?? '' })
    setGasEnabled(!!emp.gas_weekly_allowance)
    setModal(emp)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      ...form,
      gas_weekly_allowance: gasEnabled ? (form.gas_weekly_allowance || 70) : null,
    }
    try {
      if (modal === 'create') await createEmployee(payload)
      else await updateEmployee(modal.id, payload)
      setModal(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this employee?')) return
    await deactivateEmployee(id)
    load()
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone', render: (v) => formatPhone(v) },
    { key: 'role', label: 'Role', render: (v) => <Badge variant={v === 'admin' ? 'active' : 'pending'}>{v}</Badge> },
    { key: 'pay_type', label: 'Type', render: (v) => <span className="font-mono text-xs font-semibold">{v.toUpperCase()}</span> },
    { key: 'pay_rate', label: 'Rate', render: (v) => `${formatCurrency(v)}/hr` },
    { key: 'gas_weekly_allowance', label: 'Gas', render: (v) => v ? `${formatCurrency(v)}/wk` : '—' },
    { key: 'is_active', label: 'Status', render: (v) => <Badge variant={v ? 'approved' : 'rejected'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</Button>
        {row.is_active && (
          <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDeactivate(row.id) }}>Deactivate</Button>
        )}
      </div>
    )},
  ]

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Employees"
        subtitle="Manage team members and pay settings"
        actions={<Button onClick={openCreate}>+ Add Employee</Button>}
      />
      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : <DataTable columns={columns} data={employees} emptyMessage="No employees yet." />}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Employee' : 'Edit Employee'}>
        <div className="flex flex-col gap-4">
          <Input label="Full Name *" value={form.name} onChange={set('name')} />
          <Input label="Phone Number *" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="+15550001234" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Role</label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" value={form.role} onChange={set('role')}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Pay Type</label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500" value={form.pay_type} onChange={set('pay_type')}>
                <option value="w2">W-2 Employee</option>
                <option value="1099">1099 Contractor</option>
              </select>
            </div>
            <Input label="Hourly Rate *" type="number" inputMode="decimal" value={form.pay_rate} onChange={set('pay_rate')} placeholder="0.00" />
            {form.pay_type === 'w2' && (
              <Input label="OT Rate" type="number" inputMode="decimal" value={form.overtime_rate} onChange={set('overtime_rate')} placeholder="0.00" />
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={gasEnabled} onChange={(e) => setGasEnabled(e.target.checked)} className="accent-brand-500 w-4 h-4" />
              <span className="text-sm font-medium text-gray-700">Weekly Gas Allowance</span>
            </label>
            {gasEnabled && (
              <Input
                type="number" inputMode="decimal"
                value={form.gas_weekly_allowance || '70'}
                onChange={set('gas_weekly_allowance')}
                placeholder="70.00"
                helperText="Added automatically each week this employee has approved time"
              />
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
