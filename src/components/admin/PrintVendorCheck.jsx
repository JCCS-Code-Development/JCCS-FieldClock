import { useEffect } from 'react'
import { formatCurrency } from '../../utils/format'
import { format, parseISO } from 'date-fns'

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

// Same physical positions as payroll checks (calibrated to check stock)
const CHECK = {
  date:     { top: '1.104in', right: '0.771in' },
  payTo:    { top: '1.615in', left:  '1.312in' },
  dollarAmt:{ top: '1.594in', right: '0.771in' },
  words:    { top: '1.885in', left:  '1.312in' },
  memo:     { top: '2.500in', left:  '1.417in' },
}
const SEC  = { check: 3.44, stub: 7.22 }

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

function RemittanceTable({ ck }) {
  const cell = (extra={}) => ({ padding:'3pt 7pt', fontSize:'8pt', fontFamily:'Arial,sans-serif', borderBottom:'0.5pt solid #f0f0f0', color:'#374151', ...extra })
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr style={{ background:'#f8f9fa' }}>
          <th style={{ ...cell({ fontWeight:700, fontSize:'7pt', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1pt solid #e5e7eb' }), textAlign:'left' }}>Description / Memo</th>
          <th style={{ ...cell({ fontWeight:700, fontSize:'7pt', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1pt solid #e5e7eb' }), textAlign:'left', width:'22%' }}>Date</th>
          <th style={{ ...cell({ fontWeight:700, fontSize:'7pt', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1pt solid #e5e7eb' }), textAlign:'right', width:'22%' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...cell(), fontWeight:600 }}>{ck.memo || '—'}</td>
          <td style={{ ...cell({ color:'#6b7280' }) }}>{format(parseISO(ck.check_date), 'MM/dd/yyyy')}</td>
          <td style={{ ...cell({ textAlign:'right', fontWeight:600 }) }}>{formatCurrency(parseFloat(ck.amount))}</td>
        </tr>
        {ck.period_label && (
          <tr>
            <td style={{ ...cell({ color:'#6b7280', fontSize:'7.5pt' }) }}>Period: {ck.period_label}</td>
            <td style={cell()} />
            <td style={cell()} />
          </tr>
        )}
        <tr style={{ background:'#eff6ff' }}>
          <td colSpan={2} style={{ ...cell({ fontWeight:700, fontSize:'9pt', color:'#1e40af', borderTop:'1pt solid #bfdbfe', borderBottom:'1pt solid #bfdbfe' }) }}>TOTAL</td>
          <td style={{ ...cell({ textAlign:'right', fontWeight:700, fontSize:'10pt', color:'#1e40af', borderTop:'1pt solid #bfdbfe', borderBottom:'1pt solid #bfdbfe' }) }}>{formatCurrency(parseFloat(ck.amount))}</td>
        </tr>
      </tbody>
    </table>
  )
}

function RecordHeader({ ck, copyLabel, today }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'1.5pt solid #e2e8f0', paddingBottom:'0.09in', marginBottom:'0.1in' }}>
      <div>
        <p style={{ fontSize:'9.5pt', fontWeight:700, fontFamily:'Arial,sans-serif', color:'#0f172a', margin:0 }}>
          JCCS Services LLC — Accounts Payable
        </p>
        <p style={{ fontSize:'8pt', fontFamily:'Arial,sans-serif', color:'#475569', margin:'2pt 0 0' }}>
          <strong>{ck.vendor_name}</strong>
          &ensp;·&ensp;{ck.vendor_type?.charAt(0).toUpperCase() + ck.vendor_type?.slice(1)}
          {ck.vendor_address && <>&ensp;·&ensp;{ck.vendor_address}</>}
        </p>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <p style={{ fontSize:'6.5pt', fontFamily:'Arial,sans-serif', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.12em', margin:0 }}>{copyLabel}</p>
        <p style={{ fontSize:'7.5pt', fontFamily:'Arial,sans-serif', color:'#64748b', margin:'2pt 0 0' }}>Check Date: {today}</p>
      </div>
    </div>
  )
}

function VendorCheckPage({ ck }) {
  const amount = parseFloat(ck.amount)
  const today  = format(parseISO(ck.check_date), 'MM/dd/yyyy')

  return (
    <div className="check-page" style={{ width:'8.5in', height:'11in', position:'relative', background:'#fff', boxShadow:'0 6px 32px rgba(0,0,0,0.18)', flexShrink:0 }}>

      {/* Section overlays (screen only) */}
      <div className="no-print" style={{ position:'absolute', top:0, left:0, right:0, height:`${SEC.check}in`, background:'rgba(99,102,241,0.05)', pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:5, left:10, fontSize:8, color:'#a5b4fc', fontFamily:'sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Check — pre-printed on stock</span>
      </div>
      <div className="no-print" style={{ position:'absolute', top:`${SEC.check}in`, left:0, right:0, height:`${SEC.stub - SEC.check}in`, background:'rgba(16,185,129,0.04)', pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:18, left:10, fontSize:8, color:'#6ee7b7', fontFamily:'sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Company Record</span>
      </div>
      <div className="no-print" style={{ position:'absolute', top:`${SEC.stub}in`, left:0, right:0, bottom:0, background:'rgba(59,130,246,0.04)', pointerEvents:'none' }}>
        <span style={{ position:'absolute', top:18, left:10, fontSize:8, color:'#93c5fd', fontFamily:'sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Vendor / Remittance Copy</span>
      </div>

      <CutLine topIn={SEC.check} label="Detach — Company Record" />
      <CutLine topIn={SEC.stub}  label="Detach — Vendor Copy" />

      {/* ── CHECK FIELDS ── */}
      <div style={{ position:'absolute', top:CHECK.date.top, right:CHECK.date.right, fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{today}</div>
      <div style={{ position:'absolute', top:CHECK.payTo.top, left:CHECK.payTo.left, fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', fontWeight:600, color:'#000', maxWidth:'4.7in', overflow:'hidden', whiteSpace:'nowrap' }}>{ck.vendor_name}</div>
      <div style={{ position:'absolute', top:CHECK.dollarAmt.top, right:CHECK.dollarAmt.right, fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', fontWeight:700, color:'#000', letterSpacing:'0.04em' }}>{formatCurrency(amount).replace('$','')}</div>
      <div style={{ position:'absolute', top:CHECK.words.top, left:CHECK.words.left, fontSize:'11pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000', maxWidth:'6.1in', overflow:'hidden', whiteSpace:'nowrap' }}>{amountToWords(amount)}</div>
      <div style={{ position:'absolute', top:CHECK.memo.top, left:CHECK.memo.left, fontSize:'9.5pt', fontFamily:'Calibri,"Helvetica Neue",Arial,sans-serif', color:'#000' }}>{ck.memo || ''}</div>

      {/* ── COMPANY RECORD (section 2) ── */}
      <div style={{ position:'absolute', top:`${SEC.check + 0.14}in`, bottom:`${11 - SEC.stub + 0.08}in`, left:'0.5in', right:'0.5in', display:'flex', flexDirection:'column' }}>
        <RecordHeader ck={ck} copyLabel="Company Record" today={today} />
        <RemittanceTable ck={ck} />
      </div>

      {/* ── VENDOR COPY (section 3) ── */}
      <div style={{ position:'absolute', top:`${SEC.stub + 0.14}in`, bottom:'0.3in', left:'0.5in', right:'0.5in', display:'flex', flexDirection:'column' }}>
        <RecordHeader ck={ck} copyLabel="Vendor / Remittance Copy" today={today} />
        <RemittanceTable ck={ck} />
      </div>
    </div>
  )
}

export default function PrintVendorCheck({ checks, onClose }) {
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-vendor-css'
    style.textContent = `
      @media print {
        @page { size: 8.5in 11in; margin: 0; }
        body > *:not(#print-vendor-root) { display: none !important; }
        #print-vendor-root { display: block !important; position: static !important; overflow: visible !important; }
        .no-print { display: none !important; }
        .check-page { page-break-after: always; break-after: page; }
        .check-page:last-child { page-break-after: avoid; break-after: avoid; }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-vendor-css')?.remove()
  }, [])

  return (
    <div id="print-vendor-root" style={{ position:'fixed', inset:0, background:'#d1d5db', zIndex:9999, overflowY:'auto' }}>

      {/* Toolbar */}
      <div className="no-print" style={{ position:'sticky', top:0, zIndex:20, background:'#0f172a', color:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 24px', gap:16 }}>
        <div>
          <p style={{ fontWeight:600, fontSize:'14px', margin:0 }}>Print Vendor Checks</p>
          <p style={{ fontSize:'12px', color:'#94a3b8', margin:'2px 0 0' }}>{checks.length} check{checks.length !== 1 ? 's' : ''} · Load check stock before printing</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #334155', color:'#cbd5e1', background:'transparent', cursor:'pointer', fontSize:13 }}>← Back</button>
          <button onClick={() => window.print()} style={{ padding:'8px 20px', borderRadius:8, background:'#6366f1', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, fontSize:13 }}>Print All ({checks.length})</button>
        </div>
      </div>

      <div className="no-print" style={{ background:'#fef3c7', borderBottom:'1px solid #fde68a', padding:'7px 24px', fontSize:'11.5px', color:'#92400e' }}>
        <strong>Sections:</strong> Check stock (top) · Company record (middle) · Vendor remittance copy (bottom)
      </div>

      <div style={{ padding:'28px 24px', display:'flex', flexDirection:'column', gap:44, alignItems:'center' }}>
        {checks.length === 0 && <p style={{ color:'#6b7280', padding:'80px 0', fontSize:14 }}>No checks selected.</p>}
        {checks.map(ck => <VendorCheckPage key={ck.id} ck={ck} />)}
      </div>
    </div>
  )
}
