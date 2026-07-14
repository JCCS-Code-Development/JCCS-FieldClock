import { useState } from 'react'
import PageHeader from '../../components/admin/PageHeader'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { getLaborCost } from '../../api/reports'
import { formatCurrency, formatHours } from '../../utils/format'
import { format, subDays } from 'date-fns'

const COST_LABELS = {
  travel: 'Travel', direct_labor: 'Direct Labor', paid_lunch: 'Paid Lunch',
  waiting_time: 'Waiting', material_pickup: 'Material Run',
  admin_photos: 'Admin/Photos', rework: 'Rework',
}

const VISIT_TYPE_LABELS = {
  // current categories
  work_order: 'Work Order', estimate: 'Estimate', regular: 'Regular',
  estimate_unknown: 'Estimate (# unknown)', add_on: 'Add-On',
  emergency: 'Emergency', warranty: 'Warranty', unspecified: 'Unspecified',
  // retained for entries logged before this restructure
  new_work_order: 'New Work Order (legacy)', other: 'Other (legacy)',
}

export default function AdminReports() {
  const [groupBy, setGroupBy] = useState('job')
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const runReport = () => {
    setLoading(true)
    getLaborCost({ start: dateFrom, end: dateTo, group_by: groupBy })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const rows = data?.rows ?? []
  const totals = data?.totals ?? {}

  return (
    <div className="w-full">
      <PageHeader title="Labor Cost Reports" subtitle="True labor cost by job, employee, or category" />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Group By</label>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[['job', 'By Job'], ['employee', 'By Employee'], ['visit_type', 'By Visit Type']].map(([val, label]) => (
              <button key={val} onClick={() => setGroupBy(val)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${groupBy === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <Button onClick={runReport} loading={loading}>Run Report</Button>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

      {!loading && data && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="text-left px-5 py-3">{groupBy.replace('_', ' ')}</th>
                {Object.keys(COST_LABELS).map((cat) => (
                  <th key={cat} className="text-right px-3 py-3 whitespace-nowrap">{COST_LABELS[cat]}</th>
                ))}
                <th className="text-right px-4 py-3">Total Hrs</th>
                <th className="text-right px-5 py-3">Labor Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={Object.keys(COST_LABELS).length + 3} className="text-center py-12 text-gray-400">No data for this range.</td></tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {groupBy === 'visit_type' ? (VISIT_TYPE_LABELS[row.label] ?? row.label) : row.label}
                  </td>
                  {Object.keys(COST_LABELS).map((cat) => (
                    <td key={cat} className="px-3 py-3 text-right text-gray-500 text-xs">
                      {row.categories?.[cat] ? formatHours(row.categories[cat]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-medium">{formatHours(row.total_hours ?? 0)}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(row.labor_cost ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-brand-50 font-semibold text-sm">
                <tr>
                  <td className="px-5 py-3 text-brand-900">Totals</td>
                  {Object.keys(COST_LABELS).map((cat) => (
                    <td key={cat} className="px-3 py-3 text-right text-brand-700 text-xs">
                      {totals.categories?.[cat] ? formatHours(totals.categories[cat]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-brand-700">{formatHours(totals.total_hours ?? 0)}</td>
                  <td className="px-5 py-3 text-right text-brand-500 text-base">{formatCurrency(totals.labor_cost ?? 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!loading && !data && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Select a date range and click Run Report.
        </div>
      )}
    </div>
  )
}
