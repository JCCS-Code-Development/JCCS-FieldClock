import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, parseISO } from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import PageHeader from '../../components/admin/PageHeader'
import Button from '../../components/ui/Button'
import { listEmployees } from '../../api/employees'
import { getSummary, getBreakdown, listAdjustments, getAnnualSummary } from '../../api/payroll'
import { getPeriodLoanTotals } from '../../api/loans'
import { formatCurrency } from '../../utils/format'

// ─── Company constants ────────────────────────────────────────────────────────
const COMPANY = {
  name:    'JCCS Services LLC',
  address: '1200 Woodruff Rd, Greenville, SC 29607, Suite B-3',
  phone:   '864-907-9052',
}

// ─── Period helpers ───────────────────────────────────────────────────────────
const PERIODS = Array.from({ length: 16 }, (_, i) => {
  const s = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
  const e = endOfWeek(s, { weekStartsOn: 1 })
  return {
    label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${format(s, 'MMM d')} – ${format(e, 'MMM d')}`,
    start: format(s, 'yyyy-MM-dd'),
    end:   format(e, 'yyyy-MM-dd'),
  }
})

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

// Splits an arbitrary date range into its individual Mon–Sun pay weeks
function weeksInRange(startStr, endStr) {
  const weeks = []
  let cur = startOfWeek(parseISO(startStr), { weekStartsOn: 1 })
  const rangeEnd = parseISO(endStr)
  let guard = 0
  while (cur <= rangeEnd && guard < 260) { // safety cap: 5 years of weeks
    const weekEnd = endOfWeek(cur, { weekStartsOn: 1 })
    weeks.push({
      label: `${format(cur, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`,
      start: format(cur, 'yyyy-MM-dd'),
      end:   format(weekEnd, 'yyyy-MM-dd'),
    })
    cur = addWeeks(cur, 1)
    guard++
  }
  return weeks
}

const PURPOSES = [
  { value: 'general',     label: 'General Purpose' },
  { value: 'housing',     label: 'Housing / Rental Application' },
  { value: 'bank',        label: 'Bank / Loan Application' },
  { value: 'immigration', label: 'Visa / Immigration' },
  { value: 'government',  label: 'Government Benefits' },
]

// ─── Document type definitions ────────────────────────────────────────────────
const DOC_TYPES = [
  {
    id: 'paystub',
    title: 'Pay Stub',
    desc: 'Official weekly pay stub for any employee and period.',
    color: 'bg-indigo-50 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  {
    id: 'letter',
    title: 'Employment & Salary Verification',
    desc: 'Proof of employment letter on company letterhead.',
    color: 'bg-emerald-50 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  {
    id: 'annual',
    title: 'Annual Earnings Summary',
    desc: 'Quarterly pay breakdown for the accountant — tax season.',
    color: 'bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
  },
  {
    id: 'timesheet',
    title: 'Timesheet Record',
    desc: 'Detailed time log with entry-level breakdown for any date range.',
    color: 'bg-sky-50 border-sky-200',
    dot: 'bg-sky-500',
  },
  {
    id: 'register',
    title: 'Payroll Register',
    desc: 'Full payroll summary for all employees in a given period.',
    color: 'bg-violet-50 border-violet-200',
    dot: 'bg-violet-500',
  },
  {
    id: 'contractor',
    title: '1099 Employee Summary',
    desc: 'Annual payments per 1099 employee — for issuing 1099-NEC.',
    color: 'bg-rose-50 border-rose-200',
    dot: 'bg-rose-500',
  },
]

// ─── Shared inline styles ─────────────────────────────────────────────────────
const th = {
  padding: '6px 10px',
  textAlign: 'left',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
}
const td = {
  padding: '7px 10px',
  fontSize: '0.82rem',
  borderBottom: '1px solid #f1f5f9',
  color: '#1e293b',
}

// ─── Shared document header ───────────────────────────────────────────────────
const DOC_BLUE = '#1e3a8a'

function DocHeader({ title, ein }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/jccs-logo.jpg" alt="JCCS Services" style={{ height: '54px', width: 'auto' }} />
          <div>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.15 }}>{COMPANY.name}</p>
            <p style={{ fontSize: '0.78rem', color: '#334155', margin: '3px 0 0' }}>{COMPANY.address}</p>
            <p style={{ fontSize: '0.78rem', color: '#334155', margin: '1px 0 0' }}>{COMPANY.phone}{ein ? ` · EIN: ${ein}` : ''}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '1.15rem', fontWeight: 800, color: DOC_BLUE, textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0, lineHeight: 1.2, maxWidth: '220px' }}>{title}</p>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '4px 0 0' }}>Generated: {format(new Date(), 'MMMM d, yyyy')}</p>
        </div>
      </div>
      <div style={{ borderBottom: `2.5px solid ${DOC_BLUE}`, marginTop: '14px', marginBottom: '20px' }} />
    </div>
  )
}

// ─── Doc 1: Pay Stub ──────────────────────────────────────────────────────────
function PayStubDoc({ emp, summary, adjustments, loanDed, period, ein }) {
  const _gasAdjs  = adjustments.filter((a) => a.type === 'gas_allowance')
  const otherAdjs = adjustments.filter((a) => a.type !== 'gas_allowance')
  const gasTotal  = summary.gas_total ?? 0
  const _bonusAmt = otherAdjs.reduce((s, a) => s + parseFloat(a.amount), 0)
  const netPay    = Math.max((summary.estimated_total ?? 0) - loanDed, 0)
  const isSalary  = (summary.pay_structure ?? 'hourly') === 'salary'

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.7, padding: '0.5rem 0' }}>
      <DocHeader title="Pay Stub" ein={ein} />

      {/* Employee + Period */}
      <div style={{ display: 'flex', gap: '3rem', marginBottom: '20px' }}>
        <InfoBlock label="Employee">
          <p style={{ fontWeight: 700, margin: 0 }}>{emp.name}</p>
          <p style={{ margin: 0 }}>{emp.pay_type?.toUpperCase()} · {isSalary ? 'Salaried' : 'Hourly'}</p>
          <p style={{ margin: 0 }}>{isSalary ? `${formatCurrency(emp.pay_rate)}/week` : `${formatCurrency(emp.pay_rate)}/hr`}</p>
        </InfoBlock>
        <InfoBlock label="Pay Period">
          <p style={{ fontWeight: 700, margin: 0 }}>{format(parseISO(period.start), 'MMMM d')} – {format(parseISO(period.end), 'MMMM d, yyyy')}</p>
          <p style={{ margin: 0 }}>{summary.weeks_worked ?? 1} week(s) worked</p>
        </InfoBlock>
      </div>

      {/* Earnings */}
      <SectionLabel>Earnings</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={th}>Description</th>
            <th style={{ ...th, textAlign: 'right' }}>Hours / Units</th>
            <th style={{ ...th, textAlign: 'right' }}>Rate</th>
            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {isSalary ? (
            <tr>
              <td style={td}>Weekly Salary ({summary.weeks_worked ?? 1} wk)</td>
              <td style={{ ...td, textAlign: 'right' }}>{(summary.regular_hours ?? 0).toFixed(1)} hrs logged</td>
              <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(emp.pay_rate)}/wk</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(summary.base_gross ?? 0)}</td>
            </tr>
          ) : (
            <>
              <tr>
                <td style={td}>Regular Hours</td>
                <td style={{ ...td, textAlign: 'right' }}>{(summary.regular_hours ?? 0).toFixed(2)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(emp.pay_rate)}/hr</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency((summary.regular_hours ?? 0) * emp.pay_rate)}</td>
              </tr>
              {(summary.overtime_hours ?? 0) > 0 && (
                <tr>
                  <td style={td}>Overtime Hours (×1.5)</td>
                  <td style={{ ...td, textAlign: 'right' }}>{(summary.overtime_hours ?? 0).toFixed(2)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(summary.overtime_rate ?? emp.pay_rate * 1.5)}/hr</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency((summary.overtime_hours ?? 0) * (summary.overtime_rate ?? emp.pay_rate * 1.5))}</td>
                </tr>
              )}
            </>
          )}
          {gasTotal > 0 && (
            <tr>
              <td style={td}>Gas Allowance</td>
              <td style={{ ...td, textAlign: 'right' }}>—</td>
              <td style={{ ...td, textAlign: 'right' }}>—</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(gasTotal)}</td>
            </tr>
          )}
          {otherAdjs.map((a, i) => (
            <tr key={i}>
              <td style={td}>{a.type.replace(/_/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase())}{a.description ? ` — ${a.description}` : ''}</td>
              <td style={{ ...td, textAlign: 'right' }}>—</td>
              <td style={{ ...td, textAlign: 'right' }}>—</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(a.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Deductions */}
      {loanDed > 0 && (
        <>
          <SectionLabel>Deductions</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
            <thead>
              <tr style={{ background: '#fef2f2' }}>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}>Loan Repayment</td>
                <td style={{ ...td, textAlign: 'right', color: '#ef4444' }}>−{formatCurrency(loanDed)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Net Pay box */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <table style={{ width: '260px', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
          <tbody>
            <tr>
              <td style={{ ...td, background: '#f8fafc' }}>Gross Pay</td>
              <td style={{ ...td, textAlign: 'right', background: '#f8fafc' }}>{formatCurrency(summary.estimated_total ?? 0)}</td>
            </tr>
            {loanDed > 0 && (
              <tr>
                <td style={{ ...td, color: '#ef4444' }}>Loan Deduction</td>
                <td style={{ ...td, textAlign: 'right', color: '#ef4444' }}>−{formatCurrency(loanDed)}</td>
              </tr>
            )}
            <tr style={{ background: '#0f172a' }}>
              <td style={{ padding: '10px', fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>NET PAY</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#fff', fontSize: '1.05rem' }}>{formatCurrency(netPay)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocFooter />
    </div>
  )
}

// ─── Doc 1b: Monthly Earnings Statement (multiple weeks combined) ─────────────
function MonthlyEarningsDoc({ emp, monthKey, weekStubs, ein }) {
  const isSalary   = (weekStubs[0]?.summary?.pay_structure ?? 'hourly') === 'salary'
  const monthLabel = format(parseISO(`${monthKey}-01`), 'MMMM yyyy')

  const totals = weekStubs.reduce((acc, ws) => {
    const gross = ws.summary.estimated_total ?? 0
    const net   = Math.max(gross - ws.loanDed, 0)
    return {
      hours: acc.hours + (ws.summary.regular_hours ?? 0) + (ws.summary.overtime_hours ?? 0),
      gross: acc.gross + gross,
      loanDed: acc.loanDed + ws.loanDed,
      net: acc.net + net,
    }
  }, { hours: 0, gross: 0, loanDed: 0, net: 0 })

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.7, padding: '0.5rem 0' }}>
      <DocHeader title="Monthly Earnings Statement" ein={ein} />

      <div style={{ display: 'flex', gap: '3rem', marginBottom: '20px' }}>
        <InfoBlock label="Employee">
          <p style={{ fontWeight: 700, margin: 0 }}>{emp.name}</p>
          <p style={{ margin: 0 }}>{emp.pay_type?.toUpperCase()} · {isSalary ? 'Salaried' : 'Hourly'}</p>
          <p style={{ margin: 0 }}>{isSalary ? `${formatCurrency(emp.pay_rate)}/week` : `${formatCurrency(emp.pay_rate)}/hr`}</p>
        </InfoBlock>
        <InfoBlock label="Month">
          <p style={{ fontWeight: 700, margin: 0 }}>{monthLabel}</p>
          <p style={{ margin: 0 }}>{weekStubs.length} week(s) included</p>
        </InfoBlock>
      </div>

      <SectionLabel>Weekly Breakdown</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={th}>Week</th>
            <th style={{ ...th, textAlign: 'right' }}>Hours</th>
            <th style={{ ...th, textAlign: 'right' }}>Gross Pay</th>
            <th style={{ ...th, textAlign: 'right' }}>Deductions</th>
            <th style={{ ...th, textAlign: 'right' }}>Net Pay</th>
          </tr>
        </thead>
        <tbody>
          {weekStubs.map((ws, i) => {
            const gross = ws.summary.estimated_total ?? 0
            const net   = Math.max(gross - ws.loanDed, 0)
            const hours = (ws.summary.regular_hours ?? 0) + (ws.summary.overtime_hours ?? 0)
            return (
              <tr key={i}>
                <td style={td}>{format(parseISO(ws.period.start), 'MMM d')} – {format(parseISO(ws.period.end), 'MMM d')}</td>
                <td style={{ ...td, textAlign: 'right' }}>{isSalary ? '—' : hours.toFixed(2)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(gross)}</td>
                <td style={{ ...td, textAlign: 'right', color: ws.loanDed > 0 ? '#ef4444' : undefined }}>
                  {ws.loanDed > 0 ? `−${formatCurrency(ws.loanDed)}` : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(net)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <table style={{ width: '280px', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
          <tbody>
            <tr>
              <td style={{ ...td, background: '#f8fafc' }}>Total Gross Pay</td>
              <td style={{ ...td, textAlign: 'right', background: '#f8fafc' }}>{formatCurrency(totals.gross)}</td>
            </tr>
            {totals.loanDed > 0 && (
              <tr>
                <td style={{ ...td, color: '#ef4444' }}>Total Loan Deductions</td>
                <td style={{ ...td, textAlign: 'right', color: '#ef4444' }}>−{formatCurrency(totals.loanDed)}</td>
              </tr>
            )}
            <tr style={{ background: '#0f172a' }}>
              <td style={{ padding: '10px', fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>MONTH NET PAY</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#fff', fontSize: '1.05rem' }}>{formatCurrency(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DocFooter />
    </div>
  )
}

// ─── Doc 2: Employment & Salary Verification Letter ───────────────────────────
const LETTER_I18N = {
  en: {
    docTitle:     'Employment Verification',
    issuedLabel:  'Date of issuance',
    salutation:   'To Whom It May Concern,',
    purposeLabels: {
      general:     'general purposes',
      housing:     'housing / rental application purposes',
      bank:        'bank or loan application purposes',
      immigration: 'visa or immigration purposes',
      government:  'government benefit application purposes',
    },
    confirm: (name, verb, company, jobTitle, purposeLabel) => (
      <>This letter is to confirm that <strong>{name}</strong> is currently {verb} <strong>{company}</strong>
        {jobTitle && <> in the position of <strong>{jobTitle}</strong></>}. This letter is being issued upon request for {purposeLabel}.</>
    ),
    verbEmployed:    'employed with',
    verbIndependent: <>engaged as an <strong>independent contractor</strong> by</>,
    clientServed: (name, client) => <>{name} renders independent contractor services to <strong>{client}</strong>.</>,
    activity:     (name, act)    => <>The activity {name} performs as an independent contractor consists of: <strong>{act}</strong>.</>,
    startDate:    (name, date)   => <>{name} began this work on <strong>{date}</strong>.</>,
    compensation: (name, payDesc) => <>{name}'s current rate of compensation is <strong>{payDesc}</strong>.</>,
    avgIncome:    (name, amount)  => <> {name}'s average total income is <strong>{amount}</strong>.</>,
    payWeekly:  'per week (salaried)',
    payHourly:  (type) => `per hour (hourly, ${type})`,
    closing: (phone) => <>Should you require any additional information or have any questions regarding this matter, please do not hesitate to contact our office at {phone}.</>,
    sincerely:   'Sincerely,',
    signerTitle: 'Authorized Representative',
    dateFmt:     'MMMM d, yyyy',
  },
  es: {
    docTitle:     'Verificación de Empleo y Salario',
    issuedLabel:  'Fecha de expedición',
    salutation:   'A Quien Corresponda,',
    purposeLabels: {
      general:     'fines generales',
      housing:     'trámites de vivienda o arrendamiento',
      bank:        'trámites bancarios o de crédito',
      immigration: 'trámites de visa o inmigración',
      government:  'solicitud de beneficios gubernamentales',
    },
    confirm: (name, verb, company, jobTitle, purposeLabel) => (
      <>Por medio de la presente se confirma que <strong>{name}</strong> actualmente {verb} <strong>{company}</strong>
        {jobTitle && <> en el cargo de <strong>{jobTitle}</strong></>}. Esta carta se expide a solicitud del interesado para efectos de {purposeLabel}.</>
    ),
    verbEmployed:    'se encuentra empleado(a) con',
    verbIndependent: <>presta sus servicios como <strong>contratista independiente</strong> para</>,
    clientServed: (name, client) => <>{name} presta servicios como contratista independiente a <strong>{client}</strong>.</>,
    activity:     (name, act)    => <>La actividad que {name} realiza como contratista independiente consiste en: <strong>{act}</strong>.</>,
    startDate:    (name, date)   => <>{name} inició esta labor el <strong>{date}</strong>.</>,
    compensation: (name, payDesc) => <>La tarifa de compensación actual de {name} es de <strong>{payDesc}</strong>.</>,
    avgIncome:    (name, amount)  => <> El ingreso total promedio de {name} es de <strong>{amount}</strong>.</>,
    payWeekly:  'por semana (salario fijo)',
    payHourly:  (type) => `por hora (${type})`,
    closing: (phone) => <>Si requiere información adicional o tiene alguna pregunta al respecto, no dude en comunicarse con nuestra oficina al {phone}.</>,
    sincerely:   'Atentamente,',
    signerTitle: 'Representante Autorizado',
    dateFmt:     "d 'de' MMMM 'de' yyyy",
  },
}

function EmploymentLetterDoc({
  emp, jobTitle, purpose, ein, sigName, sigTitle,
  clientServed, activity, startDate, avgIncome, language = 'en',
}) {
  const T = LETTER_I18N[language] ?? LETTER_I18N.en
  const dateOpts = language === 'es' ? { locale: esLocale } : undefined
  const today = format(new Date(), T.dateFmt, dateOpts)
  const isSalary      = (emp.pay_structure ?? 'hourly') === 'salary'
  const isIndependent = emp.pay_type === '1099'
  const payDesc = isSalary
    ? `${formatCurrency(emp.pay_rate)} ${T.payWeekly}`
    : `${formatCurrency(emp.pay_rate)} ${T.payHourly(emp.pay_type?.toUpperCase())}`
  const startDateFmt = startDate ? format(parseISO(startDate), T.dateFmt, dateOpts) : null

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.9 }}>
      <DocHeader title={T.docTitle} ein={ein} />

      <p style={{ marginBottom: '1.5rem' }}>{T.issuedLabel}: {today}</p>
      <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{T.salutation}</p>

      <p style={{ marginBottom: '1rem' }}>
        {T.confirm(
          emp.name,
          isIndependent ? T.verbIndependent : T.verbEmployed,
          COMPANY.name,
          jobTitle,
          T.purposeLabels[purpose] ?? T.purposeLabels.general
        )}
      </p>

      {isIndependent && clientServed && (
        <p style={{ marginBottom: '1rem' }}>{T.clientServed(emp.name, clientServed)}</p>
      )}

      {isIndependent && activity && (
        <p style={{ marginBottom: '1rem' }}>{T.activity(emp.name, activity)}</p>
      )}

      {startDateFmt && (
        <p style={{ marginBottom: '1rem' }}>{T.startDate(emp.name, startDateFmt)}</p>
      )}

      <p style={{ marginBottom: '1rem' }}>
        {T.compensation(emp.name, payDesc)}
        {avgIncome && T.avgIncome(emp.name, avgIncome)}
      </p>

      <p style={{ marginBottom: '2rem' }}>{T.closing(COMPANY.phone)}</p>

      <p style={{ marginBottom: '5rem' }}>{T.sincerely}</p>

      <div style={{ borderTop: '1px solid #1e293b', width: '240px', paddingTop: '6px' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{sigName || '____________________________'}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{sigTitle || T.signerTitle}</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{COMPANY.name}</p>
      </div>

      <DocFooter />
    </div>
  )
}

// ─── Doc 3: Annual Earnings Summary ──────────────────────────────────────────
function AnnualSummaryDoc({ employees, year, ein }) {
  const QTR_LABELS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)']
  const FIELDS = [
    { key: 'hours',    label: 'Hours Worked',    fmt: (v) => v.toFixed(1) },
    { key: 'base',     label: 'Base Wages',       fmt: formatCurrency },
    { key: 'gas',      label: 'Gas Allowance',    fmt: formatCurrency },
    { key: 'bonus',    label: 'Bonuses / Adj.',   fmt: formatCurrency },
    { key: 'loan_ded', label: 'Loan Deductions',  fmt: (v) => v > 0 ? `(${formatCurrency(v)})` : '—' },
    { key: 'gross',    label: 'Gross Pay',        fmt: formatCurrency, bold: true },
    { key: 'net',      label: 'Net Pay',          fmt: formatCurrency, bold: true, accent: true },
  ]

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.6 }}>
      <DocHeader title={`Annual Earnings Summary — ${year}`} ein={ein} />

      <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
        This summary is for internal records and tax preparation. Amounts shown are total compensation paid per quarter.
        Consult a licensed CPA for tax filing purposes.
      </p>

      {employees.map((emp) => (
        <div key={emp.user_id} style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
          <div style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: '4px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>{emp.name}</span>
            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
              {emp.pay_type?.toUpperCase()} · {emp.pay_structure === 'salary' ? 'Salaried' : 'Hourly'}
              {emp.pay_structure === 'salary'
                ? ` · ${formatCurrency(emp.pay_rate)}/wk`
                : ` · ${formatCurrency(emp.pay_rate)}/hr`}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}> </th>
                {QTR_LABELS.map((q) => <th key={q} style={{ ...th, textAlign: 'right' }}>{q}</th>)}
                <th style={{ ...th, textAlign: 'right', color: '#0f172a' }}>Annual Total</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(({ key, label, fmt, bold, accent }) => {
                const anyNonZero = [1,2,3,4].some((q) => (emp.quarters[q]?.[key] ?? 0) !== 0) || emp.annual[key] !== 0
                if (!anyNonZero) return null
                return (
                  <tr key={key} style={accent ? { background: '#0f172a' } : bold ? { background: '#f8fafc' } : {}}>
                    <td style={{ ...td, fontWeight: bold ? 700 : 400, color: accent ? '#fff' : undefined }}>{label}</td>
                    {[1,2,3,4].map((q) => (
                      <td key={q} style={{ ...td, textAlign: 'right', color: accent ? '#fff' : (key === 'loan_ded' && (emp.quarters[q]?.[key] ?? 0) > 0 ? '#ef4444' : undefined) }}>
                        {fmt(emp.quarters[q]?.[key] ?? 0)}
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: accent ? '#fff' : undefined }}>
                      {fmt(emp.annual[key] ?? 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <DocFooter />
    </div>
  )
}

// ─── Doc 4: Timesheet Record ──────────────────────────────────────────────────
function TimesheetRecordDoc({ emp, breakdown, start, end, ein }) {
  const CATEGORY_LABELS = {
    direct_labor:    'Working',
    travel:          'Traveling',
    paid_lunch:      'Lunch',
    material_pickup: 'Material Run',
    waiting_time:    'Waiting',
    admin_photos:    'Admin Photos',
    rework:          'Rework',
  }
  const totalMins = Object.values(breakdown).flat().reduce((s, e) => s + (e.minutes ?? 0), 0)
  const approvedMins = Object.values(breakdown).flat().filter((e) => e.approval_status === 'approved').reduce((s, e) => s + (e.minutes ?? 0), 0)
  const fmtMins = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  const fmtTime = (ts) => { try { return format(new Date(ts), 'h:mm a') } catch { return '—' } }

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.6 }}>
      <DocHeader title="Timesheet Record" ein={ein} />

      <div style={{ display: 'flex', gap: '3rem', marginBottom: '20px' }}>
        <InfoBlock label="Employee"><p style={{ fontWeight: 700, margin: 0 }}>{emp.name}</p><p style={{ margin: 0 }}>{emp.pay_type?.toUpperCase()}</p></InfoBlock>
        <InfoBlock label="Date Range"><p style={{ fontWeight: 700, margin: 0 }}>{format(parseISO(start), 'MMMM d, yyyy')} – {format(parseISO(end), 'MMMM d, yyyy')}</p></InfoBlock>
        <InfoBlock label="Totals">
          <p style={{ margin: 0 }}>Total: <strong>{fmtMins(totalMins)}</strong></p>
          <p style={{ margin: 0 }}>Approved: <strong>{fmtMins(approvedMins)}</strong></p>
        </InfoBlock>
      </div>

      {Object.entries(breakdown).sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => {
        const dayMins = entries.reduce((s, e) => s + (e.minutes ?? 0), 0)
        return (
          <div key={date} style={{ marginBottom: '16px', pageBreakInside: 'avoid' }}>
            <div style={{ background: '#f1f5f9', padding: '5px 10px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '3px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{format(parseISO(date), 'EEEE, MMMM d, yyyy')}</span>
              <span>{fmtMins(dayMins)} total</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Time In</th>
                  <th style={th}>Time Out</th>
                  <th style={{ ...th, textAlign: 'right' }}>Duration</th>
                  <th style={th}>Activity</th>
                  <th style={th}>Job</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={td}>{fmtTime(entry.start_time)}</td>
                    <td style={td}>{entry.end_time ? fmtTime(entry.end_time) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMins(entry.minutes ?? 0)}</td>
                    <td style={td}>{CATEGORY_LABELS[entry.cost_category] ?? entry.cost_category}</td>
                    <td style={{ ...td, color: '#64748b' }}>{entry.job_name ?? '—'}</td>
                    <td style={td}>
                      <span style={{
                        padding: '2px 7px',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: entry.approval_status === 'approved' ? '#dcfce7' : entry.approval_status === 'rejected' ? '#fee2e2' : '#fef3c7',
                        color:      entry.approval_status === 'approved' ? '#166534' : entry.approval_status === 'rejected' ? '#991b1b' : '#92400e',
                      }}>
                        {entry.approval_status?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {Object.keys(breakdown).length === 0 && (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>No time entries found for this period.</p>
      )}

      <DocFooter />
    </div>
  )
}

// ─── Doc 5: Payroll Register ──────────────────────────────────────────────────
function PayrollRegisterDoc({ summaryData, adjustments, loanDeductions, period, ein }) {
  const gasByUser   = {}
  const bonusByUser = {}
  adjustments.forEach((a) => {
    if (a.type === 'gas_allowance') gasByUser[a.user_id] = (gasByUser[a.user_id] ?? 0) + parseFloat(a.amount)
    else bonusByUser[a.user_id] = (bonusByUser[a.user_id] ?? 0) + parseFloat(a.amount)
  })
  const totals = { reg: 0, ot: 0, base: 0, gas: 0, bonus: 0, loan: 0, gross: 0, net: 0 }

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.8rem', color: '#1e293b', lineHeight: 1.5 }}>
      <DocHeader title="Payroll Register" ein={ein} />

      <p style={{ marginBottom: '12px' }}>
        <strong>Pay Period:</strong> {format(parseISO(period.start), 'MMMM d')} – {format(parseISO(period.end), 'MMMM d, yyyy')}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f172a' }}>
            {['Employee','Type','Reg Hrs','OT Hrs','Base Pay','Gas','Bonus','Loan Ded.','Gross','Net Pay'].map((h) => (
              <th key={h} style={{ ...th, color: '#cbd5e1', background: 'transparent', borderBottom: 'none', textAlign: h === 'Employee' || h === 'Type' ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaryData.map((emp) => {
            const gas  = (emp.gas_total ?? 0) + (gasByUser[emp.user_id] ?? 0)
            const bon  = bonusByUser[emp.user_id] ?? 0
            const loan = loanDeductions[emp.user_id] ?? 0
            const gross = emp.estimated_total ?? 0
            const net   = Math.max(gross - loan, 0)
            totals.reg   += emp.regular_hours  ?? 0
            totals.ot    += emp.overtime_hours ?? 0
            totals.base  += emp.base_gross     ?? 0
            totals.gas   += gas
            totals.bonus += bon
            totals.loan  += loan
            totals.gross += gross
            totals.net   += net
            return (
              <tr key={emp.user_id}>
                <td style={td}><strong>{emp.name}</strong></td>
                <td style={td}><span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{emp.pay_type?.toUpperCase()}</span></td>
                <td style={{ ...td, textAlign: 'right' }}>{(emp.regular_hours ?? 0).toFixed(1)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{(emp.overtime_hours ?? 0).toFixed(1)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(emp.base_gross ?? 0)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{gas > 0 ? formatCurrency(gas) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{bon > 0 ? formatCurrency(bon) : '—'}</td>
                <td style={{ ...td, textAlign: 'right', color: loan > 0 ? '#ef4444' : undefined }}>{loan > 0 ? `(${formatCurrency(loan)})` : '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(gross)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(net)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: '#0f172a' }}>
            <td style={{ ...td, color: '#fff', fontWeight: 700 }}>TOTAL</td>
            <td style={td}></td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{totals.reg.toFixed(1)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{totals.ot.toFixed(1)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{formatCurrency(totals.base)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{formatCurrency(totals.gas)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{formatCurrency(totals.bonus)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fca5a5', fontWeight: 700 }}>{totals.loan > 0 ? `(${formatCurrency(totals.loan)})` : '—'}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{formatCurrency(totals.gross)}</td>
            <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{formatCurrency(totals.net)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Signature row */}
      <div style={{ marginTop: '36px', display: 'flex', gap: '4rem' }}>
        {['Prepared by', 'Approved by'].map((label) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #1e293b', marginBottom: '6px', height: '28px' }}></div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{label}</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Date: _______________</p>
          </div>
        ))}
      </div>

      <DocFooter />
    </div>
  )
}

// ─── Doc 6: 1099 Contractor Summary ──────────────────────────────────────────
function Contractor1099Doc({ employees, year, ein }) {
  const contractors = employees.filter((e) => e.pay_type === '1099')
  const total       = contractors.reduce((s, e) => s + (e.annual?.gross ?? 0), 0)

  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.7 }}>
      <DocHeader title={`1099 Employee Summary — ${year}`} ein={ein} />

      <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
        The following independent contractors received payments totaling $600 or more during tax year {year}.
        This summary is for reference when preparing 1099-NEC filings. Consult your CPA for filing requirements.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={th}>Contractor Name</th>
            <th style={{ ...th, textAlign: 'right' }}>Total Hours</th>
            <th style={{ ...th, textAlign: 'right' }}>Base Compensation</th>
            <th style={{ ...th, textAlign: 'right' }}>Adjustments / Gas</th>
            <th style={{ ...th, textAlign: 'right' }}>Total Paid</th>
            <th style={{ ...th, textAlign: 'center' }}>1099-NEC Required?</th>
          </tr>
        </thead>
        <tbody>
          {contractors.length === 0 && (
            <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>No 1099 employees found for {year}.</td></tr>
          )}
          {contractors.map((emp) => {
            const adj  = (emp.annual?.gas ?? 0) + (emp.annual?.bonus ?? 0)
            const paid = emp.annual?.gross ?? 0
            return (
              <tr key={emp.user_id}>
                <td style={td}><strong>{emp.name}</strong></td>
                <td style={{ ...td, textAlign: 'right' }}>{(emp.annual?.hours ?? 0).toFixed(1)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(emp.annual?.base ?? 0)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{adj > 0 ? formatCurrency(adj) : '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(paid)}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '3px', fontSize: '0.72rem', fontWeight: 700,
                    background: paid >= 600 ? '#dcfce7' : '#f1f5f9',
                    color:      paid >= 600 ? '#166534' : '#64748b',
                  }}>
                    {paid >= 600 ? 'YES' : 'NO (< $600)'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        {contractors.length > 0 && (
          <tfoot>
            <tr style={{ background: '#0f172a' }}>
              <td style={{ ...td, color: '#fff', fontWeight: 700 }}>TOTAL</td>
              <td style={{ ...td, textAlign: 'right', color: '#fff' }}>{contractors.reduce((s,e)=>s+(e.annual?.hours??0),0).toFixed(1)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#fff' }}>{formatCurrency(contractors.reduce((s,e)=>s+(e.annual?.base??0),0))}</td>
              <td style={{ ...td, textAlign: 'right', color: '#fff' }}>{formatCurrency(contractors.reduce((s,e)=>s+(e.annual?.gas??0)+(e.annual?.bonus??0),0))}</td>
              <td style={{ ...td, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{formatCurrency(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>

      <DocFooter />
    </div>
  )
}

// ─── Micro helpers ────────────────────────────────────────────────────────────
function InfoBlock({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>{label}</p>
      {children}
    </div>
  )
}
function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '16px 0 4px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
      {children}
    </p>
  )
}
function DocFooter() {
  return (
    <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
      CONFIDENTIAL — This document contains private employment information. Generated by JCCS FieldClock · {COMPANY.name} · {format(new Date(), 'MMMM d, yyyy')}
    </p>
  )
}

// ─── Print overlay wrapper ────────────────────────────────────────────────────
function PrintOverlay({ children, onClose }) {
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'doc-print-css'
    s.textContent = `
      @media print {
        @page { size: letter; margin: 0.7in 0.75in; }
        body > *:not(#doc-print-root) { display: none !important; }
        .no-print { display: none !important; }
        #doc-print-root { position: static !important; overflow: visible !important; padding: 0 !important; }
      }
    `
    document.head.appendChild(s)
    return () => document.getElementById('doc-print-css')?.remove()
  }, [])

  return createPortal(
    <div id="doc-print-root" style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 9999, overflowY: 'auto', padding: '1.5rem 2rem' }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 20px', background: '#6366f1', color: '#fff', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Print / Save PDF
        </button>
        <button
          onClick={onClose}
          style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Close Preview
        </button>
        <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: '8px' }}>
          Tip: In the print dialog choose "Save as PDF" to keep a digital copy.
        </span>
      </div>
      <div style={{ maxWidth: '8in', margin: '0 auto' }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

// ─── Select + Input helpers ───────────────────────────────────────────────────
function FormSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
      <select
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 bg-white"
        value={value} onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  )
}
function FormInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
      <input
        type={type}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      />
    </div>
  )
}
function FormCheckbox({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer sm:col-span-2">
      <input
        type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="accent-brand-500 w-4 h-4 mt-0.5"
      />
      <span>
        <span className="text-sm text-gray-700 block">{label}</span>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminDocuments() {
  const [employees,  setEmployees]  = useState([])
  const [selected,   setSelected]   = useState(null)   // selected doc type id
  const [loading,    setLoading]    = useState(false)
  const [preview,    setPreview]    = useState(null)   // rendered document node
  const [error,      setError]      = useState('')

  // Shared optional fields
  const [ein,      setEin]      = useState('47-2422099')
  const [sigName,  setSigName]  = useState('')
  const [sigTitle, setSigTitle] = useState('')

  // Pay Stub form
  const [stubEmpId,  setStubEmpId]  = useState('')
  const [stubStart,  setStubStart]  = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [stubEnd,    setStubEnd]    = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [stubGroupByMonth, setStubGroupByMonth] = useState(false)

  // Employment Letter form
  const [letterEmpId,   setLetterEmpId]   = useState('')
  const [jobTitle,      setJobTitle]      = useState('')
  const [purpose,       setPurpose]       = useState('general')
  const [clientServed,  setClientServed]  = useState('')
  const [activity,      setActivity]      = useState('')
  const [letterStartDate, setLetterStartDate] = useState('')
  const [avgIncome,     setAvgIncome]     = useState('')
  const [letterLanguage, setLetterLanguage] = useState('en')

  // Annual / 1099 form
  const [annualEmpId, setAnnualEmpId] = useState('all')
  const [year,        setYear]        = useState(CURRENT_YEAR)

  // Timesheet form
  const [tsEmpId, setTsEmpId] = useState('')
  const [tsStart, setTsStart] = useState(format(subWeeks(new Date(), 1), 'yyyy-MM-dd'))
  const [tsEnd,   setTsEnd]   = useState(format(new Date(), 'yyyy-MM-dd'))

  // Register form
  const [regPeriod, setRegPeriod] = useState(0)

  useEffect(() => {
    listEmployees().then((d) => {
      const emps = d.employees ?? []
      setEmployees(emps)
      if (emps.length) {
        setStubEmpId(emps[0].id)
        setLetterEmpId(emps[0].id)
        setTsEmpId(emps[0].id)
      }
    })
  }, [])

  const activeEmps = employees.filter((e) => e.is_active)

  const generate = async () => {
    setError('')
    setLoading(true)
    try {
      const rp = PERIODS[parseInt(regPeriod)]

      if (selected === 'paystub') {
        const uid = parseInt(stubEmpId)
        const emp = employees.find((e) => e.id === uid)
        if (!emp) throw new Error('Select an employee.')

        const weeks = weeksInRange(stubStart, stubEnd)
        if (!weeks.length) throw new Error('Select a valid date range.')

        // Fetch one week at a time (not all at once) — a long date range can span
        // dozens of weeks, and firing every week's requests in parallel can exceed
        // the shared host's concurrent-connection limit (seen as a 508 error).
        const weekStubs = []
        for (const wk of weeks) {
          const [sumData, adjData, loanData] = await Promise.all([
            getSummary({ start: wk.start, end: wk.end }),
            listAdjustments({ user_id: uid, period_start: wk.start, period_end: wk.end }),
            getPeriodLoanTotals(wk.start, wk.end),
          ])
          const empSummary = (sumData.summary ?? []).find((s) => s.user_id === uid)
          if (empSummary) {
            weekStubs.push({ period: wk, summary: empSummary, adjustments: adjData.adjustments ?? [], loanDed: loanData[uid] ?? 0 })
          }
        }

        if (!weekStubs.length) throw new Error('No payroll data found for this employee in the selected range.')

        if (stubGroupByMonth && weekStubs.length > 1) {
          // Group each week into the calendar month its start date falls in
          const byMonth = {}
          for (const ws of weekStubs) {
            const key = format(parseISO(ws.period.start), 'yyyy-MM')
            ;(byMonth[key] ??= []).push(ws)
          }
          const monthGroups = Object.keys(byMonth).sort().map((key) => ({ monthKey: key, weeks: byMonth[key] }))
          setPreview(
            <>
              {monthGroups.map((mg, i) => (
                <div key={mg.monthKey} style={i < monthGroups.length - 1 ? { pageBreakAfter: 'always' } : undefined}>
                  <MonthlyEarningsDoc emp={emp} monthKey={mg.monthKey} weekStubs={mg.weeks} ein={ein} />
                </div>
              ))}
            </>
          )
        } else {
          setPreview(
            <>
              {weekStubs.map((ws, i) => (
                <div key={i} style={i < weekStubs.length - 1 ? { pageBreakAfter: 'always' } : undefined}>
                  <PayStubDoc emp={emp} summary={ws.summary} adjustments={ws.adjustments} loanDed={ws.loanDed} period={ws.period} ein={ein} />
                </div>
              ))}
            </>
          )
        }

      } else if (selected === 'letter') {
        const emp = employees.find((e) => e.id === parseInt(letterEmpId))
        if (!emp) throw new Error('Select an employee.')
        setPreview(
          <EmploymentLetterDoc
            emp={emp}
            jobTitle={jobTitle}
            purpose={purpose}
            ein={ein}
            sigName={sigName}
            sigTitle={sigTitle}
            clientServed={clientServed}
            activity={activity}
            startDate={letterStartDate}
            avgIncome={avgIncome}
            language={letterLanguage}
          />
        )

      } else if (selected === 'annual') {
        const data = await getAnnualSummary(year)
        const emps = annualEmpId === 'all'
          ? (data.employees ?? [])
          : (data.employees ?? []).filter((e) => e.user_id === parseInt(annualEmpId))
        if (!emps.length) throw new Error('No earnings data found for the selected employee and year.')
        setPreview(<AnnualSummaryDoc employees={emps} year={year} ein={ein} />)

      } else if (selected === 'timesheet') {
        const uid = parseInt(tsEmpId)
        const emp = employees.find((e) => e.id === uid)
        if (!emp) throw new Error('Select an employee.')
        const data = await getBreakdown({ user_id: uid, start: tsStart, end: tsEnd })
        setPreview(
          <TimesheetRecordDoc
            emp={emp}
            breakdown={data.breakdown ?? {}}
            start={tsStart}
            end={tsEnd}
            ein={ein}
          />
        )

      } else if (selected === 'register') {
        const [sumData, adjData, loanData] = await Promise.all([
          getSummary({ start: rp.start, end: rp.end }),
          listAdjustments({ period_start: rp.start, period_end: rp.end }),
          getPeriodLoanTotals(rp.start, rp.end),
        ])
        setPreview(
          <PayrollRegisterDoc
            summaryData={sumData.summary ?? []}
            adjustments={adjData.adjustments ?? []}
            loanDeductions={loanData}
            period={rp}
            ein={ein}
          />
        )

      } else if (selected === 'contractor') {
        const data = await getAnnualSummary(year)
        setPreview(<Contractor1099Doc employees={data.employees ?? []} year={year} ein={ein} />)
      }

    } catch (err) {
      setError(err?.response?.data?.error ?? err.message ?? 'Could not generate document.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Legal Documents"
        subtitle="Generate official HR and payroll documents for printing or PDF"
      />

      <div className="max-w-5xl">
        {/* Document type grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {DOC_TYPES.map((dt) => (
            <button
              key={dt.id}
              onClick={() => { setSelected(dt.id); setError(''); setPreview(null) }}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                selected === dt.id
                  ? `${dt.color} border-current`
                  : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dt.dot}`} />
                <p className={`text-sm font-semibold leading-tight ${selected === dt.id ? 'text-gray-900' : 'text-gray-700'}`}>
                  {dt.title}
                </p>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{dt.desc}</p>
            </button>
          ))}
        </div>

        {/* Form panel */}
        {selected && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-5">
              {DOC_TYPES.find((d) => d.id === selected)?.title} — Options
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* ── Pay Stub ── */}
              {selected === 'paystub' && (
                <>
                  <FormSelect label="Employee" value={stubEmpId} onChange={setStubEmpId}>
                    {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </FormSelect>
                  <div />
                  <FormInput label="Start Date" type="date" value={stubStart} onChange={setStubStart} />
                  <FormInput label="End Date"   type="date" value={stubEnd}   onChange={setStubEnd} />
                  {weeksInRange(stubStart, stubEnd).length > 1 && (
                    <FormCheckbox
                      label="Combine each month's weeks into one document"
                      hint="Otherwise a separate page is generated for every week in the range"
                      checked={stubGroupByMonth}
                      onChange={setStubGroupByMonth}
                    />
                  )}
                </>
              )}

              {/* ── Employment Letter ── */}
              {selected === 'letter' && (() => {
                const letterEmp = activeEmps.find((e) => e.id === parseInt(letterEmpId))
                const isIndependent = letterEmp?.pay_type === '1099'
                return (
                  <>
                    <FormSelect label="Employee" value={letterEmpId} onChange={setLetterEmpId}>
                      {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </FormSelect>
                    <FormInput label="Job Title (optional)" value={jobTitle} onChange={setJobTitle} placeholder="e.g. Field Technician" />
                    <FormSelect label="Purpose" value={purpose} onChange={setPurpose}>
                      {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </FormSelect>
                    <FormSelect label="Language" value={letterLanguage} onChange={setLetterLanguage}>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </FormSelect>
                    <FormInput label="Start Date" type="date" value={letterStartDate} onChange={setLetterStartDate} />
                    <FormInput label="Average Total Income (optional)" value={avgIncome} onChange={setAvgIncome} placeholder="e.g. $3,200 per month" />
                    {isIndependent && (
                      <>
                        <FormInput label="Company / Client Served" value={clientServed} onChange={setClientServed} placeholder="e.g. JCCS Services and affiliated clients" />
                        <FormInput label="Activity Performed (as independent contractor)" value={activity} onChange={setActivity} placeholder="e.g. HVAC installation and repair" />
                      </>
                    )}
                    <FormInput label="Signed By (optional)" value={sigName} onChange={setSigName} placeholder="e.g. Jane Smith" />
                    <FormInput label="Signer Title (optional)" value={sigTitle} onChange={setSigTitle} placeholder="e.g. Office Manager" />
                  </>
                )
              })()}

              {/* ── Annual Summary ── */}
              {selected === 'annual' && (
                <>
                  <FormSelect label="Employee" value={annualEmpId} onChange={setAnnualEmpId}>
                    <option value="all">All Employees</option>
                    {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </FormSelect>
                  <FormSelect label="Tax Year" value={year} onChange={(v) => setYear(parseInt(v))}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </FormSelect>
                </>
              )}

              {/* ── Timesheet Record ── */}
              {selected === 'timesheet' && (
                <>
                  <FormSelect label="Employee" value={tsEmpId} onChange={setTsEmpId}>
                    {activeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </FormSelect>
                  <FormInput label="Start Date" type="date" value={tsStart} onChange={setTsStart} />
                  <FormInput label="End Date"   type="date" value={tsEnd}   onChange={setTsEnd} />
                </>
              )}

              {/* ── Payroll Register ── */}
              {selected === 'register' && (
                <FormSelect label="Pay Period" value={regPeriod} onChange={setRegPeriod}>
                  {PERIODS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                </FormSelect>
              )}

              {/* ── 1099 Summary ── */}
              {selected === 'contractor' && (
                <FormSelect label="Tax Year" value={year} onChange={(v) => setYear(parseInt(v))}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </FormSelect>
              )}

              {/* ── Shared: EIN ── */}
              <FormInput
                label="Employer EIN (optional)"
                value={ein} onChange={setEin}
                placeholder="e.g. 12-3456789"
              />
            </div>

            {error && <p className="text-sm text-red-600 font-medium mt-4">{error}</p>}

            <div className="mt-6">
              <Button onClick={generate} loading={loading}>
                Generate &amp; Preview Document
              </Button>
            </div>
          </div>
        )}

        {!selected && (
          <p className="text-sm text-gray-400 text-center py-8">Select a document type above to get started.</p>
        )}
      </div>

      {/* Print preview overlay */}
      {preview && (
        <PrintOverlay onClose={() => setPreview(null)}>
          {preview}
        </PrintOverlay>
      )}
    </div>
  )
}
