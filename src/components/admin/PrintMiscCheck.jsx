import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../utils/format'
import { format } from 'date-fns'
import { amountToWords, CHECK_CON, SEC, CutLine, ES, esH, esC, SectionOverlays, printStylesheet } from './checkPrintKit'

const PAYEE_TYPE_LABELS = { vendor: 'Vendor/Provider', employee: 'Employee', contractor: 'Contractor', other: 'Payee' }

// ── Adjustment/compensation pay stub — same table/typography as every
// other check type in the app. This is a one-off check independent of any
// regular pay period or invoice, so the "reason" line is the whole point ─
function MiscEarningsStatement({ ck, checkDate }) {
  const amount = parseFloat(ck.amount)

  return (
    <div style={{ fontFamily: ES.font, display: 'flex', flexDirection: 'column', gap: '5pt', height: '100%', justifyContent: 'center' }}>

      {/* Payee info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '54%' }) }}>Payee</th>
            <th style={{ ...esH({ width: '20%' }) }}>Type</th>
            <th style={{ ...esH({ width: '26%' }) }}>Pay Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', verticalAlign: 'top', padding: '5pt 6pt' }) }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '9pt', color: ES.accent }}>{ck.payee_name}</p>
              <p style={{ margin: '1pt 0 0', fontSize: '7pt', color: '#666' }}>{ck.payee_address || 'Payee'}</p>
            </td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{PAYEE_TYPE_LABELS[ck.payee_type] ?? ck.payee_type}</td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{checkDate}</td>
          </tr>
        </tbody>
      </table>

      {/* Reason + amount table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', paddingLeft: '6pt', width: '70%' }) }}>Adjustment / Compensation</th>
            <th style={{ ...esH({ textAlign: 'right', paddingRight: '6pt', width: '30%' }) }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', paddingLeft: '6pt', fontWeight: 500 }) }}>{ck.reason}</td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 600 }) }}>{formatCurrency(amount)}</td>
          </tr>
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

// ── Misc check page — same CHECK_CON positions/SEC breakpoints/CutLine/
// section-overlay treatment as every other printed check in the app ──────
function MiscCheckPage({ ck, today }) {
  const amount = parseFloat(ck.amount)

  return (
    <div className="check-page" style={{
      width: '8.5in', height: '11in', position: 'relative',
      background: '#fff', boxShadow: '0 6px 32px rgba(0,0,0,0.18)',
      flexShrink: 0,
    }}>
      <SectionOverlays middleLabel="Payee Copy" bottomLabel="Company Copy" />

      <CutLine topIn={SEC.check}   label="Detach — Payee Copy" />
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
      }}>{ck.payee_name}</div>

      <div style={{
        position: 'absolute', top: CHECK_CON.words.top, left: CHECK_CON.words.left, width: CHECK_CON.words.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{amountToWords(amount)}</div>

      {/* Memo — payee name, envelope-window line 1 */}
      <div style={{
        position: 'absolute', top: CHECK_CON.memo.top, left: CHECK_CON.memo.left, width: CHECK_CON.memo.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{ck.payee_name}</div>

      {/* Address — envelope-window line 2 */}
      {ck.payee_address && (
        <div style={{
          position: 'absolute', top: CHECK_CON.address.top, left: CHECK_CON.address.left, width: CHECK_CON.address.w,
          fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}>{ck.payee_address}</div>
      )}

      {/* ══ PAYEE COPY (section 2 — middle) ══ */}
      <div style={{
        position: 'absolute',
        top: `${SEC.check + 0.35}in`,
        bottom: `${11 - SEC.stub + 0.3}in`,
        left: '0.75in', right: '0.75in',
        overflow: 'hidden',
      }}>
        <MiscEarningsStatement ck={ck} checkDate={today} />
      </div>

      {/* ══ COMPANY COPY (section 3 — bottom) ══ */}
      <div style={{
        position: 'absolute',
        top: `${SEC.stub + 0.35}in`,
        bottom: `${(11 - SEC.barcode + 0.15).toFixed(4)}in`,
        left: '0.75in', right: '0.75in',
        overflow: 'hidden',
      }}>
        <MiscEarningsStatement ck={ck} checkDate={today} />
      </div>
    </div>
  )
}

export default function PrintMiscCheck({ checks, onClose }) {
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-misc-css'
    style.textContent = printStylesheet('print-misc-root')
    document.head.appendChild(style)
    return () => document.getElementById('print-misc-css')?.remove()
  }, [])

  const defaultDate = (() => {
    try { return checks[0]?.check_date ?? format(new Date(), 'yyyy-MM-dd') } catch { return format(new Date(), 'yyyy-MM-dd') }
  })()
  const [checkDateISO, setCheckDateISO] = useState(defaultDate)
  const today = (() => { try { return format(new Date(checkDateISO + 'T12:00'), 'MM/dd/yyyy') } catch { return checkDateISO } })()

  const missingAmount = checks.some(ck => !ck.amount || parseFloat(ck.amount) <= 0)

  // Portal directly to <body> — see PrintContractorCheck for why this has to
  // be an actual direct child of body for the print stylesheet's hide-rule
  // to work.
  return createPortal(
    <div id="print-misc-root"
      style={{ position: 'fixed', inset: 0, background: '#d1d5db', zIndex: 9999, overflowY: 'auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#0f172a', color: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>Print Adjustment/Compensation Checks</p>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
            {checks.length} check{checks.length !== 1 ? 's' : ''}&ensp;·&ensp;Load check stock before printing
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
          <button onClick={() => window.print()} disabled={checks.length === 0} style={{
            padding: '8px 20px', borderRadius: 8,
            background: checks.length === 0 ? '#374151' : '#6366f1',
            color: checks.length === 0 ? '#6b7280' : '#fff',
            border: 'none', cursor: checks.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 13,
          }}>
            Print All ({checks.length})
          </button>
        </div>
      </div>

      {/* ── Instruction bar ─────────────────────────────────────── */}
      {missingAmount && (
        <div className="no-print" style={{ background: '#fee2e2', borderBottom: '1px solid #fecaca', padding: '7px 24px', fontSize: '11.5px', color: '#991b1b' }}>
          One or more selected checks has no amount set — add it before printing, or the check will show $0.00.
        </div>
      )}
      <div className="no-print" style={{
        background: '#fef3c7', borderBottom: '1px solid #fde68a',
        padding: '7px 24px', fontSize: '11.5px', color: '#92400e',
      }}>
        <strong>Sections:</strong> Check stock (top) · Payee copy (middle) · Company copy (bottom)
      </div>

      {/* ── Check pages ──────────────────────────────────────────── */}
      <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'center' }}>
        {checks.length === 0 && (
          <p style={{ color: '#6b7280', padding: '80px 0', fontSize: 14 }}>No checks selected.</p>
        )}
        {checks.map(ck => <MiscCheckPage key={ck.id} ck={ck} today={today} />)}
      </div>
    </div>,
    document.body
  )
}
