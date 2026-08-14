// Shared building blocks for every printed-check component (PrintChecks,
// PrintContractorCheck). Pulled out so all check types stay pixel-identical
// in calibration/spacing/typography — if the physical check stock ever needs
// re-calibrating (F/H), fixing it here fixes every check type at once instead
// of drifting out of sync across files.

// ── Amount → words ──────────────────────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function below1000(n) {
  if (n === 0) return ''
  if (n < 20)  return ONES[n] + ' '
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '') + ' '
  return ONES[Math.floor(n / 100)] + ' Hundred ' + below1000(n % 100)
}

export function amountToWords(amount) {
  const dollars = Math.floor(amount)
  const cents   = Math.round((amount - dollars) * 100)
  let words = ''
  if (dollars >= 1000000) words += below1000(Math.floor(dollars / 1000000)) + 'Million '
  if (dollars >= 1000)    words += below1000(Math.floor((dollars % 1000000) / 1000)) + 'Thousand '
  words += below1000(dollars % 1000)
  words = words.trim() || 'Zero'
  return `${words} and ${String(cents).padStart(2, '0')}/100`
}

// Vertical correction for check face fields (calibrated via test print).
// Increase F if fields print too high; decrease if too low. 1mm = 0.0394in.
export const F = 0.098 // ~2.5mm down

// Horizontal correction for the date and dollar-amount fields only (calibrated
// via test print). Negative moves left. 1cm = 0.3937in.
export const H = -0.3937 // ~1cm left

// ── Check field positions — extracted from Keynote templates via PPTX export ─
// All measurements in inches from the physical paper top-left corner.
// Positions match Employee_1099_Check_Template.key
export const CHECK_EMP = {
  date:     { top: `${(0.6832 + F).toFixed(4)}in`, left: `${(6.9466 + H).toFixed(4)}in`, w: '1.3322in' },
  checkNum: { top: `${(1.1906 + F).toFixed(4)}in`, left: `${(7.0050 + H).toFixed(4)}in`, w: '1.2155in' },
  payTo:    { top: `${(1.1906 + F).toFixed(4)}in`, left: '0.9896in', w: '5.6981in' },
  words:    { top: `${(1.5239 + F).toFixed(4)}in`, left: '0.3137in', w: '7.0499in' },
  memo:     { top: `${(2.3646 + F).toFixed(4)}in`, left: '1.0544in', w: '2.5251in' },
}
// Positions match Contractor_Check_Template.key
export const CHECK_CON = {
  date:     { top: `${(0.6832 + F).toFixed(4)}in`, left: `${(6.9466 + H).toFixed(4)}in`, w: '1.3322in' },
  checkNum: { top: `${(1.1906 + F).toFixed(4)}in`, left: `${(7.0050 + H).toFixed(4)}in`, w: '1.2155in' },
  payTo:    { top: `${(1.1973 + F).toFixed(4)}in`, left: '0.9896in', w: '5.6981in' },
  words:    { top: `${(1.5307 + F).toFixed(4)}in`, left: '0.3137in', w: '7.0499in' },
  memo:     { top: `${(2.2158 + F).toFixed(4)}in`, left: '1.0211in', w: '2.5251in' },
  address:  { top: `${(2.4164 + F).toFixed(4)}in`, left: '1.0211in', w: '2.5251in' },
}

// Section cut points (inches from paper top). barcode adjusted -1mm from calibration.
export const SEC = { check: 3.4676, stub: 7.0149, barcode: 10.5228 }

// ── Cut / tear line ─────────────────────────────────────────────────────
// height:0 + borderTop anchors the dashed line to EXACTLY topIn in both
// screen and print — no flex children, no content, nothing that can shift it.
export function CutLine({ topIn, label }) {
  return (
    <div style={{
      position: 'absolute', top: `${topIn}in`, left: 0, right: 0,
      height: 0, overflow: 'visible',
      borderTop: '0.75pt dashed #94a3b8',
      zIndex: 10, pointerEvents: 'none',
    }}>
      <span className="no-print" style={{
        position: 'absolute', left: '50%', top: '-9pt',
        transform: 'translateX(-50%)',
        fontSize: '7pt', color: '#94a3b8', fontFamily: 'Arial, sans-serif',
        letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        background: 'white', padding: '0 8pt', display: 'inline-block',
      }}>
        ✂ {label}
      </span>
    </div>
  )
}

// ── Earnings Statement styles — matches Check_Templates color scheme ────
export const ES = {
  headerBg:  '#6b7fa5',   // steel blue from Keynote template
  headerTxt: '#ffffff',
  accent:    '#4a5f82',   // darker blue for text accents
  border:    '#a8bad0',   // light blue-gray border
  footerBg:  '#eef1f6',   // very light blue-gray footer background
  font:      'Arial, "Helvetica Neue", sans-serif',
}
export const esH = (extra = {}) => ({
  background: ES.headerBg, color: ES.headerTxt,
  fontFamily: ES.font, fontSize: '7pt', fontWeight: 700,
  padding: '3pt 5pt', border: `0.5pt solid ${ES.border}`,
  textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center',
  ...extra,
})
export const esC = (extra = {}) => ({
  fontFamily: ES.font, fontSize: '8pt', color: '#333',
  padding: '3pt 6pt', border: `0.5pt solid ${ES.border}`,
  verticalAlign: 'middle', ...extra,
})

// ── Screen-only section overlays + trim strip, shared by every check page ─
export function SectionOverlays({ middleLabel, bottomLabel }) {
  return (
    <>
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
          {middleLabel}
        </span>
      </div>
      <div className="no-print" style={{
        position: 'absolute', top: `${SEC.stub}in`, left: 0, right: 0,
        height: `${SEC.barcode - SEC.stub}in`, background: 'rgba(59,130,246,0.04)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 18, left: 10, fontSize: 8, color: '#93c5fd', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {bottomLabel}
        </span>
      </div>
      <div className="no-print" style={{
        position: 'absolute', top: `${SEC.barcode}in`, left: 0, right: 0, bottom: 0,
        background: 'rgba(251,191,36,0.07)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', top: 4, left: 10, fontSize: 8, color: '#d97706', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Trim strip
        </span>
      </div>
    </>
  )
}

// ── Shared print stylesheet text — inject into a <style id> tag while a
// print overlay is mounted (see PrintContractorCheck for the pattern).
// Not a hook despite the shape of its usual call site — just a string builder.
export function printStylesheet(id) {
  return `
    @media print {
      @page { size: 8.5in 11in; margin: 0; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body > *:not(#${id}) { display: none !important; }
      #${id} {
        display: block !important;
        position: static !important;
        overflow: visible !important;
        padding: 0 !important;
        margin: 0 !important;
        background: white !important;
      }
      .no-print { display: none !important; }
      #${id} > div:not(.no-print) {
        padding: 0 !important;
        gap: 0 !important;
        display: block !important;
      }
      .check-page {
        page-break-after: always;
        break-after: page;
        box-shadow: none !important;
        margin: 0 !important;
      }
      .check-page:last-child { page-break-after: avoid; break-after: avoid; }
    }
  `
}
