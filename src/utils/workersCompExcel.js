// Builds the insurance-agent spreadsheet from the workers' comp coverage forms.
// exceljs is imported lazily so it's only downloaded when an admin exports.
import { format, parseISO } from 'date-fns'
import { WC_DEPENDENT_SLOTS, wcReport } from './workersComp'

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

export async function downloadWorkersCompExcel({ forms, missing }, lang = 'en') {
  const R = wcReport(lang)
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'JCCS FieldClock'
  wb.created = new Date()

  // ── Sheet 1: one row per signed form ─────────────────────────────────────
  const ws = wb.addWorksheet(R.sheet, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  const cols = [
    [R.name, 26], [R.plan, 30], [R.taxIdType, 11], [R.taxId, 16],
    [R.dob, 13], [R.phone, 16], [R.email, 28], [R.address, 30], [R.cityStateZip, 24],
    [R.trade, 16], [R.work, 40], [R.propertyType, 14],
    [R.years, 10], [R.start, 14], [R.healthFor, 22], [R.currentIns, 20],
    [R.family, 40], [R.signed, 13], [R.photo, PHOTO_W / 7],
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
          .map((n) => `${d[`dep${n}_name`]} (${R.relLabel(d[`dep${n}_relationship`])}, ${R.dobShort} ${fmtDate(d[`dep${n}_dob`])})`)
          .join('\n')
      : ''
    const row = ws.addRow([
      d.legal_name || f.name,
      R.planLabel(d.plan),
      (d.tax_id_type ?? '').toUpperCase(),
      d.tax_id ?? '',
      fmtDate(d.dob),
      d.phone || f.phone || '',
      d.email || f.email || '',
      d.address ?? '',
      d.city_state_zip ?? '',
      R.tradeLabel(d.trade),
      d.job_duties ?? '',
      R.commercial,
      d.years_experience ?? '',
      fmtDate(d.effective_date),
      premium ? R.tierLabel(d.health_tier) : '',
      premium ? (d.current_insurance ?? '') : '',
      dependents,
      fmtDate(f.signed_at),
      d.id_photo ? '' : R.notOnFile,
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
    const ms = wb.addWorksheet(R.missingSheet)
    ms.columns = [{ header: R.name, width: 28 }, { header: R.phone, width: 16 }, { header: R.email, width: 30 }, { header: R.payType, width: 12 }]
    ms.getRow(1).font = { bold: true }
    missing.forEach((m) => ms.addRow([m.name, m.phone ?? '', m.email ?? '', (m.pay_type ?? '').toUpperCase()]))
  }

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${R.fileName} - ${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
