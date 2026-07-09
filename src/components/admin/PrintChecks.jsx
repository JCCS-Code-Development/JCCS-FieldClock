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
// Calibrated from Cheque_Luz_Hernandez_Y2026_W27.pptx
// Slide = 7.5"×10" (letter, 0.5" margins). @page margin:0 → add 0.5" to all slide coords.
// Positions are from the physical paper edge (top-left corner).
const CHECK = {
  date:     { top: '1.104in', right: '0.771in' },  // date field — right edge at 7.729" from left
  payTo:    { top: '1.615in', left:  '1.312in' },  // "Pay to the order of" name line
  dollarAmt:{ top: '1.594in', right: '0.771in' },  // $ amount box — same right alignment as date
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

// ── Earnings Statement styles ─────────────────────────────────────────────
const ES = {
  headerBg:  '#b5a642',
  headerTxt: '#ffffff',
  accent:    '#7a6920',
  border:    '#c8b870',
  footerBg:  '#f0e9d0',
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
function EarningsStatement({ emp, periodStart, periodEnd, checkDate, checkNum, gas, bonus, loanDed, netPay, copyLabel }) {
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

      {/* Company / statement header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '11pt', color: ES.accent, fontFamily: ES.font }}>JCCS Services LLC</p>
          <p style={{ margin: '1pt 0 0', fontSize: '7.5pt', color: '#888', fontFamily: ES.font }}>Miami, FL</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '10.5pt', color: '#222', fontFamily: ES.font }}>Earnings Statement</p>
          <p style={{ margin: '2pt 0 0', fontSize: '8pt', color: '#555', fontFamily: ES.font }}>
            Check Number:&nbsp;<strong>{checkNum || '___________'}</strong>
          </p>
          <p style={{ margin: '3pt 0 0', fontSize: '6.5pt', color: '#aaa', fontFamily: ES.font, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{copyLabel}</p>
        </div>
      </div>

      {/* Employee info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '38%' }) }}>Employee Information</th>
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
function FlatRateEarningsStatement({ fr, checkDate, checkNum, periodStart, periodEnd, copyLabel }) {
  const amount = parseFloat(fr.amount)
  const fmtPeriod = (() => {
    try {
      return `${format(new Date(periodStart + 'T12:00'), 'MM/dd/yy')} – ${format(new Date(periodEnd + 'T12:00'), 'MM/dd/yy')}`
    } catch { return `${periodStart} – ${periodEnd}` }
  })()
  return (
    <div style={{ fontFamily: ES.font, display: 'flex', flexDirection: 'column', gap: '5pt' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '11pt', color: ES.accent, fontFamily: ES.font }}>JCCS Services LLC</p>
          <p style={{ margin: '1pt 0 0', fontSize: '7.5pt', color: '#888', fontFamily: ES.font }}>Miami, FL</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '10.5pt', color: '#222', fontFamily: ES.font }}>Earnings Statement</p>
          <p style={{ margin: '2pt 0 0', fontSize: '8pt', color: '#555', fontFamily: ES.font }}>
            Check Number:&nbsp;<strong>{checkNum || '___________'}</strong>
          </p>
          <p style={{ margin: '3pt 0 0', fontSize: '6.5pt', color: '#aaa', fontFamily: ES.font, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{copyLabel}</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '38%' }) }}>Payee Information</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Date</th>
            <th style={{ ...esH({ width: '30%' }) }}>Pay Period</th>
            <th style={{ ...esH({ width: '16%' }) }}>Type</th>
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
            <td style={{ ...esC({ textAlign: 'center', fontWeight: 700 }) }}>Flat Rate</td>
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
      <div style={{ position: 'absolute', top: CHECK.payTo.top, left: CHECK.payTo.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 600, color: '#000', maxWidth: '4.7in', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fr.user_name}</div>
      <div style={{ position: 'absolute', top: CHECK.dollarAmt.top, right: CHECK.dollarAmt.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000', letterSpacing: '0.04em' }}>{formatCurrency(amount).replace('$', '')}</div>
      <div style={{ position: 'absolute', top: CHECK.words.top, left: CHECK.words.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000', maxWidth: '6.1in', overflow: 'hidden', whiteSpace: 'nowrap' }}>{amountToWords(amount)}</div>
      <div style={{ position: 'absolute', top: CHECK.memo.top, left: CHECK.memo.left, fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000' }}>{fr.user_name}</div>

      {/* Employee copy (middle) */}
      <div style={{ position: 'absolute', top: `${SEC.check + 0.35}in`, bottom: `${11 - SEC.stub + 0.3}in`, left: '0.75in', right: '0.75in' }}>
        <FlatRateEarningsStatement fr={fr} checkDate={today} checkNum={checkNum}
          periodStart={periodStart} periodEnd={periodEnd} copyLabel="Employee Copy" />
      </div>

      {/* Employer copy (bottom) */}
      <div style={{ position: 'absolute', top: `${SEC.stub + 0.35}in`, bottom: '0.5in', left: '0.75in', right: '0.75in' }}>
        <FlatRateEarningsStatement fr={fr} checkDate={today} checkNum={checkNum}
          periodStart={periodStart} periodEnd={periodEnd} copyLabel="Employer Copy" />
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

  const [checkNums, setCheckNums]       = useState({})
  const [regOpen, setRegOpen]           = useState(false)
  const [regSaving, setRegSaving]       = useState(false)
  const [regStatus, setRegStatus]       = useState(null) // null | 'saved' | 'error'

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
  const periodLabel = (() => {
    try {
      return `${format(new Date(period.start + 'T12:00'), 'MM/dd/yyyy')} – ${format(new Date(period.end + 'T12:00'), 'MM/dd/yyyy')}`
    } catch { return period.label }
  })()
  const totalChecks = employees.length + flatRatePayments.length

  // Flat list of all checks for the registration panel
  const allPayees = [
    ...employees.map(e => ({ key: `u-${e.user_id}`, name: e.name, amount: e.estimated_total ?? 0, user_id: e.user_id })),
    ...flatRatePayments.map(fr => ({ key: `fr-${fr.id}`, name: fr.user_name, amount: parseFloat(fr.amount), user_id: null })),
  ]

  const handleRegister = async () => {
    setRegSaving(true)
    setRegStatus(null)
    try {
      const toSave = allPayees
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
        padding: '12px 24px', gap: 16,
      }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>
            Print Checks — {period.label}
          </p>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
            {totalChecks} check{totalChecks !== 1 ? 's' : ''}&ensp;·&ensp;Load check stock before printing
            {flatRatePayments.length > 0 && employees.length > 0 && ` (${employees.length} hourly + ${flatRatePayments.length} flat rate)`}
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
          <button onClick={() => window.print()} style={{
            padding: '8px 20px', borderRadius: 8, background: '#6366f1',
            color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>
            Print All ({totalChecks})
          </button>
        </div>
      </div>

      {/* ── Instruction bar ─────────────────────────────────────── */}
      <div className="no-print" style={{
        background: '#fef3c7', borderBottom: '1px solid #fde68a',
        padding: '7px 24px', fontSize: '11.5px', color: '#92400e',
        display: 'flex', gap: 20, flexWrap: 'wrap',
      }}>
        <span><strong>Sections:</strong> Check stock (top) · Employee copy (middle) · Employer copy (bottom)</span>
        <span>To fine-tune field placement, edit the <code style={{ background: '#fde68a', padding: '0 3px', borderRadius: 3 }}>CHECK</code> constants in <code style={{ background: '#fde68a', padding: '0 3px', borderRadius: 3 }}>PrintChecks.jsx</code></span>
      </div>

      {/* ── Check number registration panel ─────────────────────── */}
      <div className="no-print" style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px' }}>
        <button
          onClick={() => { setRegOpen(o => !o); setRegStatus(null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 0', width: '100%', background: 'none', border: 'none',
            color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
          <span style={{ fontSize: 16 }}>{regOpen ? '▾' : '▸'}</span>
          Register Check Numbers
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontWeight: 400 }}>
            Enter physical check numbers to track in the registry
          </span>
        </button>

        {regOpen && (
          <div style={{ paddingBottom: 16 }}>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto 140px',
              gap: 8, marginBottom: 6, padding: '0 2px',
            }}>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Payee</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Amount</span>
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 4 }}>Check #</span>
            </div>

            {allPayees.map(p => (
              <div key={p.key} style={{
                display: 'grid', gridTemplateColumns: '1fr auto 140px',
                gap: 8, alignItems: 'center', marginBottom: 6,
              }}>
                <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {formatCurrency(p.amount)}
                </span>
                <input
                  type="text"
                  value={checkNums[p.key] ?? ''}
                  onChange={e => setCheckNums(prev => ({ ...prev, [p.key]: e.target.value }))}
                  placeholder="e.g. 1042"
                  style={{
                    background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
                    padding: '5px 10px', fontSize: 13, color: '#f1f5f9',
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button
                onClick={handleRegister}
                disabled={regSaving || !allPayees.some(p => checkNums[p.key]?.trim())}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  background: regStatus === 'saved' ? '#16a34a' : '#6366f1',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, opacity: regSaving ? 0.7 : 1,
                  transition: 'background 0.2s',
                }}>
                {regSaving ? 'Saving…' : regStatus === 'saved' ? '✓ Saved to Registry' : 'Save to Registry'}
              </button>
              {regStatus === 'error' && (
                <span style={{ fontSize: 12, color: '#f87171' }}>Failed — check for duplicate check numbers</span>
              )}
              {regStatus === 'saved' && (
                <span style={{ fontSize: 12, color: '#4ade80' }}>Check numbers saved. View in Check Registry.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Check pages ──────────────────────────────────────────── */}
      <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'center' }}>

        {totalChecks === 0 && (
          <p style={{ color: '#6b7280', padding: '80px 0', fontSize: 14 }}>
            No checks to print for this period.
          </p>
        )}

        {employees.map((emp) => {
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
                  checkDate={today} checkNum={checkNums[`u-${emp.user_id}`] ?? ''}
                  gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay}
                  copyLabel="Employee Copy"
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
                  checkDate={today} checkNum={checkNums[`u-${emp.user_id}`] ?? ''}
                  gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay}
                  copyLabel="Employer Copy"
                />
              </div>

            </div>
          )
        })}

        {/* Flat rate check pages */}
        {flatRatePayments.map((fr) => (
          <FlatRateCheckPage key={`fr-${fr.id}`} fr={fr} today={today}
            periodStart={period.start} periodEnd={period.end}
            checkNum={checkNums[`fr-${fr.id}`] ?? ''} />
        ))}
      </div>
    </div>,
    document.body
  )
}
