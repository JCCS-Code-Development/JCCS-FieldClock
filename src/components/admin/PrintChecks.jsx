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

// Employee stub check-register fields (PPTX section 3 positions + 0.5" margin offset)
const STUB = {
  name:   { top: '7.365in', left:  '1.719in' },  // stub payee name
  amount: { top: '7.646in', right: '0.771in' },  // stub net pay — right-aligned with check amount
  period: { top: '7.875in', left:  '1.719in' },  // stub pay period / date
}

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

// ── Paystub earnings/deductions table ─────────────────────────────────────
function PaystubTable({ emp, gas, bonus, loanDed, netPay }) {
  const isSalary = (emp.pay_structure ?? 'hourly') === 'salary'
  const isW2     = emp.pay_type === 'w2'
  const rate     = parseFloat(emp.pay_rate     ?? 0)
  const otRate   = parseFloat(emp.overtime_rate ?? rate * 1.5)
  const regHrs   = parseFloat(emp.regular_hours  ?? 0)
  const otHrs    = parseFloat(emp.overtime_hours ?? 0)

  const rows = []
  if (isSalary) {
    const wks = emp.weeks_worked ?? 1
    rows.push({ label: `Weekly Salary${wks > 1 ? ` × ${wks} wks` : ''}`, detail: `${formatCurrency(rate)}/wk`, amount: emp.base_gross ?? 0 })
  } else if (isW2) {
    rows.push({ label: 'Regular Pay', detail: `${regHrs.toFixed(2)} hrs × ${formatCurrency(rate)}/hr`, amount: regHrs * rate })
    if (otHrs > 0)
      rows.push({ label: 'Overtime (1.5×)', detail: `${otHrs.toFixed(2)} hrs × ${formatCurrency(otRate)}/hr`, amount: otHrs * otRate, ot: true })
  } else {
    rows.push({ label: 'Gross Pay', detail: `${(regHrs + otHrs).toFixed(2)} hrs × ${formatCurrency(rate)}/hr`, amount: emp.base_gross ?? 0 })
  }

  const hasAdds = gas > 0 || bonus > 0
  const hasDeds = loanDed > 0

  const cell = (extra = {}) => ({
    padding: '2.5pt 7pt', fontSize: '8pt', fontFamily: 'Arial, sans-serif',
    borderBottom: '0.5pt solid #f0f0f0', color: '#374151', ...extra,
  })

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8f9fa' }}>
          <th style={{ ...cell({ fontWeight: 700, fontSize: '7pt', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1pt solid #e5e7eb' }), textAlign: 'left', width: '42%' }}>Description</th>
          <th style={{ ...cell({ fontWeight: 700, fontSize: '7pt', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1pt solid #e5e7eb' }), textAlign: 'left' }}>Detail</th>
          <th style={{ ...cell({ fontWeight: 700, fontSize: '7pt', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1pt solid #e5e7eb' }), textAlign: 'right', width: '22%' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...cell(), fontWeight: r.ot ? 500 : 600 }}>{r.label}</td>
            <td style={{ ...cell({ color: '#6b7280' }) }}>{r.detail}</td>
            <td style={{ ...cell({ textAlign: 'right', fontWeight: 600, color: '#111827' }) }}>{formatCurrency(r.amount)}</td>
          </tr>
        ))}

        {hasAdds && (
          <tr><td colSpan={3} style={{ ...cell({ background: '#f8f9fa', fontSize: '7pt', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2pt 7pt' }) }}>Additions</td></tr>
        )}
        {gas > 0 && (
          <tr>
            <td style={cell()}>Gas Allowance</td>
            <td style={{ ...cell({ color: '#6b7280' }) }}>{(emp.weeks_worked ?? 1) > 1 ? `${formatCurrency(parseFloat(emp.gas_weekly_allowance ?? 0))}/wk × ${emp.weeks_worked} wks` : ''}</td>
            <td style={{ ...cell({ textAlign: 'right', fontWeight: 600, color: '#166534' }) }}>+{formatCurrency(gas)}</td>
          </tr>
        )}
        {bonus > 0 && (
          <tr>
            <td style={cell()}>Bonus / Adjustment</td>
            <td style={{ ...cell({ color: '#6b7280' }) }}></td>
            <td style={{ ...cell({ textAlign: 'right', fontWeight: 600, color: '#166534' }) }}>+{formatCurrency(bonus)}</td>
          </tr>
        )}

        {hasDeds && (
          <tr><td colSpan={3} style={{ ...cell({ background: '#f8f9fa', fontSize: '7pt', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2pt 7pt' }) }}>Deductions</td></tr>
        )}
        {loanDed > 0 && (
          <tr>
            <td style={cell()}>Loan Deduction</td>
            <td style={{ ...cell({ color: '#6b7280' }) }}></td>
            <td style={{ ...cell({ textAlign: 'right', fontWeight: 600, color: '#991b1b' }) }}>−{formatCurrency(loanDed)}</td>
          </tr>
        )}

        <tr style={{ background: '#eff6ff' }}>
          <td colSpan={2} style={{ ...cell({ fontWeight: 700, fontSize: '9pt', color: '#1e40af', borderBottom: '1pt solid #bfdbfe', borderTop: '1pt solid #bfdbfe' }) }}>NET PAY</td>
          <td style={{ ...cell({ textAlign: 'right', fontWeight: 700, fontSize: '10pt', color: '#1e40af', borderBottom: '1pt solid #bfdbfe', borderTop: '1pt solid #bfdbfe' }) }}>{formatCurrency(netPay)}</td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Paystub section header ────────────────────────────────────────────────
function StubHeader({ emp, periodLabel, copyLabel, today }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      borderBottom: '1.5pt solid #e2e8f0', paddingBottom: '0.09in', marginBottom: '0.1in',
    }}>
      <div>
        <p style={{ fontSize: '9.5pt', fontWeight: 700, fontFamily: 'Arial, sans-serif', color: '#0f172a', margin: 0 }}>
          JCCS Services LLC — Pay Statement
        </p>
        <p style={{ fontSize: '8pt', fontFamily: 'Arial, sans-serif', color: '#475569', margin: '2pt 0 0' }}>
          <strong>{emp.name}</strong>
          &ensp;·&ensp;{emp.pay_type?.toUpperCase() ?? 'W-2'}
          &ensp;·&ensp;Pay Period: {periodLabel}
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{
          fontSize: '6.5pt', fontFamily: 'Arial, sans-serif', color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0,
        }}>
          {copyLabel}
        </p>
        <p style={{ fontSize: '7.5pt', fontFamily: 'Arial, sans-serif', color: '#64748b', margin: '2pt 0 0' }}>
          Check Date: {today}
        </p>
      </div>
    </div>
  )
}

// ── Flat rate paystub table (simple single-row) ───────────────────────────
function FlatRateStubTable({ fr }) {
  const cell = (extra = {}) => ({
    padding: '2.5pt 7pt', fontSize: '8pt', fontFamily: 'Arial, sans-serif',
    borderBottom: '0.5pt solid #f0f0f0', color: '#374151', ...extra,
  })
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8f9fa' }}>
          <th style={{ ...cell({ fontWeight: 700, fontSize: '7pt', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1pt solid #e5e7eb' }), textAlign: 'left' }}>Description</th>
          <th style={{ ...cell({ fontWeight: 700, fontSize: '7pt', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1pt solid #e5e7eb' }), textAlign: 'right', width: '28%' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...cell(), fontWeight: 600 }}>{fr.description}</td>
          <td style={{ ...cell({ textAlign: 'right', fontWeight: 600, color: '#111827' }) }}>{formatCurrency(parseFloat(fr.amount))}</td>
        </tr>
        <tr style={{ background: '#eff6ff' }}>
          <td style={{ ...cell({ fontWeight: 700, fontSize: '9pt', color: '#1e40af', borderBottom: '1pt solid #bfdbfe', borderTop: '1pt solid #bfdbfe' }) }}>NET PAY</td>
          <td style={{ ...cell({ textAlign: 'right', fontWeight: 700, fontSize: '10pt', color: '#1e40af', borderBottom: '1pt solid #bfdbfe', borderTop: '1pt solid #bfdbfe' }) }}>{formatCurrency(parseFloat(fr.amount))}</td>
        </tr>
      </tbody>
    </table>
  )
}

// ── Flat rate check page ──────────────────────────────────────────────────
function FlatRateCheckPage({ fr, today, periodLabel }) {
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
        height: `${SEC.stub - SEC.check}in`, background: 'rgba(245,158,11,0.04)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#fcd34d', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Employer Copy — Flat Rate
        </span>
      </div>
      <div className="no-print" style={{
        position: 'absolute', top: `${SEC.stub}in`, left: 0, right: 0, bottom: 0,
        background: 'rgba(59,130,246,0.04)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#93c5fd', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Employee Copy
        </span>
      </div>

      <CutLine topIn={SEC.check} label="Detach — Employer Paystub" />
      <CutLine topIn={SEC.stub}  label="Detach — Employee Copy" />

      {/* Check fields */}
      <div style={{ position: 'absolute', top: CHECK.date.top, right: CHECK.date.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000' }}>{today}</div>
      <div style={{ position: 'absolute', top: CHECK.payTo.top, left: CHECK.payTo.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 600, color: '#000', maxWidth: '4.7in', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fr.user_name}</div>
      <div style={{ position: 'absolute', top: CHECK.dollarAmt.top, right: CHECK.dollarAmt.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000', letterSpacing: '0.04em' }}>{formatCurrency(amount).replace('$', '')}</div>
      <div style={{ position: 'absolute', top: CHECK.words.top, left: CHECK.words.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000', maxWidth: '6.1in', overflow: 'hidden', whiteSpace: 'nowrap' }}>{amountToWords(amount)}</div>
      <div style={{ position: 'absolute', top: CHECK.memo.top, left: CHECK.memo.left, fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000' }}>{fr.user_name}</div>

      {/* Employer copy */}
      <div style={{ position: 'absolute', top: `${SEC.check + 0.14}in`, bottom: `${11 - SEC.stub + 0.08}in`, left: '0.75in', right: '0.75in', display: 'flex', flexDirection: 'column' }}>
        <StubHeader emp={{ name: fr.user_name, pay_type: 'Flat Rate' }} periodLabel={periodLabel} copyLabel="Employer Copy" today={today} />
        <FlatRateStubTable fr={fr} />
      </div>

      {/* Stub register fields */}
      <div style={{ position: 'absolute', top: STUB.name.top, left: STUB.name.left, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 600, color: '#000' }}>{fr.user_name}</div>
      <div style={{ position: 'absolute', top: STUB.amount.top, right: STUB.amount.right, fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000', letterSpacing: '0.04em' }}>{formatCurrency(amount).replace('$', '')}</div>
      <div style={{ position: 'absolute', top: STUB.period.top, left: STUB.period.left, fontSize: '9pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000' }}>Pay Period: {periodLabel}</div>

      {/* Employee copy */}
      <div style={{ position: 'absolute', top: '8.06in', bottom: '0.3in', left: '0.75in', right: '0.75in', display: 'flex', flexDirection: 'column' }}>
        <StubHeader emp={{ name: fr.user_name, pay_type: 'Flat Rate' }} periodLabel={periodLabel} copyLabel="Employee Copy" today={today} />
        <FlatRateStubTable fr={fr} />
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

  const today       = format(new Date(), 'MM/dd/yyyy')
  const issuedDate  = format(new Date(), 'yyyy-MM-dd')
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
        <span><strong>Sections:</strong> Check stock (top) · Employer copy (middle) · Employee copy (bottom)</span>
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
                  Employer Copy
                </span>
              </div>
              <div className="no-print" style={{
                position: 'absolute', top: `${SEC.stub}in`, left: 0, right: 0, bottom: 0,
                background: 'rgba(59,130,246,0.04)',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#93c5fd', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Employee Copy
                </span>
              </div>

              {/* ── Cut lines ────────────────────────────────────── */}
              <CutLine topIn={SEC.check} label="Detach — Employer Paystub" />
              <CutLine topIn={SEC.stub}  label="Detach — Employee Copy" />

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

              {/* ══ EMPLOYER COPY (section 2) ══ */}
              <div style={{
                position: 'absolute',
                top: `${SEC.check + 0.14}in`,
                bottom: `${11 - SEC.stub + 0.08}in`,
                left: '0.75in', right: '0.75in',
                display: 'flex', flexDirection: 'column',
              }}>
                <StubHeader emp={emp} periodLabel={periodLabel} copyLabel="Employer Copy" today={today} />
                <PaystubTable emp={emp} gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay} />
              </div>

              {/* ══ EMPLOYEE COPY — check-register stub fields (exact PPTX positions) ══ */}

              {/* Employee name */}
              <div style={{
                position: 'absolute', top: STUB.name.top, left: STUB.name.left,
                fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                fontWeight: 600, color: '#000',
              }}>{emp.name}</div>

              {/* Net pay amount */}
              <div style={{
                position: 'absolute', top: STUB.amount.top, right: STUB.amount.right,
                fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                fontWeight: 700, color: '#000', letterSpacing: '0.04em',
              }}>{formatCurrency(netPay).replace('$', '')}</div>

              {/* Pay period */}
              <div style={{
                position: 'absolute', top: STUB.period.top, left: STUB.period.left,
                fontSize: '9pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
              }}>Pay Period: {periodLabel}</div>

              {/* ══ EMPLOYEE COPY — detailed paystub (below stub register fields) ══ */}
              <div style={{
                position: 'absolute',
                top: '8.06in',
                bottom: '0.3in',
                left: '0.75in', right: '0.75in',
                display: 'flex', flexDirection: 'column',
              }}>
                <StubHeader emp={emp} periodLabel={periodLabel} copyLabel="Employee Copy" today={today} />
                <PaystubTable emp={emp} gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay} />
              </div>

            </div>
          )
        })}

        {/* Flat rate check pages */}
        {flatRatePayments.map((fr) => (
          <FlatRateCheckPage key={`fr-${fr.id}`} fr={fr} today={today} periodLabel={periodLabel} />
        ))}
      </div>
    </div>,
    document.body
  )
}
