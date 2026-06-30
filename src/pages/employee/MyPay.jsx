import { useState, useEffect } from 'react'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { getMyPay } from '../../api/payroll'
import { formatCurrency, formatHours } from '../../utils/format'
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'

const periods = Array.from({ length: 4 }, (_, i) => {
  const now = new Date()
  const start = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
  const end = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
  return {
    label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  }
})

export default function MyPay() {
  const [selectedPeriod, setSelectedPeriod] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const p = periods[selectedPeriod]
    getMyPay({ start: p.start, end: p.end })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [selectedPeriod])

  return (
    <div className="px-4 pt-6 pb-6 flex flex-col gap-4 w-full">
      <h1 className="text-xl font-bold text-gray-900">My Pay</h1>

      {/* Period selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {periods.map((p, i) => (
          <button
            key={i}
            onClick={() => setSelectedPeriod(i)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              selectedPeriod === i
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !data ? (
        <p className="text-center text-gray-400 py-12 text-sm">No pay data for this period.</p>
      ) : (
        <>
          <Card title="Hours Summary">
            <div className="flex flex-col gap-3">
              <Row label="Approved Hours" value={formatHours(data.approved_hours ?? 0)} />
              {data.pay_type === 'w2' && (
                <>
                  <Row label="Regular Hours" value={formatHours(data.regular_hours ?? 0)} />
                  {(data.overtime_hours ?? 0) > 0 && (
                    <Row label="Overtime Hours" value={formatHours(data.overtime_hours)} accent />
                  )}
                </>
              )}
            </div>
          </Card>

          <Card title="Pay Breakdown">
            <div className="flex flex-col gap-3">
              <Row label="Base Pay" value={formatCurrency(data.base_pay ?? 0)} />
              {(data.gas_allowance ?? 0) > 0 && (
                <Row label="Gas Allowance" value={formatCurrency(data.gas_allowance)} />
              )}
              {data.adjustments?.map((adj, i) => (
                <Row
                  key={i}
                  label={adj.type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  value={formatCurrency(adj.amount)}
                  note={adj.description}
                />
              ))}
              <div className="border-t border-gray-100 pt-3 mt-1">
                <Row
                  label={data.approval_status === 'approved' ? 'Total Pay' : 'Estimated Total'}
                  value={formatCurrency(data.estimated_total ?? 0)}
                  bold
                />
                {data.approval_status !== 'approved' && (
                  <p className="text-xs text-gray-400 mt-1">Pending admin approval</p>
                )}
              </div>
            </div>
          </Card>

          {data.pay_type === '1099' && (
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
              💼 1099 Contractor — weekly check issued after approval
            </div>
          )}
          {data.pay_type === 'w2' && (
            <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-700">
              🏦 W-2 Employee — payroll processed through ADP
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Row({ label, value, accent, bold, note }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className={`text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {label}
        </span>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <span className={`text-sm font-semibold ${bold ? 'text-gray-900' : accent ? 'text-amber-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}
