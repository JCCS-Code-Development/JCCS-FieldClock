import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../utils/format'
import { format } from 'date-fns'
import { amountToWords, CHECK_CON, SEC, CutLine, ES, esH, esC, SectionOverlays, printStylesheet } from './checkPrintKit'

// ── Loan disbursement pay stub — same table/typography as every other check
// type in the app. This is the check that hands the employee the loan
// principal, not a deduction/repayment record ──────────────────────────
function LoanEarningsStatement({ loan, checkDate }) {
  const amount = parseFloat(loan.amount)

  return (
    <div style={{ fontFamily: ES.font, display: 'flex', flexDirection: 'column', gap: '5pt', height: '100%', justifyContent: 'center' }}>

      {/* Employee info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '54%' }) }}>Employee</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Date</th>
            <th style={{ ...esH({ width: '30%' }) }}>Loan Issued</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', verticalAlign: 'top', padding: '5pt 6pt' }) }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '9pt', color: ES.accent }}>{loan.user_name}</p>
              <p style={{ margin: '1pt 0 0', fontSize: '7pt', color: '#666' }}>{loan.user_address || 'Employee'}</p>
            </td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{checkDate}</td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{format(new Date(loan.created_at), 'MM/dd/yy')}</td>
          </tr>
        </tbody>
      </table>

      {/* Purpose + amount table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', paddingLeft: '6pt', width: '70%' }) }}>Loan Disbursement</th>
            <th style={{ ...esH({ textAlign: 'right', paddingRight: '6pt', width: '30%' }) }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', paddingLeft: '6pt', fontWeight: 500 }) }}>{loan.description || 'Employee loan'}</td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 600 }) }}>{formatCurrency(amount)}</td>
          </tr>
          {loan.weekly_deduction && (
            <tr style={{ background: '#fdf9ee' }}>
              <td style={{ ...esC({ paddingLeft: '6pt', color: '#666', fontSize: '7.5pt' }) }}>
                Repaid at {formatCurrency(loan.weekly_deduction)}/wk starting {(() => {
                  try { return format(new Date(loan.deduction_start_date + 'T12:00'), 'MM/dd/yy') } catch { return loan.deduction_start_date }
                })()}
              </td>
              <td style={esC()}>&nbsp;</td>
            </tr>
          )}
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

// ── Loan check page — same CHECK_CON positions/SEC breakpoints/CutLine/
// section-overlay treatment as every other printed check in the app ──────
function LoanCheckPage({ loan, today }) {
  const amount = parseFloat(loan.amount)

  return (
    <div className="check-page" style={{
      width: '8.5in', height: '11in', position: 'relative',
      background: '#fff', boxShadow: '0 6px 32px rgba(0,0,0,0.18)',
      flexShrink: 0,
    }}>
      <SectionOverlays middleLabel="Employee Copy" bottomLabel="Company Copy" />

      <CutLine topIn={SEC.check}   label="Detach — Employee Copy" />
      <CutLine topIn={SEC.stub}    label="Detach — Company Copy" />
      <CutLine topIn={SEC.barcode} label="Trim" />

      {/* ══ CHECK FIELDS — positions from Contractor_Check_Template.key ══ */}
      <div style={{
        position: 'absolute', top: CHECK_CON.date.top, left: CHECK_CON.date.left, width: CHECK_CON.date.w,
        textAlign: 'right', fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
      }}>{today}</div>

      <div style={{
        position: 'absolute', top: CHECK_CON.checkNum.top, left: CHECK_CON.checkNum.left, width: CHECK_CON.checkNum.w,
        textAlign: 'right', fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', fontWeight: 700, color: '#000',
      }}>{formatCurrency(amount).replace('$', '')}</div>

      <div style={{
        position: 'absolute', top: CHECK_CON.payTo.top, left: CHECK_CON.payTo.left, width: CHECK_CON.payTo.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
        fontWeight: 600, color: '#000', overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{loan.user_name}</div>

      <div style={{
        position: 'absolute', top: CHECK_CON.words.top, left: CHECK_CON.words.left, width: CHECK_CON.words.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{amountToWords(amount)}</div>

      {/* Memo — employee name, envelope-window line 1 */}
      <div style={{
        position: 'absolute', top: CHECK_CON.memo.top, left: CHECK_CON.memo.left, width: CHECK_CON.memo.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{loan.user_name}</div>

      {/* Address — envelope-window line 2 */}
      {loan.user_address && (
        <div style={{
          position: 'absolute', top: CHECK_CON.address.top, left: CHECK_CON.address.left, width: CHECK_CON.address.w,
          fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}>{loan.user_address}</div>
      )}

      {/* ══ EMPLOYEE COPY (section 2 — middle) ══ */}
      <div style={{
        position: 'absolute',
        top: `${SEC.check + 0.35}in`,
        bottom: `${11 - SEC.stub + 0.3}in`,
        left: '0.75in', right: '0.75in',
        overflow: 'hidden',
      }}>
        <LoanEarningsStatement loan={loan} checkDate={today} />
      </div>

      {/* ══ COMPANY COPY (section 3 — bottom) ══ */}
      <div style={{
        position: 'absolute',
        top: `${SEC.stub + 0.35}in`,
        bottom: `${(11 - SEC.barcode + 0.15).toFixed(4)}in`,
        left: '0.75in', right: '0.75in',
        overflow: 'hidden',
      }}>
        <LoanEarningsStatement loan={loan} checkDate={today} />
      </div>
    </div>
  )
}

export default function PrintLoanCheck({ loan, onClose }) {
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-loan-css'
    style.textContent = printStylesheet('print-loan-root')
    document.head.appendChild(style)
    return () => document.getElementById('print-loan-css')?.remove()
  }, [])

  const [checkDateISO, setCheckDateISO] = useState(format(new Date(), 'yyyy-MM-dd'))
  const today = (() => { try { return format(new Date(checkDateISO + 'T12:00'), 'MM/dd/yyyy') } catch { return checkDateISO } })()

  const missingAmount = !loan.amount || parseFloat(loan.amount) <= 0

  // Portal directly to <body> — see PrintContractorCheck for why this has to
  // be an actual direct child of body for the print stylesheet's hide-rule
  // to work.
  return createPortal(
    <div id="print-loan-root"
      style={{ position: 'fixed', inset: 0, background: '#d1d5db', zIndex: 9999, overflowY: 'auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#0f172a', color: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>Print Loan Check — {loan.user_name}</p>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>Load check stock before printing</p>
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
            padding: '8px 20px', borderRadius: 8,
            background: '#6366f1', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>
            Print Check
          </button>
        </div>
      </div>

      {/* ── Instruction bar ─────────────────────────────────────── */}
      {missingAmount && (
        <div className="no-print" style={{ background: '#fee2e2', borderBottom: '1px solid #fecaca', padding: '7px 24px', fontSize: '11.5px', color: '#991b1b' }}>
          This loan has no amount set — the check will show $0.00.
        </div>
      )}
      <div className="no-print" style={{
        background: '#fef3c7', borderBottom: '1px solid #fde68a',
        padding: '7px 24px', fontSize: '11.5px', color: '#92400e',
      }}>
        <strong>Sections:</strong> Check stock (top) · Employee copy (middle) · Company copy (bottom)
      </div>

      {/* ── Check page ───────────────────────────────────────────── */}
      <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'center' }}>
        <LoanCheckPage loan={loan} today={today} />
      </div>
    </div>,
    document.body
  )
}
