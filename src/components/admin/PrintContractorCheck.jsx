import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../utils/format'
import { format } from 'date-fns'
import { amountToWords, CHECK_CON, SEC, CutLine, ES, esH, esC, SectionOverlays, printStylesheet } from './checkPrintKit'

// ── Contractor pay stub — same table/typography as EarningsStatement and
// FlatRateEarningsStatement in PrintChecks.jsx, with the fields this check
// type needs: contractor/company name, address, invoice #, and the estimate
// (with job) being paid toward ─────────────────────────────────────────
function ContractorEarningsStatement({ inv, checkDate }) {
  const amount = parseFloat(inv.amount)
  const fmtPeriod = (() => {
    try {
      return `${format(new Date(inv.period_start + 'T12:00'), 'MM/dd/yy')} – ${format(new Date(inv.period_end + 'T12:00'), 'MM/dd/yy')}`
    } catch { return inv.period_start && inv.period_end ? `${inv.period_start} – ${inv.period_end}` : '—' }
  })()
  const estimateNum = inv.resolved_estimate_number ?? inv.estimate_number
  const jobRef       = inv.job_name ?? inv.job_location
  const estimateLabel = estimateNum
    ? `Estimate #${estimateNum}${jobRef ? ' — ' + jobRef : ''}`
    : (jobRef || 'No estimate on file')

  return (
    <div style={{ fontFamily: ES.font, display: 'flex', flexDirection: 'column', gap: '5pt', height: '100%', justifyContent: 'center' }}>

      {/* Contractor / company info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', width: '38%' }) }}>Contractor</th>
            <th style={{ ...esH({ width: '16%' }) }}>Pay Date</th>
            <th style={{ ...esH({ width: '30%' }) }}>Pay Period</th>
            <th style={{ ...esH({ width: '16%' }) }}>Invoice #</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', verticalAlign: 'top', padding: '5pt 6pt' }) }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '9pt', color: ES.accent }}>{inv.contractor_name}</p>
              <p style={{ margin: '1pt 0 0', fontSize: '7pt', color: '#666' }}>{inv.contractor_address || 'Contractor'}</p>
            </td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{checkDate}</td>
            <td style={{ ...esC({ textAlign: 'center', fontSize: '7.5pt' }) }}>{fmtPeriod}</td>
            <td style={{ ...esC({ textAlign: 'center', fontWeight: 700, fontSize: '7.5pt' }) }}>{inv.invoice_number || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Paying toward + amount table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5pt solid ${ES.border}` }}>
        <thead>
          <tr>
            <th style={{ ...esH({ textAlign: 'left', paddingLeft: '6pt', width: '70%' }) }}>Paying Toward</th>
            <th style={{ ...esH({ textAlign: 'right', paddingRight: '6pt', width: '30%' }) }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...esC({ textAlign: 'left', paddingLeft: '6pt', fontWeight: 500 }) }}>{estimateLabel}</td>
            <td style={{ ...esC({ textAlign: 'right', paddingRight: '6pt', fontWeight: 600 }) }}>{formatCurrency(amount)}</td>
          </tr>
          <tr style={{ background: '#fdf9ee' }}>
            <td style={{ ...esC({ paddingLeft: '6pt', color: '#666', fontSize: '7.5pt' }) }}>{inv.estimate_description || ' '}</td>
            <td style={esC()}>&nbsp;</td>
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

// ── Contractor check page — positions from Contractor_Check_Template.key,
// same SEC breakpoints/CutLine/section-overlay treatment as every other
// printed check in the app ──────────────────────────────────────────────
function ContractorCheckPage({ inv, today }) {
  const amount = parseFloat(inv.amount)

  return (
    <div className="check-page" style={{
      width: '8.5in', height: '11in', position: 'relative',
      background: '#fff', boxShadow: '0 6px 32px rgba(0,0,0,0.18)',
      flexShrink: 0,
    }}>
      <SectionOverlays middleLabel="Contractor Copy" bottomLabel="Company Copy" />

      <CutLine topIn={SEC.check}   label="Detach — Contractor Copy" />
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
      }}>{inv.contractor_name}</div>

      <div style={{
        position: 'absolute', top: CHECK_CON.words.top, left: CHECK_CON.words.left, width: CHECK_CON.words.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{amountToWords(amount)}</div>

      {/* Memo — contractor/company name, envelope-window line 1 */}
      <div style={{
        position: 'absolute', top: CHECK_CON.memo.top, left: CHECK_CON.memo.left, width: CHECK_CON.memo.w,
        fontSize: '11pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>{inv.contractor_name}</div>

      {/* Address — envelope-window line 2 (the field the flat-rate/1099 check
          template doesn't have; contractor checks get their own address line) */}
      {inv.contractor_address && (
        <div style={{
          position: 'absolute', top: CHECK_CON.address.top, left: CHECK_CON.address.left, width: CHECK_CON.address.w,
          fontSize: '9.5pt', fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif', color: '#000',
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}>{inv.contractor_address}</div>
      )}

      {/* ══ CONTRACTOR COPY (section 2 — middle) ══ */}
      <div style={{
        position: 'absolute',
        top: `${SEC.check + 0.35}in`,
        bottom: `${11 - SEC.stub + 0.3}in`,
        left: '0.75in', right: '0.75in',
        overflow: 'hidden',
      }}>
        <ContractorEarningsStatement inv={inv} checkDate={today} />
      </div>

      {/* ══ COMPANY COPY (section 3 — bottom) ══ */}
      <div style={{
        position: 'absolute',
        top: `${SEC.stub + 0.35}in`,
        bottom: `${(11 - SEC.barcode + 0.15).toFixed(4)}in`,
        left: '0.75in', right: '0.75in',
        overflow: 'hidden',
      }}>
        <ContractorEarningsStatement inv={inv} checkDate={today} />
      </div>
    </div>
  )
}

export default function PrintContractorCheck({ invoices, onClose }) {
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-contractor-css'
    style.textContent = printStylesheet('print-contractor-root')
    document.head.appendChild(style)
    return () => document.getElementById('print-contractor-css')?.remove()
  }, [])

  // Default check date to the Friday of the FOLLOWING week, same rule
  // PrintChecks uses — pulled from the first invoice's period if it has one.
  const defaultFriday = (() => {
    try {
      const end = invoices[0]?.period_end
      const sun = new Date((end ?? format(new Date(), 'yyyy-MM-dd')) + 'T12:00')
      return new Date(sun.getTime() + 5 * 86400000)
    } catch { return new Date() }
  })()
  const [checkDateISO, setCheckDateISO] = useState(format(defaultFriday, 'yyyy-MM-dd'))
  const today = (() => { try { return format(new Date(checkDateISO + 'T12:00'), 'MM/dd/yyyy') } catch { return checkDateISO } })()

  const missingAmount = invoices.some(inv => !inv.amount || parseFloat(inv.amount) <= 0)

  // Portal directly to <body> — the print stylesheet hides everything via
  // `body > *:not(#print-contractor-root)`, which only works if this root is
  // actually a direct child of body rather than nested wherever Payroll.jsx
  // happens to render it (same reason PrintChecks.jsx portals).
  return createPortal(
    <div id="print-contractor-root"
      style={{ position: 'fixed', inset: 0, background: '#d1d5db', zIndex: 9999, overflowY: 'auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: '#0f172a', color: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>Print Contractor Checks</p>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
            {invoices.length} check{invoices.length !== 1 ? 's' : ''}&ensp;·&ensp;Load check stock before printing
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
          <button onClick={() => window.print()} disabled={invoices.length === 0} style={{
            padding: '8px 20px', borderRadius: 8,
            background: invoices.length === 0 ? '#374151' : '#6366f1',
            color: invoices.length === 0 ? '#6b7280' : '#fff',
            border: 'none', cursor: invoices.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 13,
          }}>
            Print All ({invoices.length})
          </button>
        </div>
      </div>

      {/* ── Instruction bar ─────────────────────────────────────── */}
      {missingAmount && (
        <div className="no-print" style={{ background: '#fee2e2', borderBottom: '1px solid #fecaca', padding: '7px 24px', fontSize: '11.5px', color: '#991b1b' }}>
          One or more selected invoices has no amount set — add it before printing, or the check will show $0.00.
        </div>
      )}
      <div className="no-print" style={{
        background: '#fef3c7', borderBottom: '1px solid #fde68a',
        padding: '7px 24px', fontSize: '11.5px', color: '#92400e',
      }}>
        <strong>Sections:</strong> Check stock (top) · Contractor copy (middle) · Company copy (bottom)
      </div>

      {/* ── Check pages ──────────────────────────────────────────── */}
      <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'center' }}>
        {invoices.length === 0 && (
          <p style={{ color: '#6b7280', padding: '80px 0', fontSize: 14 }}>No checks selected.</p>
        )}
        {invoices.map(inv => <ContractorCheckPage key={inv.id} inv={inv} today={today} />)}
      </div>
    </div>,
    document.body
  )
}
