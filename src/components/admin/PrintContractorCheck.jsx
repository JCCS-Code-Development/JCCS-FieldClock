import { useEffect, useState } from 'react'
import { formatCurrency } from '../../utils/format'
import { format } from 'date-fns'

const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function below1000(n) {
  if (n === 0) return ''
  if (n < 20)  return ONES[n] + ' '
  if (n < 100) return TENS[Math.floor(n/10)] + (n % 10 ? ' ' + ONES[n%10] : '') + ' '
  return ONES[Math.floor(n/100)] + ' Hundred ' + below1000(n % 100)
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

// Positions calibrated to Check_Perfect_Template.key (same blank check stock
// used for vendor checks — see PrintVendorCheck.jsx)
const CHECK = {
  date:      { top: '0.42in',  right: '0.72in'  },
  payTo:     { top: '0.82in',  left:  '0.44in'  },
  dollarAmt: { top: '0.82in',  right: '0.72in'  },
  words:     { top: '1.13in',  left:  '0.44in'  },
  addrName:  { top: '1.54in',  left:  '0.71in'  },
  addrLine1: { top: '1.73in',  left:  '0.71in'  },
  addrLine2: { top: '1.90in',  left:  '0.71in'  },
  memo:      { top: '2.20in',  left:  '0.44in'  },
}
const SEC = { check: 3.44, stub: 7.22 }

function CutLine({ topIn, label }) {
  return (
    <div style={{ position:'absolute', top:`${topIn}in`, left:0, right:0, zIndex:2, display:'flex', alignItems:'center', gap:'8px' }}>
      <div style={{ flex:1, borderTop:'1pt dashed #94a3b8' }} />
      <span className="no-print" style={{ fontSize:'7pt', color:'#94a3b8', fontFamily:'Arial,sans-serif', letterSpacing:'0.1em', textTransform:'uppercase', whiteSpace:'nowrap', flexShrink:0 }}>
        ✂ {label}
      </span>
      <div style={{ flex:1, borderTop:'1pt dashed #94a3b8' }} />
    </div>
  )
}

function StubTable({ inv }) {
  const cell = (extra={}) => ({ padding:'3pt 7pt', fontSize:'8pt', fontFamily:'Arial,sans-serif', borderBottom:'0.5pt solid #f0f0f0', color:'#374151', ...extra })
  const estimateLabel = inv.estimate_number
    ? `Estimate #${inv.estimate_number}${inv.job_name ? ' — ' + inv.job_name : ''}`
    : (inv.job_name || '—')
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <tbody>
        <tr>
          <td style={{ ...cell({ fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', fontSize:'7pt', width:'34%' }) }}>Paying Toward</td>
          <td style={{ ...cell({ fontWeight:600 }) }} colSpan={2}>{estimateLabel}</td>
        </tr>
        {inv.estimate_description && (
          <tr>
            <td style={cell()} />
            <td style={{ ...cell({ color:'#6b7280', fontSize:'7.5pt' }) }} colSpan={2}>{inv.estimate_description}</td>
          </tr>
        )}
        {inv.invoice_number && (
          <tr>
            <td style={{ ...cell({ fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', fontSize:'7pt' }) }}>Invoice #</td>
            <td style={{ ...cell({ fontWeight:600 }) }} colSpan={2}>{inv.invoice_number}</td>
          </tr>
        )}
        <tr style={{ background:'#eff6ff' }}>
          <td colSpan={2} style={{ ...cell({ fontWeight:700, fontSize:'9pt', color:'#1e40af', borderTop:'1pt solid #bfdbfe', borderBottom:'1pt solid #bfdbfe' }) }}>TOTAL</td>
          <td style={{ ...cell({ textAlign:'right', fontWeight:700, fontSize:'10pt', color:'#1e40af', borderTop:'1pt solid #bfdbfe', borderBottom:'1pt solid #bfdbfe' }) }}>{formatCurrency(parseFloat(inv.amount))}</td>
        </tr>
      </tbody>
    </table>
  )
}

function RecordHeader({ inv, copyLabel, today }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'1.5pt solid #e2e8f0', paddingBottom:'0.09in', marginBottom:'0.1in' }}>
      <div>
        <p style={{ fontSize:'9.5pt', fontWeight:700, fontFamily:'Arial,sans-serif', color:'#0f172a', margin:0 }}>
          JCCS Services LLC — Accounts Payable
        </p>
        <p style={{ fontSize:'8pt', fontFamily:'Arial,sans-serif', color:'#475569', margin:'2pt 0 0' }}>
          <strong>{inv.contractor_name}</strong>
          &ensp;·&ensp;Contractor
          {inv.contractor_address && <>&ensp;·&ensp;{inv.contractor_address}</>}
        </p>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <p style={{ fontSize:'6.5pt', fontFamily:'Arial,sans-serif', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.12em', margin:0 }}>{copyLabel}</p>
        <p style={{ fontSize:'7.5pt', fontFamily:'Arial,sans-serif', color:'#64748b', margin:'2pt 0 0' }}>Check Date: {today}</p>
      </div>
    </div>
  )
}

function splitAddress(addr) {
  if (!addr) return ['', '']
  const lines = addr.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length >= 2) return [lines[0], lines.slice(1).join(', ')]
  const lastComma = addr.lastIndexOf(',', addr.lastIndexOf(',') - 1)
  if (lastComma > 0) return [addr.slice(0, lastComma).trim(), addr.slice(lastComma + 1).trim()]
  return [addr, '']
}

function ContractorCheckPage({ inv, checkDate }) {
  const amount = parseFloat(inv.amount)
  const today  = format(new Date(checkDate + 'T12:00'), 'MM/dd/yyyy')
  const [addrLine1, addrLine2] = splitAddress(inv.contractor_address)
  const memo = inv.estimate_number ? `Estimate #${inv.estimate_number}` : (inv.invoice_number ? `Invoice #${inv.invoice_number}` : '')

  return (
    <div className="check-page" style={{ width:'8.5in', height:'11in', position:'relative', background:'#fff', boxShadow:'0 6px 32px rgba(0,0,0,0.18)', flexShrink:0 }}>

      <div className="no-print" style={{ position:'absolute', top:0, left:0, right:0, height:`${SEC.check}in`, background:'rgba(99,102,241,0.05)', pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:5, left:10, fontSize:8, color:'#a5b4fc', fontFamily:'sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Check — pre-printed on stock</span>
      </div>
      <div className="no-print" style={{ position:'absolute', top:`${SEC.check}in`, left:0, right:0, height:`${SEC.stub - SEC.check}in`, background:'rgba(16,185,129,0.04)', pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:18, left:10, fontSize:8, color:'#6ee7b7', fontFamily:'sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Company Record</span>
      </div>
      <div className="no-print" style={{ position:'absolute', top:`${SEC.stub}in`, left:0, right:0, bottom:0, background:'rgba(59,130,246,0.04)', pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:18, left:10, fontSize:8, color:'#93c5fd', fontFamily:'sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Contractor Copy</span>
      </div>

      <CutLine topIn={SEC.check} label="Detach — Company Record" />
      <CutLine topIn={SEC.stub}  label="Detach — Contractor Copy" />

      {/* ── CHECK FIELDS ── */}
      <div style={{ position:'absolute', top:CHECK.date.top,      right:CHECK.date.right,      fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{today}</div>
      <div style={{ position:'absolute', top:CHECK.payTo.top,     left:CHECK.payTo.left,       fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', fontWeight:600, color:'#000', maxWidth:'5in', overflow:'hidden', whiteSpace:'nowrap' }}>{inv.contractor_name}</div>
      <div style={{ position:'absolute', top:CHECK.dollarAmt.top, right:CHECK.dollarAmt.right, fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', fontWeight:700, color:'#000', letterSpacing:'0.04em' }}>{formatCurrency(amount).replace('$','')}</div>
      <div style={{ position:'absolute', top:CHECK.words.top,     left:CHECK.words.left,       fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000', maxWidth:'6.2in', overflow:'hidden', whiteSpace:'nowrap' }}>{amountToWords(amount)}</div>
      {/* Address block — contractor/company name + street + city/state (shows through windowed envelope) */}
      <div style={{ position:'absolute', top:CHECK.addrName.top,  left:CHECK.addrName.left,    fontSize:'10.5pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{inv.contractor_name}</div>
      {addrLine1 && <div style={{ position:'absolute', top:CHECK.addrLine1.top, left:CHECK.addrLine1.left, fontSize:'10.5pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{addrLine1}</div>}
      {addrLine2 && <div style={{ position:'absolute', top:CHECK.addrLine2.top, left:CHECK.addrLine2.left, fontSize:'10.5pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{addrLine2}</div>}
      {memo && <div style={{ position:'absolute', top:CHECK.memo.top, left:CHECK.memo.left, fontSize:'9.5pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{memo}</div>}

      {/* ── COMPANY RECORD (section 2) ── */}
      <div style={{ position:'absolute', top:`${SEC.check + 0.14}in`, bottom:`${11 - SEC.stub + 0.08}in`, left:'0.5in', right:'0.5in', display:'flex', flexDirection:'column' }}>
        <RecordHeader inv={inv} copyLabel="Company Record" today={today} />
        <StubTable inv={inv} />
      </div>

      {/* ── CONTRACTOR COPY (section 3) — pay stub, shows what estimate this pays toward ── */}
      <div style={{ position:'absolute', top:`${SEC.stub + 0.14}in`, bottom:'0.3in', left:'0.5in', right:'0.5in', display:'flex', flexDirection:'column' }}>
        <RecordHeader inv={inv} copyLabel="Contractor Copy" today={today} />
        <StubTable inv={inv} />
      </div>
    </div>
  )
}

export default function PrintContractorCheck({ invoices, onClose }) {
  const [checkDate, setCheckDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-contractor-css'
    style.textContent = `
      @media print {
        @page { size: 8.5in 11in; margin: 0; }
        body > *:not(#print-contractor-root) { display: none !important; }
        #print-contractor-root { display: block !important; position: static !important; overflow: visible !important; }
        .no-print { display: none !important; }
        .check-page { page-break-after: always; break-after: page; }
        .check-page:last-child { page-break-after: avoid; break-after: avoid; }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-contractor-css')?.remove()
  }, [])

  const missingAmount = invoices.some(inv => !inv.amount || parseFloat(inv.amount) <= 0)

  return (
    <div id="print-contractor-root" style={{ position:'fixed', inset:0, background:'#d1d5db', zIndex:9999, overflowY:'auto' }}>

      <div className="no-print" style={{ position:'sticky', top:0, zIndex:20, background:'#0f172a', color:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 24px', gap:16, flexWrap:'wrap' }}>
        <div>
          <p style={{ fontWeight:600, fontSize:'14px', margin:0 }}>Print Contractor Checks</p>
          <p style={{ fontSize:'12px', color:'#94a3b8', margin:'2px 0 0' }}>{invoices.length} check{invoices.length !== 1 ? 's' : ''} · Load check stock before printing</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <label style={{ fontSize:12, color:'#94a3b8' }}>
            Check Date{' '}
            <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
              style={{ marginLeft:6, padding:'4px 8px', borderRadius:6, border:'1px solid #334155', background:'#1e293b', color:'#f8fafc', fontSize:12 }} />
          </label>
          <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #334155', color:'#cbd5e1', background:'transparent', cursor:'pointer', fontSize:13 }}>← Back</button>
          <button onClick={() => window.print()} style={{ padding:'8px 20px', borderRadius:8, background:'#6366f1', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, fontSize:13 }}>Print All ({invoices.length})</button>
        </div>
      </div>

      {missingAmount && (
        <div className="no-print" style={{ background:'#fee2e2', borderBottom:'1px solid #fecaca', padding:'7px 24px', fontSize:'11.5px', color:'#991b1b' }}>
          One or more selected invoices has no amount set — add it before printing, or the check will show $0.00.
        </div>
      )}
      <div className="no-print" style={{ background:'#fef3c7', borderBottom:'1px solid #fde68a', padding:'7px 24px', fontSize:'11.5px', color:'#92400e' }}>
        <strong>Sections:</strong> Check stock (top) · Company record (middle) · Contractor pay stub (bottom) — shows the estimate/invoice this check pays toward
      </div>

      <div style={{ padding:'28px 24px', display:'flex', flexDirection:'column', gap:44, alignItems:'center' }}>
        {invoices.length === 0 && <p style={{ color:'#6b7280', padding:'80px 0', fontSize:14 }}>No checks selected.</p>}
        {invoices.map(inv => <ContractorCheckPage key={inv.id} inv={inv} checkDate={checkDate} />)}
      </div>
    </div>
  )
}
