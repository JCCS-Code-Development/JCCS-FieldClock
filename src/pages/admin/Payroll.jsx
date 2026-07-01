import { useState, useEffect } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { getSummary, getBreakdown, createAdjustment } from '../../api/payroll'
import { listEmployees } from '../../api/employees'
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

export default function AdminPayroll() {
  const [tab, setTab]         = useState('w2')
  const [period, setPeriod]   = useState(0)
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [drillDown, setDrillDown]   = useState(null)
  const [breakdown, setBreakdown]   = useState(null)
  const [adjModal, setAdjModal]     = useState(null)
  const [adjForm, setAdjForm]       = useState({ type: 'bonus', amount: '', description: '' })
  const [saving, setSaving]         = useState(false)

  // Gas review state
  const [gasModal, setGasModal]       = useState(false)
  const [gasEmployees, setGasEmployees] = useState([]) // employees who worked this week
  const [gasAmounts, setGasAmounts]   = useState({})   // { user_id: amount }
  const [gasChecked, setGasChecked]   = useState({})   // { user_id: bool }
  const [gasSaving, setGasSaving]     = useState(false)

  const p = periods[period]

  const loadSummary = () => {
    setLoading(true)
    getSummary({ start: p.start, end: p.end })
      .then((d) => setSummary(d.summary ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSummary() }, [period])

  const openDrillDown = async (emp) => {
    setDrillDown(emp)
    setBreakdown(null)
    const d = await getBreakdown({ user_id: emp.user_id, start: p.start, end: p.end })
    setBreakdown(d.breakdown ?? {})
  }

  const handleAdj = async () => {
    setSaving(true)
    try {
      await createAdjustment({ user_id: adjModal.user_id, period_start: p.start, period_end: p.end, ...adjForm })
      setAdjModal(null)
      loadSummary()
    } finally { setSaving(false) }
  }

  const openGasReview = async () => {
    const d = await listEmployees()
    const active = (d.employees ?? []).filter((e) => e.is_active)
    // Pre-fill amounts from weekly default if set, else $70
    const amounts = {}
    const checked = {}
    active.forEach((e) => {
      amounts[e.id] = e.gas_weekly_allowance ?? 70
      checked[e.id] = false
    })
    // Mark employees who have hours this period
    summary.forEach((s) => {
      if ((s.regular_hours ?? 0) + (s.overtime_hours ?? 0) > 0) {
        checked[s.user_id] = true
      }
    })
    setGasEmployees(active)
    setGasAmounts(amounts)
    setGasChecked(checked)
    setGasModal(true)
  }

  const handleApplyGas = async () => {
    setGasSaving(true)
    try {
      const toApply = gasEmployees.filter((e) => gasChecked[e.id])
      for (const emp of toApply) {
        await createAdjustment({
          user_id: emp.id,
          period_start: p.start,
          period_end: p.end,
          type: 'gas_allowance',
          amount: parseFloat(gasAmounts[emp.id]) || 70,
          description: `Gas allowance ${p.label}`,
        })
      }
      setGasModal(false)
      loadSummary()
    } finally { setGasSaving(false) }
  }

  const filtered = summary.filter((e) => e.pay_type === tab)

  return (
    <div className="w-full">
      <PageHeader
        title="Payroll"
        subtitle="Review pay by period"
        actions={
          <Button variant="secondary" onClick={openGasReview}>
            Review Gas Allowances
          </Button>
        }
      />

      {/* Period selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        {periods.map((p2, i) => (
          <button key={i} onClick={() => setPeriod(i)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              period === i ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}>
            {p2.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {[['w2', 'W-2 Employees'], ['1099', '1099 Contractors']].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Employee</th>
                <th className="text-right px-4 py-3">Paid Hrs</th>
                {tab === 'w2' && <>
                  <th className="text-right px-4 py-3">Regular</th>
                  <th className="text-right px-4 py-3">OT</th>
                </>}
                <th className="text-right px-4 py-3">Base Pay</th>
                <th className="text-right px-4 py-3">Adj.</th>
                <th className="text-right px-5 py-3">Gross</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No data for this period.</td></tr>
              )}
              {filtered.map((emp) => (
                <tr key={emp.user_id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => openDrillDown(emp)}>
                  <td className="px-5 py-3 font-medium text-gray-900">{emp.name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatHours((emp.regular_hours ?? 0) + (emp.overtime_hours ?? 0))}</td>
                  {tab === 'w2' && <>
                    <td className="px-4 py-3 text-right text-gray-600">{formatHours(emp.regular_hours ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatHours(emp.overtime_hours ?? 0)}</td>
                  </>}
                  <td className="px-4 py-3 text-right">{formatCurrency(emp.base_gross ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(emp.adjustments_total ?? 0)}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(emp.estimated_total ?? 0)}</td>
                  <td className="px-5 py-3">
                    <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setAdjModal(emp) }}>+ Adj</Button>
                  </td>
                </tr>
              ))}
              {filtered.length > 0 && (
                <tr className="bg-gray-50 font-semibold text-sm">
                  <td className="px-5 py-3 text-gray-700">Totals</td>
                  <td className="px-4 py-3 text-right">{formatHours(filtered.reduce((s, e) => s + (e.regular_hours ?? 0) + (e.overtime_hours ?? 0), 0))}</td>
                  {tab === 'w2' && <><td className="px-4 py-3" /><td className="px-4 py-3" /></>}
                  <td className="px-4 py-3 text-right">{formatCurrency(filtered.reduce((s, e) => s + (e.base_gross ?? 0), 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(filtered.reduce((s, e) => s + (e.adjustments_total ?? 0), 0))}</td>
                  <td className="px-5 py-3 text-right text-brand-500">{formatCurrency(filtered.reduce((s, e) => s + (e.estimated_total ?? 0), 0))}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down modal */}
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

      {/* Adjustment modal */}
      <Modal isOpen={!!adjModal} onClose={() => setAdjModal(null)} title={`Add Adjustment — ${adjModal?.name}`}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Type</label>
            <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-brand-500"
              value={adjForm.type} onChange={(e) => setAdjForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="bonus">Bonus</option>
              <option value="gas_allowance">Gas Allowance</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <Input label="Amount ($)" type="number" inputMode="decimal" value={adjForm.amount}
            onChange={(e) => setAdjForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
          <Input label="Note" value={adjForm.description}
            onChange={(e) => setAdjForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional note" />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setAdjModal(null)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleAdj}>Add</Button>
          </div>
        </div>
      </Modal>

      {/* Gas review modal */}
      <Modal isOpen={gasModal} onClose={() => setGasModal(false)} title={`Gas Allowance Review — ${p.label}`} size="lg">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Check the employees who should receive a gas allowance this week and confirm the amount. This will add a Gas Allowance adjustment to their payroll.
          </p>
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {gasEmployees.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <input
                  type="checkbox"
                  checked={!!gasChecked[emp.id]}
                  onChange={(e) => setGasChecked((c) => ({ ...c, [emp.id]: e.target.checked }))}
                  className="accent-brand-500 w-4 h-4 shrink-0"
                />
                <span className="flex-1 text-sm font-medium text-gray-900">{emp.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    value={gasAmounts[emp.id] ?? 70}
                    onChange={(e) => setGasAmounts((a) => ({ ...a, [emp.id]: e.target.value }))}
                    disabled={!gasChecked[emp.id]}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right outline-none focus:border-brand-500 disabled:opacity-40"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-brand-100 rounded-xl px-4 py-3 text-sm text-brand-900 font-medium">
            Total gas this period: {formatCurrency(
              gasEmployees
                .filter((e) => gasChecked[e.id])
                .reduce((s, e) => s + (parseFloat(gasAmounts[e.id]) || 0), 0)
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setGasModal(false)}>Cancel</Button>
            <Button fullWidth loading={gasSaving} onClick={handleApplyGas}>
              Apply Gas Allowances
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
