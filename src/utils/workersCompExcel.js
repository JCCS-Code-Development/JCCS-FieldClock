// Builds the insurance-agent spreadsheet from the workers' comp coverage forms.
// exceljs is imported lazily so it's only downloaded when an admin exports.
import { format, parseISO } from 'date-fns'
import { WC_PLANS, WC_TRADES, WC_TIERS, WC_PROPERTY_TYPE, WC_DEPENDENT_SLOTS } from './workersComp'

const labelOf = (list, v) => list.find(([k]) => k === v)?.[1] ?? v ?? ''
const fmtDate = (v) => {
  if (!v) return ''
  try { return format(parseISO(v), 'MM/dd/yyyy') } catch { return v }
}

// Natural size of a data-URL image, to keep the ID photo's aspect ratio.
const imageSize = (src) => new Promise((resolve) => {
  const img = new Image()
  img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
  img.onerror = () => resolve(null)
  img.src = src
})

const PHOTO_W = 220   // px in the sheet
const PHOTO_H = 140

export async function downloadWorkersCompExcel({ forms, missing }) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'JCCS FieldClock'
  wb.created = new Date()

  // ── Sheet 1: one row per signed form ─────────────────────────────────────
  const ws = wb.addWorksheet("Workers' Comp", { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  const cols = [
    ['Full Legal Name', 26], ['Coverage Plan', 30], ['Tax ID Type', 11], ['Tax ID / SSN', 16],
    ['Date of Birth', 13], ['Phone', 16], ['Email', 28], ['Address', 30], ['City, State, ZIP', 24],
    ['Trade', 16], ['Work Description', 40], ['Property Type', 14],
    ['Years Experience', 10], ['Requested Start Date', 14], ['Work Injury (5 yrs)', 10],
    ['Injury Details', 30], ['Health Coverage For', 20], ['Current Health Insurance', 20],
    ['Family Members Covered', 40], ['Form Signed', 13], ['Photo ID', PHOTO_W / 7],
  ]
  ws.columns = cols.map(([header, width]) => ({ header, width }))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D2B4E' } }
  head.alignment = { vertical: 'middle', wrapText: true }
  head.height = 32

  const photoCol = cols.length - 1   // 0-based
  for (const [i, f] of forms.entries()) {
    const d = f.form_data ?? {}
    const premium = d.plan === 'premium'
    const dependents = premium && d.health_tier !== 'self'
      ? Array.from({ length: WC_DEPENDENT_SLOTS }, (_, k) => k + 1)
          .filter((n) => d[`dep${n}_name`]?.trim())
          .map((n) => `${d[`dep${n}_name`]} (${d[`dep${n}_relationship`] ?? ''}, DOB ${fmtDate(d[`dep${n}_dob`])})`)
          .join('\n')
      : ''
    const row = ws.addRow([
      d.legal_name || f.name,
      WC_PLANS[d.plan ?? 'ghost']?.en.replace(' (default)', '') ?? d.plan,
      (d.tax_id_type ?? '').toUpperCase(),
      d.tax_id ?? '',
      fmtDate(d.dob),
      d.phone || f.phone || '',
      d.email || f.email || '',
      d.address ?? '',
      d.city_state_zip ?? '',
      labelOf(WC_TRADES, d.trade),
      d.job_duties ?? '',
      WC_PROPERTY_TYPE,
      d.years_experience ?? '',
      fmtDate(d.effective_date),
      d.prior_injury === 'yes' ? 'Yes' : d.prior_injury === 'no' ? 'No' : '',
      d.prior_injury_details ?? '',
      premium ? labelOf(WC_TIERS, d.health_tier ?? 'self').replace(/^Me/, 'Employee') : '',
      premium ? (d.current_insurance ?? '') : '',
      dependents,
      fmtDate(f.signed_at),
      d.id_photo ? '' : 'Not on file',
    ])
    row.alignment = { vertical: 'top', wrapText: true }
    ws.getCell(row.number, 4).numFmt = '@'   // keep leading zeros in SSNs

    if (d.id_photo) {
      const m = d.id_photo.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
      if (m && m[1] !== 'webp') {
        const size = await imageSize(d.id_photo)
        const scale = size ? Math.min(PHOTO_W / size.w, PHOTO_H / size.h) : 1
        const id = wb.addImage({ base64: m[2], extension: m[1] === 'jpeg' ? 'jpeg' : 'png' })
        ws.addImage(id, {
          tl: { col: photoCol + 0.05, row: row.number - 1 + 0.05 },
          ext: { width: size ? size.w * scale : PHOTO_W, height: size ? size.h * scale : PHOTO_H },
          editAs: 'oneCell',
        })
        row.height = PHOTO_H * 0.75 + 8   // px → points
      }
    }
    if (i % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }

  // ── Sheet 2: who still hasn't filled it out ──────────────────────────────
  if (missing?.length) {
    const ms = wb.addWorksheet('Not Yet Submitted')
    ms.columns = [{ header: 'Name', width: 28 }, { header: 'Phone', width: 16 }, { header: 'Email', width: 30 }, { header: 'Pay Type', width: 10 }]
    ms.getRow(1).font = { bold: true }
    missing.forEach((m) => ms.addRow([m.name, m.phone ?? '', m.email ?? '', (m.pay_type ?? '').toUpperCase()]))
  }

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `JCCS Workers Comp - ${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
