import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../utils/format'
import { format } from 'date-fns'
import { registerChecks } from '../../api/checks'

// ── Amount → words ────────────────────────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function below1000(n) {
  if (n === 0) return ''
  if (n < 20)  return ONES[n] + ' '
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '') + ' '
  return ONES[Math.floor(n / 100)] + ' Hundred ' + below1000(n % 100)
}

function amountToWords(amount) {
  const dollars = Math.floor(amount)
  const cents   = Math.round((amount - dollars) * 100)
  let words = ''
  if (dollars >= 1000000) words += below1000(Math.floor(dollars / 1000000)) + 'Million '
  if (dollars >= 1000)    words += below1000(Math.floor((dollars % 1000000) / 1000)) + 'Thousand '
  words += below1000(dollars % 1000)
  words = words.trim() || 'Zero'
  return `${words} and ${String(cents).padStart(2, '0')}/100`
}

// ── Check field positions ─────────────────────────────────────────────────
// Calibrated to Contractor_Check_Template.key / Employee_1099_Check_Template.key
// Positions are from the physical paper edge (top-left corner).
const CHECK = {
  date:     { top: '1.104in', right: '0.771in' },  // date field
  checkNum: { top: '1.38in',  right: '0.771in' },  // check number, below date
  payTo:    { top: '1.615in', left:  '1.312in' },  // "Pay to the order of" name line
  dollarAmt:{ top: '1.594in', right: '0.771in' },  // $ amount box
  words:    { top: '1.885in', left:  '1.312in' },  // written-out amount line
  memo:     { top: '2.500in', left:  '1.417in' },  // memo / for line
}

// Section cut points (inches from paper top)
const SEC = { check: 3.44, stub: 7.22 }

