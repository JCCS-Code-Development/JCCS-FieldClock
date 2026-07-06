import { formatCurrency } from '../../utils/format'

const SIZE = 220
const CX   = SIZE / 2
const CY   = SIZE / 2
const R    = 88
const HOLE = 56

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(startDeg, sweepDeg) {
  if (sweepDeg >= 360) sweepDeg = 359.9999
  const endDeg = startDeg + sweepDeg
  const o1 = polar(CX, CY, R,    startDeg)
  const o2 = polar(CX, CY, R,    endDeg)
  const i1 = polar(CX, CY, HOLE, endDeg)
  const i2 = polar(CX, CY, HOLE, startDeg)
  const lg = sweepDeg > 180 ? 1 : 0
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${R} ${R} 0 ${lg} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${HOLE} ${HOLE} 0 ${lg} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ')
}

const SLICES = [
  { key: 'base',  label: 'Base Pay',       color: '#6366f1' },
  { key: 'gas',   label: 'Gas Allowance',  color: '#f59e0b' },
  { key: 'bonus', label: 'Bonus / Adj.',   color: '#22c55e' },
  { key: 'loan',  label: 'Loan Deduction', color: '#ef4444' },
]

export default function PayPieChart({ base = 0, gas = 0, bonus = 0, loan = 0, compact = false }) {
  const values   = { base, gas, bonus, loan }
  const total    = base + gas + bonus + loan
  const netPay   = Math.max(base + gas + bonus - loan, 0)

  if (total <= 0) return null

  // Build slices with start angle
  let cursor = 0
  const slices = SLICES
    .map((s) => ({ ...s, value: values[s.key] }))
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / total) * 360
      const path  = arcPath(cursor, sweep)
      const pct   = ((s.value / total) * 100).toFixed(1)
      cursor += sweep
      return { ...s, sweep, path, pct }
    })

  const chartSize = compact ? 160 : SIZE
  const _scale    = chartSize / SIZE

  return (
    <div className={`flex ${compact ? 'flex-col items-center gap-3' : 'flex-col gap-4'} w-full`}>
      {/* Donut */}
      <div className="flex justify-center">
        <div style={{ position: 'relative', width: chartSize, height: chartSize }}>
          <svg
            width={chartSize}
            height={chartSize}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
          >
            {slices.map((s) => (
              <path
                key={s.key}
                d={s.path}
                fill={s.color}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </svg>

          {/* Center label */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}>
            <p style={{
              fontSize: compact ? 11 : 10,
              color: '#9ca3af',
              fontFamily: 'sans-serif',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: 1,
            }}>Net Pay</p>
            <p style={{
              fontSize: compact ? 14 : 16,
              fontWeight: 700,
              color: '#111827',
              fontFamily: 'sans-serif',
              marginTop: 4,
              lineHeight: 1,
            }}>{formatCurrency(netPay)}</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className={`grid ${compact ? 'grid-cols-1 w-full' : 'grid-cols-2'} gap-x-6 gap-y-2`}>
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 truncate">{s.label}</span>
                <span className="text-xs font-semibold text-gray-700 flex-shrink-0">{s.pct}%</span>
              </div>
              <p className="text-xs text-gray-400">{formatCurrency(s.value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
