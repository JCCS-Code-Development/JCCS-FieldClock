import { useEffect } from 'react'
import { formatCurrency } from '../../utils/format'
import { format } from 'date-fns'

// ── Amount-to-words ───────────────────────────────────────────────
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

// ── Layout constants (inches from top-left of the page) ──────────
// Adjust these if text lands slightly off on your specific check stock.
const CHECK = {
  date:        { top: '0.52in',  left: '5.60in' },   // date field, top-right of check
  payTo:       { top: '1.43in',  left: '1.46in' },   // name on "PAY TO THE ORDER OF" line
  dollarAmt:   { top: '1.38in',  left: '6.82in' },   // $ box
  words:       { top: '1.80in',  left: '0.38in' },   // written-out amount (before DOLLARS)
  memo:        { top: '3.08in',  left: '0.75in' },   // MEMO line
}

// The check occupies the top 3.44" of the page.
// Stubs start below:
const STUB_1_TOP = 3.52   // inches
const STUB_2_TOP = 7.28   // inches

function StubContent({ emp, period, gas, bonus, loanDed, netPay, topIn }) {
  const rows = [
    { label: 'Employee',        value: emp.name,                             bold: true },
    { label: 'Pay Period',      value: `${period.start}  –  ${period.end}` },
    { label: 'Pay Type',        value: emp.pay_type?.toUpperCase() },
    { label: 'Hours Worked',    value: `${parseFloat(emp.approved_hours ?? 0).toFixed(2)} hrs` },
    { label: 'Base Pay',        value: formatCurrency(emp.base_gross ?? 0) },
    ...(gas   > 0 ? [{ label: 'Gas Allowance',      value: `+ ${formatCurrency(gas)}`,   color: '#92400e' }] : []),
    ...(bonus > 0 ? [{ label: 'Bonus / Adjustment',  value: `+ ${formatCurrency(bonus)}`, color: '#166534' }] : []),
    ...(loanDed > 0 ? [{ label: 'Loan Deduction',   value: `− ${formatCurrency(loanDed)}`, color: '#991b1b' }] : []),
  ]

  return (
    <div style={{ position: 'absolute', top: `${topIn}in`, left: '0.38in', width: '7.74in' }}>
      {/* Row layout: left = detail table, right = net pay box */}
      <div style={{ display: 'flex', gap: '0.4in' }}>
        {/* Detail table */}
        <div style={{ flex: 1 }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              borderBottom: '0.5pt solid #d1d5db',
              padding: '1.5pt 0',
              fontSize: '8pt',
              fontFamily: 'Arial, sans-serif',
            }}>
              <span style={{ color: '#6b7280' }}>{r.label}</span>
              <span style={{ fontWeight: r.bold ? '700' : '500', color: r.color ?? '#111827' }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Net pay box */}
        <div style={{
          width: '1.6in',
          border: '1pt solid #374151',
          padding: '6pt 8pt',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '6.5pt', color: '#6b7280', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3pt' }}>
            Net Pay
          </div>
          <div style={{ fontSize: '14pt', fontWeight: '700', fontFamily: 'Arial, sans-serif', color: '#111827' }}>
            {formatCurrency(netPay)}
          </div>
          <div style={{ fontSize: '6pt', color: '#9ca3af', fontFamily: 'Arial, sans-serif', marginTop: '4pt', textAlign: 'center' }}>
            {period.label}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PrintChecks({ employees, period, gasByUser, bonusByUser, loanDeductions, onClose }) {
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

  const today = format(new Date(), 'MM/dd/yyyy')

  return (
    <div id="print-checks-root"
      style={{ position: 'fixed', inset: 0, background: '#f3f4f6', zIndex: 9999, overflowY: 'auto' }}>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="no-print"
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#111827', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '15px' }}>Print Checks — {period.label}</p>
          <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: 2 }}>
            {employees.length} check{employees.length !== 1 ? 's' : ''} · Load check stock into printer before printing
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #4b5563', color: '#d1d5db', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>
            ← Back
          </button>
          <button onClick={() => window.print()}
            style={{ padding: '8px 20px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            🖨 Print All Checks
          </button>
        </div>
      </div>

      {/* ── Hint bar ─────────────────────────────────────────── */}
      <div className="no-print"
        style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a', padding: '8px 24px', fontSize: '12px', color: '#92400e' }}>
        <strong>How to use:</strong> Load your pre-printed JCCS check stock into the printer. Click "Print All Checks" and select your printer. The system will print the variable data (name, date, amount) exactly over the blank fields on each check. If any field is slightly off, see the layout constants in <code>PrintChecks.jsx</code>.
      </div>

      {/* ── Check pages ──────────────────────────────────────── */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 32, alignItems: 'center' }}>
        {employees.length === 0 && (
          <div style={{ padding: '80px 0', color: '#9ca3af', textAlign: 'center', fontSize: 14 }}>
            No employees to print for this period.
          </div>
        )}

        {employees.map((emp) => {
          const gas     = gasByUser[emp.user_id]      ?? 0
          const bonus   = bonusByUser[emp.user_id]    ?? 0
          const loanDed = loanDeductions[emp.user_id] ?? 0
          const netPay  = Math.max((emp.estimated_total ?? 0) - loanDed, 0)

          return (
            <div key={emp.user_id} className="check-page"
              style={{
                width: '8.5in', height: '11in', position: 'relative',
                background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                flexShrink: 0,
              }}>

              {/* ── Screen-only check area shading (hidden on print) ── */}
              <div className="no-print" style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '3.44in',
                background: 'rgba(99,102,241,0.04)', borderBottom: '1px dashed #c7d2fe',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: '#a5b4fc', fontFamily: 'sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Check area — pre-printed on stock
                </span>
              </div>
              <div className="no-print" style={{
                position: 'absolute', top: '3.44in', left: 0, right: 0, height: '3.78in',
                background: 'rgba(0,0,0,0.015)', borderBottom: '1px dashed #e5e7eb',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: '#9ca3af', fontFamily: 'sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Stub 1
                </span>
              </div>
              <div className="no-print" style={{
                position: 'absolute', top: '7.22in', left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.01)',
                pointerEvents: 'none',
              }}>
                <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: '#9ca3af', fontFamily: 'sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Stub 2 (Payment Record)
                </span>
              </div>

              {/* ══ DATA FIELDS — printed over check stock ══ */}

              {/* Date */}
              <div style={{
                position: 'absolute',
                top: CHECK.date.top, left: CHECK.date.left,
                fontSize: '10pt', fontFamily: 'Arial, sans-serif', color: '#000',
              }}>
                {today}
              </div>

              {/* Pay To name */}
              <div style={{
                position: 'absolute',
                top: CHECK.payTo.top, left: CHECK.payTo.left,
                fontSize: '11pt', fontFamily: 'Arial, sans-serif', fontWeight: '600', color: '#000',
                maxWidth: '4.8in', whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                {emp.name}
              </div>

              {/* $ amount (numeric) */}
              <div style={{
                position: 'absolute',
                top: CHECK.dollarAmt.top, left: CHECK.dollarAmt.left,
                fontSize: '11pt', fontFamily: 'Arial, sans-serif', fontWeight: '700', color: '#000',
                letterSpacing: '0.03em',
              }}>
                {formatCurrency(netPay).replace('$', '')}
              </div>

              {/* Amount in words */}
              <div style={{
                position: 'absolute',
                top: CHECK.words.top, left: CHECK.words.left,
                fontSize: '10pt', fontFamily: 'Arial, sans-serif', color: '#000',
                maxWidth: '6.2in', whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                {amountToWords(netPay)}
              </div>

              {/* Memo */}
              <div style={{
                position: 'absolute',
                top: CHECK.memo.top, left: CHECK.memo.left,
                fontSize: '9pt', fontFamily: 'Arial, sans-serif', color: '#000',
              }}>
                Payroll — {period.label}
              </div>

              {/* ── Stub 1 content ── */}
              <StubContent
                emp={emp} period={period}
                gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay}
                topIn={STUB_1_TOP}
              />

              {/* ── Stub 2 content ── */}
              <StubContent
                emp={emp} period={period}
                gas={gas} bonus={bonus} loanDed={loanDed} netPay={netPay}
                topIn={STUB_2_TOP}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