// ── Cut / tear line ───────────────────────────────────────────────────────
function CutLine({ topIn, label }) {
  return (
    <div style={{
      position: 'absolute', top: `${topIn}in`, left: 0, right: 0, zIndex: 2,
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <div style={{ flex: 1, borderTop: '1pt dashed #94a3b8' }} />
      <span className="no-print" style={{
        fontSize: '7pt', color: '#94a3b8', fontFamily: 'Arial, sans-serif',
        letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        ✂ {label}
      </span>
      <div style={{ flex: 1, borderTop: '1pt dashed #94a3b8' }} />
    </div>
  )
}

// ── Earnings Statement styles — matches Check_Templates color scheme ──────
const ES = {
  headerBg:  '#6b7fa5',   // steel blue from Keynote template
  headerTxt: '#ffffff',
  accent:    '#4a5f82',   // darker blue for text accents
  border:    '#a8bad0',   // light blue-gray border
  footerBg:  '#eef1f6',   // very light blue-gray footer background
  font:      'Arial, "Helvetica Neue", sans-serif',
}
const esH = (extra = {}) => ({
  background: ES.headerBg, color: ES.headerTxt,
  fontFamily: ES.font, fontSize: '7pt', fontWeight: 700,
  padding: '3pt 5pt', border: `0.5pt solid ${ES.border}`,
  textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center',
  ...extra,
})
const esC = (extra = {}) => ({
  fontFamily: ES.font, fontSize: '8pt', color: '#333',
  padding: '3pt 6pt', border: `0.5pt solid ${ES.border}`,
  verticalAlign: 'middle', ...extra,
})

// ── Earnings Statement (employee & employer copies) ───────────────────────
function EarningsStatement({ emp, periodStart, periodEnd, checkDate, gas, bonus, loanDed, netPay }) {
  const isSalary = (emp.pay_structure ?? 'hourly') === 'salary'
  const isW2     = emp.pay_type === 'w2'
  const rate     = parseFloat(emp.pay_rate     ?? 0)
  const otRate   = parseFloat(emp.overtime_rate ?? rate * 1.5)
  const regHrs   = parseFloat(emp.regular_hours  ?? 0)
  const otHrs    = parseFloat(emp.overtime_hours ?? 0)
  const basePay  = parseFloat(emp.base_gross ?? 0)

  const fmtPeriod = (() => {
    try {
      return `${format(new Date(periodStart + 'T12:00'), 'MM/dd/yy')} – ${format(new Date(periodEnd + 'T12:00'), 'MM/dd/yy')}`
    } catch { return `${periodStart} – ${periodEnd}` }
  })()

  const earningsRows = []
  if (isSalary) {
    const wks = emp.weeks_worked ?? 1
    earningsRows.push({ label: `Weekly Salary${wks > 1 ? ` ×${wks}` : ''}`, rate: formatCurrency(rate), hours: '—', total: basePay })
  } else if (isW2) {
    earningsRows.push({ label: 'Regular Earnings', rate: `${formatCurrency(rate)}/hr`, hours: regHrs.toFixed(2), total: regHrs * rate })
    if (otHrs > 0)
      earningsRows.push({ label: 'Overtime Pay (1.5×)', rate: `${formatCurrency(otRate)}/hr`, hours: otHrs.toFixed(2), total: otHrs * otRate, ot: true })
  } else {
    earningsRows.push({ label: 'Contract Pay', rate: `${formatCurrency(rate)}/hr`, hours: (regHrs + otHrs).toFixed(2), total: basePay })
  }

  const adjRows = []
  if (gas > 0)     adjRows.push({ label: 'Gas Allowance',      amount: gas,     sign: '+', red: false })
  if (bonus > 0)   adjRows.push({ label: 'Bonus / Adjustment', amount: bonus,   sign: '+', red: false })
  if (loanDed > 0) adjRows.push({ label: 'Loan Deduction',     amount: loanDed, sign: '−', red: true  })

  const bodyRows = Math.max(earningsRows.length, adjRows.length, 2)

  return (
    <div style={{ fontFamily: ES.font, display: 'flex', flexDirection: 'column', gap: '5pt' }}>

      {/* Employee / Contractor info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '38%' }) }}>{isW2 ? 'Employee' : 'Contractor'}</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Date</th>
            <th style={{ ...esH({ width: '30%' }) }}>Pay Period</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Schedule</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', verticalAlign: 'top', padding: '5pt 6pt' }) }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '9pt', color: ES.accent }}>{emp.name}</p>
              <p style={{ margin: '1pt 0 0', fontSize: '7pt', color: '#666' }}>{isW2 ? 'W-2 Employee' : '1099 Contractor'}</p>
            </td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{checkDate}</td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{fmtPeriod}</td>
            <td style={{ ...esC({ textAlign: 'center', fontWeight: 700 }) }}>Weekly</td>
          </tr>
        </tbody>
      </table>

      {/* Earnings + Additions/Deductions table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', paddingLeft: '6pt', width: '29%' }) }}>Earnings</th>
            <th style={{ ...esH({ width: '16%' }) }}>Rate</th>
            <th style={{ ...esH({ width: '10%' }) }}>Hours</th>
            <th style={{ ...esH({ textAlign: 'right', paddingRight: '6pt', width: '13%' }) }}>Total</th>
            <th style={{ ...esH({ textAlign: 'left', paddingLeft: '6pt', width: '20%', borderLeft: `1pt solid #8a7318` }) }}>Additions / Deductions</th>
            <th style={{ ...esH({ textAlign: 'right', paddingRight: '6pt', width: '12%' }) }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: bodyRows }, (_, i) => {
            const er  = earningsRows[i]
            const adj = adjRows[i]
            return (
              <tr key={i} style={{ borderBottom: `0.5pt solid ${ES.border}`, background: i % 2 ? '#fdf9ee' : '#fff' }}>
                <td style={{ ...esC({ textAlign: 'left', paddingLeft: '6pt', color: er?.ot ? '#92400e' : '#222', fontWeight: er?.ot ? 600 : 400 })}}>
                  {er?.label ?? ''}
                </td>
                <td style={{ ...esC({ textAlign: 'center', color: '#555', fontSize: '7.5pt' })}}>
                  {er?.rate ?? ''}
                </td>
                <td style={{ ...esC({ textAlign: 'center' })}}>
                  {er?.hours ?? ''}
                </td>
                <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: er ? 600 : 400 })}}>
                  {er ? formatCurrency(er.total) : ''}
                </td>
                <td style={{ ...esC({ textAlign: 'left', paddingLeft: '6pt', borderLeft: `0.5pt solid ${ES.border}`, color: adj?.red ? '#991b1b' : '#166534' })}}>
                  {adj?.label ?? ''}
                </td>
                <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: adj ? 600 : 400, color: adj?.red ? '#991b1b' : '#166534' })}}>
                  {adj ? `${adj.sign}${formatCurrency(adj.amount)}` : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: ES.footerBg, borderTop: `1pt solid ${ES.border}` }}>
            <td colSpan={3} style={{ ...esC({ fontWeight: 700, textAlign: 'left', paddingLeft: '6pt', color: ES.accent, background: ES.footerBg }) }}>Gross Pay</td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 700, color: ES.accent, background: ES.footerBg }) }}>
              {formatCurrency(basePay)}
            </td>
            <td style={{ ...esC({ fontWeight: 700, textAlign: 'left', paddingLeft: '6pt', borderLeft: `0.5pt solid ${ES.border}`, color: '#1e40af', background: ES.footerBg }) }}>
              Net Pay
            </td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 700, color: '#1e40af', background: ES.footerBg }) }}>
              {formatCurrency(netPay)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Flat rate earnings statement ──────────────────────────────────────────
function FlatRateEarningsStatement({ fr, checkDate, periodStart, periodEnd }) {
  const amount = parseFloat(fr.amount)
  const fmtPeriod = (() => {
    try {
      return `${format(new Date(periodStart + 'T12:00'), 'MM/dd/yy')} – ${format(new Date(periodEnd + 'T12:00'), 'MM/dd/yy')}`
    } catch { return `${periodStart} – ${periodEnd}` }
  })()
  return (
    <div style={{ fontFamily: ES.font, display: 'flex', flexDirection: 'column', gap: '5pt' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '38%' }) }}>Contractor</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Date</th>
            <th style={{ ...esH({ width: '30%' }) }}>Pay Period</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Schedule</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', verticalAlign: 'top', padding: '5pt 6pt' }) }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '9pt', color: ES.accent }}>{fr.user_name}</p>
              <p style={{ margin: '1pt 0 0', fontSize: '7pt', color: '#666' }}>1099 Contractor</p>
            </td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{checkDate}</td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{fmtPeriod}</td>
            <td style={{ ...esC({ textAlign: 'center', fontWeight: 700 }) }}>Weekly</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', paddingLeft: '6pt', width: '70%' }) }}>Description</th>
            <th style={{ ...esH({ textAlign: 'right', paddingRight: '6pt', width: '30%' }) }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', paddingLeft: '6pt', fontWeight: 500 }) }}>{fr.description}</td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 600 }) }}>{formatCurrency(amount)}</td>
          </tr>
          {[0, 1].map(i => (
            <tr key={i} style={{ background: '#fdf9ee' }}>
              <td style={{ ...esC({ paddingLeft: '6pt' }) }}>&nbsp;</td>
              <td style={esC()}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: ES.footerBg, borderTop: `1pt solid ${ES.border}` }}>
            <td style={{ ...esC({ fontWeight: 700, textAlign: 'left', paddingLeft: '6pt', color: '#1e40af', background: ES.footerBg }) }}>Net Pay</td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 700, color: '#1e40af', background: ES.footerBg }) }}>{formatCurrency(amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Flat rate check page ──────────────────────────────────────────────────
function FlatRateCheckPage({ fr, today, periodStart, periodEnd, checkNum }) {
  const amount = parseFloat(fr.amount)
  return (
    <div className="check-page" style={{
      width: '8.5in', height: '11in', position: 'relative',
      background: '#fff', boxShadow: '0 6px 32px rgba(0,0,0,0.18)',
      flexShrink: 0,
    }}>
      {/* Screen-only overlays */}
      <div className="no-print" style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: `${SEC.check}in`, background: 'rgba(99,102,241,0.05)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 5, left: 10, fontSize: 8, color: '#a5b4fc', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Check — pre-printed on stock
        </span>
      </div>
      <div className="no-print" style={{
        position: 'absolute', top: `${SEC.check}in`, left: 0, right: 0,
        height: `${SEC.stub - SEC.check}in`, background: 'rgba(16,185,129,0.04)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#6ee7b7', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Employee Copy — Flat Rate
        </span>
      </div>
      <div className="no-print" style={{
        position: 'absolute', top: `${SEC.stub}in`, left: 0, right: 0, bottom: 0,
        background: 'rgba(59,130,246,0.04)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#93c5fd', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Employer Copy
        </span>
      </div>

      <CutLine topIn={SEC.check} label="Detach — Employee Copy" />
      <CutLine topIn={SEC.stub}  label="Detach — Employer Copy" />

      {/* Check fields */}
      <div style={{ position: 'absolute', top: CHECK.date.top, right: CHECK.date.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000' }}>{today}</div>
      {checkNum && <div style={{ position: 'absolute', top: CHECK.checkNum.top, right: CHECK.checkNum.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000' }}>{checkNum}</div>}
      <div style={{ position: 'absolute', top: CHECK.payTo.top, left: CHECK.payTo.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 600, color: '#000', maxWidth: '4.7in', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fr.user_name}</div>
      <div style={{ position: 'absolute', top: CHECK.dollarAmt.top, right: CHECK.dollarAmt.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000', letterSpacing: '0.04em' }}>{formatCurrency(amount).replace('$', '')}</div>
      <div style={{ position: 'absolute', top: CHECK.words.top, left: CHECK.words.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000', maxWidth: '6.1in', overflow: 'hidden', whiteSpace: 'nowrap' }}>{amountToWords(amount)}</div>
      <div style={{ position: 'absolute', top: CHECK.memo.top, left: CHECK.memo.left, fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000' }}>{fr.user_name}</div>

      {/* Employee copy (middle) */}
      <div style={{ position: 'absolute', top: `${SEC.check + 0.35}in`, bottom: `${11 - SEC.stub + 0.3}in`, left: '0.75in', right: '0.75in' }}>
        <FlatRateEarningsStatement fr={fr} checkDate={today}
          periodStart={periodStart} periodEnd={periodEnd} />
      </div>

      {/* Employer copy (bottom) */}
      <div style={{ position: 'absolute', top: `${SEC.stub + 0.35}in`, bottom: '0.5in', left: '0.75in', right: '0.75in' }}>
        <FlatRateEarningsStatement fr={fr} checkDate={today}
          periodStart={periodStart} periodEnd={periodEnd} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function PrintChecks({ employees, flatRatePayments = [], period, gasByUser, bonusByUser, loanDeductions, onClose }) {
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-checks-css'
    style.textContent = `
      @media print {
        @page { size: 8.5in 11in; margin: 0; }
        body > *:not(#print-checks-root) { display: none !important; }
        #print-checks-root { display: block !important; position: static !important; overflow: visible !important; }
        .no-print { display: none !important; }
        .check-page { page-break-after: always; break-after: page; }
        .check-page:last-child { page-break-after: avoid; break-after: avoid; }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-checks-css')?.remove()
  }, [])

  const [checkNums, setCheckNums] = useState({})
  const [regSaving, setRegSaving] = useState(false)
  const [regStatus, setRegStatus] = useState(null) // null | 'saved' | 'error'

  // Default check date to the Friday of the pay period week (period.end is Sunday → subtract 2 days)
  const defaultFriday = (() => {
    try {
      const sun = new Date(period.end + 'T12:00')
      return new Date(sun.getTime() - 2 * 86400000)
    } catch { return new Date() }
  })()
  const [checkDateISO, setCheckDateISO] = useState(format(defaultFriday, 'yyyy-MM-dd'))

  const today      = (() => { try { return format(new Date(checkDateISO + 'T12:00'), 'MM/dd/yyyy') } catch { return checkDateISO } })()
  const issuedDate = checkDateISO

  // Flat list of all payees
  const allPayees = [
    ...employees.map(e => ({ key: `u-${e.user_id}`, name: e.name, amount: e.estimated_total ?? 0, user_id: e.user_id })),
    ...flatRatePayments.map(fr => ({ key: `fr-${fr.id}`, name: fr.user_name, amount: parseFloat(fr.amount), user_id: null })),
  ]

  // Selection — all checked by default
  const [selected, setSelected] = useState(() => new Set(allPayees.map(p => p.key)))
  const toggleSelect = (key) => setSelected(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const allSelected  = selected.size === allPayees.length
  const noneSelected = selected.size === 0

  const selectedPayees = allPayees.filter(p => selected.has(p.key))
  const selectedCount  = selectedPayees.length

  const handleRegister = async () => {
    setRegSaving(true)
    setRegStatus(null)
    try {
      const toSave = selectedPayees
        .filter(p => checkNums[p.key]?.trim())
        .map(p => ({
          check_number:     checkNums[p.key].trim(),
          payee_name:       p.name,
          user_id:          p.user_id,
          amount:           p.amount,
          pay_period_start: period.start,
          pay_period_end:   period.end,
          issued_date:      issuedDate,
        }))
      if (!toSave.length) { setRegSaving(false); return }
      await registerChecks(toSave)
      setRegStatus('saved')
    } catch {
      setRegStatus('error')
    } finally {
      setRegSaving(false)
    }
  }

  return createPortal(
    <div id="print-checks-root"
      style={{ position: 'fixed', inset: 0, background: '#d1d5db', zIndex: 9999, overflowY: 'auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#0f172a', color: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>
            Print Checks — {period.label}
          </p>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
            {selectedCount} of {allPayees.length} selected&ensp;·&ensp;Load check stock before printing
          </p>
        </div>

        {/* Editable check date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
          <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Check Date
          </label>
          <input
            type="date"
            value={checkDateISO}
            onChange={e => setCheckDateISO(e.target.value)}
            style={{
              background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
              padding: '5px 10px', fontSize: 13, color: '#f1f5f9',
              outline: 'none', cursor: 'pointer',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #334155',
            color: '#cbd5e1', background: 'transparent', cursor: 'pointer', fontSize: 13,
          }}>
            ← Back
          </button>
          <button onClick={() => window.print()} disabled={noneSelected} style={{
            padding: '8px 20px', borderRadius: 8,
            background: noneSelected ? '#374151' : '#6366f1',
            color: noneSelected ? '#6b7280' : '#fff',
            border: 'none', cursor: noneSelected ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 13,
          }}>
            Print Selected ({selectedCount})
          </button>
        </div>
      </div>

      {/* ── Instruction bar ─────────────────────────────────────── */}
      <div className="no-print" style={{
        background: '#fef3c7', borderBottom: '1px solid #fde68a',
        padding: '7px 24px', fontSize: '11.5px', color: '#92400e',
      }}>
        <strong>Sections:</strong> Check stock (top) · Employee/Contractor copy (middle) · Employer copy (bottom)
      </div>

      {/* ── Selection + check number panel (always open) ────────── */}
      <div className="no-print" style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 24px 16px' }}>

        {/* Panel header + select all/none */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Select Checks to Print
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setSelected(new Set(allPayees.map(p => p.key)))}
              disabled={allSelected}
              style={{ fontSize: 12, color: allSelected ? '#475569' : '#818cf8', background: 'none', border: 'none', cursor: allSelected ? 'default' : 'pointer', padding: 0, fontWeight: 600 }}>
              Select All
            </button>
            <button onClick={() => setSelected(new Set())}
              disabled={noneSelected}
              style={{ fontSize: 12, color: noneSelected ? '#475569' : '#f87171', background: 'none', border: 'none', cursor: noneSelected ? 'default' : 'pointer', padding: 0, fontWeight: 600 }}>
              Deselect All
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto 150px', gap: 10, marginBottom: 6, padding: '0 2px' }}>
          <span />
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Payee</span>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Amount</span>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 6 }}>Check #</span>
        </div>

        {/* Payee rows */}
        {allPayees.map(p => {
          const isSelected = selected.has(p.key)
          return (
            <div key={p.key} style={{
              display: 'grid', gridTemplateColumns: '20px 1fr auto 150px',
              gap: 10, alignItems: 'center', marginBottom: 7,
              opacity: isSelected ? 1 : 0.4, transition: 'opacity 0.15s',
            }}>
              {/* Checkbox */}
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.key)}
                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#6366f1' }} />
              <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {formatCurrency(p.amount)}
              </span>
              <input
                type="text"
                value={checkNums[p.key] ?? ''}
                onChange={e => { setCheckNums(prev => ({ ...prev, [p.key]: e.target.value })); setRegStatus(null) }}
                placeholder="Check #"
                disabled={!isSelected}
                style={{
                  background: isSelected ? '#0f172a' : '#1e293b',
                  border: `1px solid ${isSelected ? '#4f46e5' : '#1e293b'}`,
                  borderRadius: 6, padding: '5px 10px', fontSize: 13, color: '#f1f5f9',
                  outline: 'none', width: '100%', boxSizing: 'border-box',
                  cursor: isSelected ? 'text' : 'not-allowed',
                }}
              />
            </div>
          )
        })}

        {/* Save to registry footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid #334155' }}>
          <button
            onClick={handleRegister}
            disabled={regSaving || !selectedPayees.some(p => checkNums[p.key]?.trim())}
            style={{
              padding: '8px 20px', borderRadius: 8,
              background: regStatus === 'saved' ? '#16a34a' : '#6366f1',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, opacity: regSaving ? 0.7 : 1,
              transition: 'background 0.2s',
            }}>
            {regSaving ? 'Saving…' : regStatus === 'saved' ? '✓ Saved to Registry' : 'Save to Registry'}
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Saves check numbers for selected payees who have a check # entered
          </span>
          {regStatus === 'error' && (
            <span style={{ fontSize: 12, color: '#f87171' }}>Failed — check for duplicate check numbers</span>
          )}
          {regStatus === 'saved' && (
            <span style={{ fontSize: 12, color: '#4ade80' }}>Saved. View in Check Registry.</span>
          )}
        </div>
      </div>

      {/* ── Check pages ──────────────────────────────────────────── */}
      <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'center' }}>

        {noneSelected && (
          <p style={{ color: '#6b7280', padding: '80px 0', fontSize: 14 }}>
            No checks selected — check at least one payee above to preview.
          </p>
        )}

        {employees.filter(emp => selected.has(`u-${emp.user_id}`)).map((emp) => {
          const gas     = gasByUser[emp.user_id]      ?? 0
          const bonus   = bonusByUser[emp.user_id]    ?? 0
          const loanDed = loanDeductions[emp.user_id] ?? 0
          const netPay  = Math.max((emp.estimated_total ?? 0) - loanDed, 0)

          return (
            <div key={emp.user_id} className="check-page" style={{
              width: '8.5in', height: '11in', position: 'relative',
              background: '#fff', boxShadow: '0 6px 32px rgba(0,0,0,0.18)',
              flexShrink: 0,
            }}>

              {/* ── Screen-only section overlays (hidden on print) ── */}
              <div className="no-print" style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: `${SEC.check}in`, background: 'rgba(99,102,241,0.05)',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 5, left: 10, fontSize: 8, color: '#a5b4fc', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Check — pre-printed on stock
                </span>
              </div>
              <div className="no-print" style={{
                position: 'absolute', top: `${SEC.check}in`, left: 0, right: 0,
                height: `${SEC.stub - SEC.check}in`, background: 'rgba(16,185,129,0.04)',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#6ee7b7', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Employee Copy
                </span>
              </div>
              <div className="no-print" style={{
                position: 'absolute', top: `${SEC.stub}in`, left: 0, right: 0, bottom: 0,
                background: 'rgba(59,130,246,0.04)',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#93c5fd', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Employer Copy
                </span>
              </div>

              {/* ── Cut lines ────────────────────────────────────── */}
              <CutLine topIn={SEC.check} label="Detach — Employee Copy" />
              <CutLine topIn={SEC.stub}  label="Detach — Employer Copy" />

              {/* ══ CHECK FIELDS (overlay on pre-printed check stock) ══ */}

              {/* Date */}
              <div style={{
                position: 'absolute', top: CHECK.date.top, right: CHECK.date.right,
                fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
              }}>{today}</div>

              {/* Check number (below date) */}
              {checkNums[`u-${emp.user_id}`] && (
                <div style={{
                  position: 'absolute', top: CHECK.checkNum.top, right: CHECK.checkNum.right,
                  fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000',
                }}>{checkNums[`u-${emp.user_id}`]}</div>
              )}

              {/* Pay To name */}
              <div style={{
                position: 'absolute', top: CHECK.payTo.top, left: CHECK.payTo.left,
                fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                fontWeight: 600, color: '#000',
                maxWidth: '4.7in', overflow: 'hidden', whiteSpace: 'nowrap',
              }}>{emp.name}</div>

              {/* $ amount (numeric, no $ sign — pre-printed on stock) */}
              <div style={{
                position: 'absolute', top: CHECK.dollarAmt.top, right: CHECK.dollarAmt.right,
                fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                fontWeight: 700, color: '#000', letterSpacing: '0.04em',
              }}>{formatCurrency(netPay).replace('$', '')}</div>

              {/* Amount in words */}
              <div style={{
                position: 'absolute', top: CHECK.words.top, left: CHECK.words.left,
                fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
                maxWidth: '6.1in', overflow: 'hidden', whiteSpace: 'nowrap',
              }}>{amountToWords(netPay)}</div>

              {/* Memo — employee name so it shows through envelope window */}
              <div style={{
                position: 'absolute', top: CHECK.memo.top, left: CHECK.memo.left,
                fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
              }}>{emp.name}</div>

              {/* ══ EMPLOYEE COPY (section 2 — middle) ══ */}
              <div style={{
                position: 'absolute',
                top: `${SEC.check + 0.35}in`,
                bottom: `${11 - SEC.stub + 0.3}in`,
                left: '0.75in', right: '0.75in',
              }}>
                <EarningsStatement
                  emp={emp} periodStart={period.start} periodEnd={period.end}
                  checkDate={today}
                  gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay}
                />
              </div>

              {/* ══ EMPLOYER COPY (section 3 — bottom) ══ */}
              <div style={{
                position: 'absolute',
                top: `${SEC.stub + 0.35}in`,
                bottom: '0.5in',
                left: '0.75in', right: '0.75in',
              }}>
                <EarningsStatement
                  emp={emp} periodStart={period.start} periodEnd={period.end}
                  checkDate={today}
                  gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay}
                />
              </div>

            </div>
          )
        })}

        {/* Flat rate check pages */}
        {flatRatePayments.filter(fr => selected.has(`fr-${fr.id}`)).map((fr) => (
          <FlatRateCheckPage key={`fr-${fr.id}`} fr={fr} today={today}
            periodStart={period.start} periodEnd={period.end}
            checkNum={checkNums[`fr-${fr.id}`] ?? ''} />
        ))}
      </div>
    </div>,
    document.body
  )
}
