import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { listAgreements, signAgreement, getAgreement } from '../../api/agreements'
import SignaturePad from '../../components/ui/SignaturePad'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import LoanNoteOverlay from '../../components/LoanNoteOverlay'
import { listMyLoanNotes } from '../../api/loans'
import { formatCurrency } from '../../utils/format'
import { WC_PLANS, WC_TRADES, WC_TIERS, WC_DEPENDENT_SLOTS } from '../../utils/workersComp'

const COMPANY = { name: 'JCCS Services LLC', state: 'South Carolina' }

// ─── Agreement definitions ────────────────────────────────────────────────────
const AGREEMENT_DEFS = [
  {
    id: 'at_will',
    title: 'At-Will Employment Acknowledgement',
    desc: 'Confirms the at-will nature of your employment.',
    required_for: ['all'],
    has_form: false,
  },
  {
    id: 'non_solicitation',
    title: 'Non-Solicitation Agreement',
    desc: 'Limits solicitation of employees and clients after leaving.',
    required_for: ['all'],
    has_form: false,
  },
  {
    id: 'conflict_of_interest',
    title: 'Conflict of Interest Policy',
    desc: 'Agreement to avoid and disclose conflicts of interest.',
    required_for: ['all'],
    has_form: false,
  },
  {
    id: 'emergency_contact',
    title: 'Emergency Contact Information',
    desc: 'Emergency contacts and medical information for our records.',
    required_for: ['all'],
    has_form: true,
  },
  {
    id: 'i9',
    title: 'I-9: Employment Eligibility Verification',
    desc: 'Federal form confirming your authorization to work in the U.S.',
    required_for: ['w2'],
    has_form: true,
  },
  {
    id: 'w4',
    title: "W-4: Employee's Withholding Certificate",
    desc: 'Federal income tax withholding preferences.',
    required_for: ['w2'],
    has_form: true,
  },
  {
    id: 'workers_comp',
    title: "Workers' Compensation Coverage",
    desc: 'Choose a ghost policy (default) or premium plan with health coverage.',
    required_for: ['all'],
    has_form: true,
  },
]

// ─── Legal text components ────────────────────────────────────────────────────
function LegalText({ children }) {
  return (
    <div className="text-sm text-gray-700 leading-relaxed space-y-4">
      {children}
    </div>
  )
}
function LegalSection({ num, title, children }) {
  return (
    <div>
      <p className="font-semibold text-gray-900">{num}. {title}</p>
      <p className="mt-1 text-gray-600">{children}</p>
    </div>
  )
}

function AtWillText({ name }) {
  return (
    <LegalText>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2">
        {COMPANY.name} — At-Will Employment Acknowledgement
      </p>
      <p>
        This Acknowledgement is made between <strong>{COMPANY.name}</strong> ("Company") and <strong>{name}</strong> ("Employee").
      </p>
      <LegalSection num={1} title="At-Will Employment">
        Employee acknowledges that their employment with the Company is at-will. Either the Company or the Employee may
        terminate the employment relationship at any time, for any reason or for no reason, with or without prior notice.
        Nothing in any Company policy, handbook, or verbal statement shall alter the at-will nature of employment unless
        set forth in a separate written agreement signed by an authorized officer of the Company.
      </LegalSection>
      <LegalSection num={2} title="No Contract of Employment">
        This acknowledgement does not create a contract of employment, express or implied, for any specific period or on
        any particular terms and conditions. The Company may change wages, benefits, and working conditions at any time.
      </LegalSection>
      <LegalSection num={3} title="Handbook and Policies">
        Employee acknowledges receipt of the Company's workplace policies and agrees to review and comply with them.
        The Company reserves the right to modify, supplement, or rescind any policies with or without notice.
      </LegalSection>
      <LegalSection num={4} title="Governing Law">
        This Acknowledgement shall be governed by the laws of the State of {COMPANY.state}.
      </LegalSection>
      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        By signing below, Employee acknowledges reading, understanding, and agreeing to the terms of this
        At-Will Employment Acknowledgement.
      </p>
    </LegalText>
  )
}

function NonSolicitationText({ name }) {
  return (
    <LegalText>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2">
        {COMPANY.name} — Non-Solicitation Agreement
      </p>
      <p>
        This Non-Solicitation Agreement ("Agreement") is entered into between <strong>{COMPANY.name}</strong> ("Company")
        and <strong>{name}</strong> ("Employee").
      </p>
      <LegalSection num={1} title="Non-Solicitation of Employees">
        During employment and for twelve (12) months after termination for any reason, Employee agrees not to directly
        or indirectly recruit, solicit, or induce any employee of the Company to leave their employment with the Company.
      </LegalSection>
      <LegalSection num={2} title="Non-Solicitation of Clients and Customers">
        During employment and for twelve (12) months after termination for any reason, Employee agrees not to directly
        or indirectly solicit, divert, or take away the business of any client or customer of the Company with whom
        Employee had material contact during the last twelve (12) months of employment.
      </LegalSection>
      <LegalSection num={3} title="Confidential Information">
        Employee acknowledges access to confidential and proprietary information including client lists, pricing, business
        strategies, project details, and trade secrets. Employee agrees to maintain strict confidentiality of such
        information during and indefinitely after employment.
      </LegalSection>
      <LegalSection num={4} title="Remedies">
        Employee acknowledges that breach of this Agreement would cause irreparable harm to the Company for which
        monetary damages would be inadequate. The Company shall be entitled to seek injunctive relief in addition to
        any other available remedies.
      </LegalSection>
      <LegalSection num={5} title="Governing Law and Severability">
        This Agreement shall be governed by the laws of {COMPANY.state}. If any provision is found unenforceable, the
        remaining provisions continue in full effect.
      </LegalSection>
      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        By signing below, Employee acknowledges reading, understanding, and agreeing to the terms of this Non-Solicitation Agreement.
      </p>
    </LegalText>
  )
}

function ConflictOfInterestText({ name }) {
  return (
    <LegalText>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-2">
        {COMPANY.name} — Conflict of Interest Policy
      </p>
      <p>
        <strong>{COMPANY.name}</strong> ("Company") requires all employees and managers to avoid actual or apparent
        conflicts of interest between their personal interests and those of the Company.
        <strong> {name}</strong> ("Employee") agrees to the following:
      </p>
      <LegalSection num={1} title="Disclosure Requirement">
        Employee must promptly disclose to management any situation that may constitute or give rise to a conflict of
        interest, including but not limited to: outside employment with a competitor, financial interest in a Company
        supplier or client, or any personal relationship that could influence business decisions.
      </LegalSection>
      <LegalSection num={2} title="Outside Employment and Business Activities">
        Employee agrees not to engage in any outside employment or business activity that interferes with their duties,
        uses Company time or resources, or competes directly or indirectly with the Company's business.
      </LegalSection>
      <LegalSection num={3} title="Gifts and Benefits">
        Employee shall not accept gifts, entertainment, or other personal benefits from vendors, subcontractors, or
        clients that could influence or appear to influence business decisions. Nominal gifts under $25 in value are
        permitted with disclosure to management.
      </LegalSection>
      <LegalSection num={4} title="Company Property and Information">
        Employee shall not use Company property, equipment, information, or relationships for personal benefit. All
        work product created during employment is the sole property of the Company.
      </LegalSection>
      <LegalSection num={5} title="Compliance">
        Violations of this policy may result in disciplinary action up to and including immediate termination.
        This policy shall be governed by the laws of {COMPANY.state}.
      </LegalSection>
      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        By signing below, Employee acknowledges reading, understanding, and agreeing to comply with this Conflict of Interest Policy.
      </p>
    </LegalText>
  )
}

// ─── Form components ──────────────────────────────────────────────────────────
function FI({ label, children, required }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500'
const _selectCls = `${inputCls} bg-white`

function EmergencyContactForm({ data, onChange, disabled }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value })
  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 bg-blue-50 rounded-xl p-3">
        This information is kept confidential and used only in the event of a workplace emergency.
      </p>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Primary Emergency Contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label="Full Name" required><input disabled={disabled} className={inputCls} value={data.c1_name ?? ''} onChange={set('c1_name')} placeholder="Jane Smith" /></FI>
          <FI label="Relationship" required><input disabled={disabled} className={inputCls} value={data.c1_relationship ?? ''} onChange={set('c1_relationship')} placeholder="Spouse, Parent, Sibling..." /></FI>
          <FI label="Phone Number" required><input disabled={disabled} className={inputCls} type="tel" value={data.c1_phone ?? ''} onChange={set('c1_phone')} placeholder="(555) 000-0000" /></FI>
          <FI label="Email (optional)"><input disabled={disabled} className={inputCls} type="email" value={data.c1_email ?? ''} onChange={set('c1_email')} placeholder="jane@example.com" /></FI>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Secondary Emergency Contact (optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label="Full Name"><input disabled={disabled} className={inputCls} value={data.c2_name ?? ''} onChange={set('c2_name')} placeholder="John Smith" /></FI>
          <FI label="Relationship"><input disabled={disabled} className={inputCls} value={data.c2_relationship ?? ''} onChange={set('c2_relationship')} placeholder="Parent, Friend..." /></FI>
          <FI label="Phone Number"><input disabled={disabled} className={inputCls} type="tel" value={data.c2_phone ?? ''} onChange={set('c2_phone')} placeholder="(555) 000-0000" /></FI>
          <FI label="Email (optional)"><input disabled={disabled} className={inputCls} type="email" value={data.c2_email ?? ''} onChange={set('c2_email')} /></FI>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Medical Information (optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label="Known Allergies">
            <textarea disabled={disabled} className={`${inputCls} resize-none`} rows={2} value={data.allergies ?? ''} onChange={set('allergies')} placeholder="e.g. Penicillin, latex..." />
          </FI>
          <FI label="Medical Conditions">
            <textarea disabled={disabled} className={`${inputCls} resize-none`} rows={2} value={data.conditions ?? ''} onChange={set('conditions')} placeholder="e.g. Diabetes, asthma..." />
          </FI>
          <FI label="Current Medications">
            <input disabled={disabled} className={inputCls} value={data.medications ?? ''} onChange={set('medications')} placeholder="Optional" />
          </FI>
          <FI label="Health Insurance Provider">
            <input disabled={disabled} className={inputCls} value={data.insurance ?? ''} onChange={set('insurance')} placeholder="e.g. Blue Cross" />
          </FI>
        </div>
      </div>

      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        By signing below, I confirm that the information provided above is accurate and I authorize {COMPANY.name} to
        contact the individuals listed in an emergency.
      </p>
    </div>
  )
}

function I9Form({ data, onChange, disabled, empName: _empName }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value })
  return (
    <div className="space-y-5">
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800">
        <strong>Section 1 — Employee Information and Attestation.</strong> Employees must complete and sign Section 1
        of Form I-9 no later than the first day of employment. This is an internal record only — the original USCIS
        Form I-9 must also be retained on file.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FI label="Last Name" required><input disabled={disabled} className={inputCls} value={data.last_name ?? ''} onChange={set('last_name')} /></FI>
        <FI label="First Name" required><input disabled={disabled} className={inputCls} value={data.first_name ?? ''} onChange={set('first_name')} /></FI>
        <FI label="Middle Initial"><input disabled={disabled} className={inputCls} value={data.middle_initial ?? ''} onChange={set('middle_initial')} maxLength={1} /></FI>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FI label="Other Last Names Used (if any)"><input disabled={disabled} className={inputCls} value={data.other_names ?? ''} onChange={set('other_names')} placeholder="N/A" /></FI>
        <FI label="Date of Birth" required><input disabled={disabled} className={inputCls} type="date" value={data.dob ?? ''} onChange={set('dob')} /></FI>
        <FI label="U.S. Social Security Number (last 4 only)" required><input disabled={disabled} className={inputCls} value={data.ssn_last4 ?? ''} onChange={set('ssn_last4')} maxLength={4} placeholder="XXXX" /></FI>
        <FI label="Employee Email"><input disabled={disabled} className={inputCls} type="email" value={data.email ?? ''} onChange={set('email')} /></FI>
      </div>
      <FI label="Address (Number and Street)" required>
        <input disabled={disabled} className={inputCls} value={data.address ?? ''} onChange={set('address')} />
      </FI>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FI label="City or Town" required><input disabled={disabled} className={inputCls} value={data.city ?? ''} onChange={set('city')} /></FI>
        <FI label="State"><input disabled={disabled} className={inputCls} value={data.state ?? ''} onChange={set('state')} maxLength={2} placeholder="SC" /></FI>
        <FI label="ZIP Code"><input disabled={disabled} className={inputCls} value={data.zip ?? ''} onChange={set('zip')} /></FI>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attestation of Citizenship / Immigration Status <span className="text-red-500">*</span></p>
        {[
          { val: 'citizen',       label: 'A citizen of the United States' },
          { val: 'national',      label: 'A noncitizen national of the United States' },
          { val: 'perm_resident', label: 'A lawful permanent resident' },
          { val: 'authorized',    label: 'An alien authorized to work' },
        ].map((opt) => (
          <label key={opt.val} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer ${disabled ? '' : 'hover:bg-gray-50'}`}>
            <input type="radio" name="citizenship" value={opt.val} checked={data.citizenship === opt.val} onChange={set('citizenship')} disabled={disabled} />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}
        {data.citizenship === 'perm_resident' && (
          <FI label="Alien Registration / USCIS Number" required>
            <input disabled={disabled} className={`${inputCls} mt-1`} value={data.uscis_number ?? ''} onChange={set('uscis_number')} />
          </FI>
        )}
        {data.citizenship === 'authorized' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <FI label="Alien Registration / USCIS Number or Form I-94 Number">
              <input disabled={disabled} className={inputCls} value={data.uscis_number ?? ''} onChange={set('uscis_number')} />
            </FI>
            <FI label="Expiration Date of Authorization">
              <input disabled={disabled} className={inputCls} type="date" value={data.auth_expiry ?? ''} onChange={set('auth_expiry')} />
            </FI>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        I attest, under penalty of perjury, that I am aware that federal law provides for imprisonment and/or fines for
        false statements or use of false documents in connection with the completion of this form. I am eligible to work
        in the United States. The information above is true and correct.
      </p>
    </div>
  )
}

function W4Form({ data, onChange, disabled }) {
  const set  = (field) => (e) => onChange({ ...data, [field]: e.target.value })
  const setC = (field) => (e) => onChange({ ...data, [field]: e.target.checked })
  const fmt  = (v) => v ?? ''
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-800">
        <strong>W-4: Employee's Withholding Certificate.</strong> Complete this form so your employer can withhold the
        correct amount of federal income tax from your pay. This is for payroll reference — consult your tax advisor for guidance.
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Step 1 — Personal Information</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label="First Name and Middle Initial" required><input disabled={disabled} className={inputCls} value={fmt(data.first_name)} onChange={set('first_name')} /></FI>
          <FI label="Last Name" required><input disabled={disabled} className={inputCls} value={fmt(data.last_name)} onChange={set('last_name')} /></FI>
          <FI label="Social Security Number" required><input disabled={disabled} className={inputCls} value={fmt(data.ssn)} onChange={set('ssn')} placeholder="XXX-XX-XXXX" /></FI>
          <FI label="Home Address" required><input disabled={disabled} className={inputCls} value={fmt(data.address)} onChange={set('address')} /></FI>
          <FI label="City, State, ZIP" required><input disabled={disabled} className={inputCls} value={fmt(data.city_state_zip)} onChange={set('city_state_zip')} /></FI>
        </div>
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filing Status <span className="text-red-500">*</span></p>
          {[
            { val: 'single',     label: 'Single or Married filing separately' },
            { val: 'married',    label: 'Married filing jointly or Qualifying surviving spouse' },
            { val: 'head',       label: 'Head of household' },
          ].map((opt) => (
            <label key={opt.val} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer ${disabled ? '' : 'hover:bg-gray-50'}`}>
              <input type="radio" name="filing_status" value={opt.val} checked={data.filing_status === opt.val} onChange={set('filing_status')} disabled={disabled} />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-1">Step 2 — Multiple Jobs or Spouse Works</p>
        <label className={`flex items-start gap-2 py-2 px-3 rounded-lg cursor-pointer ${disabled ? '' : 'hover:bg-gray-50'}`}>
          <input type="checkbox" className="mt-0.5" checked={!!data.multiple_jobs} onChange={setC('multiple_jobs')} disabled={disabled} />
          <span className="text-sm text-gray-700">
            Check this box if there are only two jobs total (you and your spouse) or if you hold more than one job.
            (Using the IRS Tax Withholding Estimator at <span className="font-mono">irs.gov/W4App</span> is recommended for more accuracy.)
          </span>
        </label>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Step 3 — Claim Dependents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label="Number of qualifying children under age 17 × $2,000">
            <input disabled={disabled} className={inputCls} type="number" min="0" step="1" value={fmt(data.child_tax_credit)} onChange={set('child_tax_credit')} placeholder="0" />
          </FI>
          <FI label="Number of other dependents × $500">
            <input disabled={disabled} className={inputCls} type="number" min="0" step="1" value={fmt(data.other_dependents)} onChange={set('other_dependents')} placeholder="0" />
          </FI>
        </div>
        <p className="text-xs text-gray-400 mt-1">Enter the dollar amount (e.g., 2 children = $4,000).</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Step 4 — Other Adjustments (optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FI label="(a) Other Income (not from jobs) $">
            <input disabled={disabled} className={inputCls} type="number" min="0" step="0.01" value={fmt(data.other_income)} onChange={set('other_income')} placeholder="0.00" />
          </FI>
          <FI label="(b) Deductions $">
            <input disabled={disabled} className={inputCls} type="number" min="0" step="0.01" value={fmt(data.deductions)} onChange={set('deductions')} placeholder="0.00" />
          </FI>
          <FI label="(c) Extra Withholding Per Pay Period $">
            <input disabled={disabled} className={inputCls} type="number" min="0" step="0.01" value={fmt(data.extra_withholding)} onChange={set('extra_withholding')} placeholder="0.00" />
          </FI>
        </div>
      </div>

      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true,
        correct, and complete.
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
// ─── Workers' compensation coverage election ─────────────────────────────────
// Two options: a "ghost" policy (default — the minimum coverage needed to work
// with JCCS) or a premium plan that adds health coverage at a higher cost.
// Bilingual inline since most of the crew reads Spanish; the other onboarding
// forms are English-only.

// Shrink a phone-camera ID photo to a JPEG data URL (~200–400 KB) so it can
// travel inside the signed form's JSON — same as the signature image — rather
// than as a file under the web-served uploads/ folder.
function compressIdPhoto(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale  = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    img.src = url
  })
}

function IdPhotoField({ value, onChange, disabled, L }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try { onChange(await compressIdPhoto(file)) }
    catch { setErr(L('Could not read that photo. Try another one.', 'No se pudo leer esa foto. Intente con otra.')) }
    finally { setBusy(false) }
  }
  return (
    <div>
      {value ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-2">
          <img src={value} alt={L('Photo ID', 'Foto de identificación')} className="max-h-64 mx-auto rounded-lg object-contain" />
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          {L('No photo yet', 'Sin foto todavía')}
        </div>
      )}
      {!disabled && (
        <label className={`mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
          busy ? 'bg-gray-100 text-gray-400' : 'bg-brand-500 text-white hover:bg-brand-600'
        }`}>
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
          {busy ? L('Processing…', 'Procesando…') : value ? L('Retake / change photo', 'Tomar otra / cambiar foto') : L('Take or upload photo', 'Tomar o subir foto')}
        </label>
      )}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      <p className="text-xs text-gray-400 mt-1">
        {L("Driver's license, state ID, passport, or consular ID (matrícula). Make sure the name and photo are readable.",
           'Licencia de conducir, ID estatal, pasaporte o matrícula consular. Asegúrese de que el nombre y la foto se lean bien.')}
      </p>
    </div>
  )
}

function WcPlanCard({ id, plan, desc, bullets, onChange, disabled, L }) {
  const active = plan === id
  return (
    <label className={`block rounded-2xl border-2 p-4 transition-all ${disabled ? '' : 'cursor-pointer'} ${
      active ? 'border-brand-500 bg-brand-100/40' : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      <div className="flex items-start gap-3">
        <input type="radio" name="wc_plan" className="mt-1" value={id} checked={active}
          onChange={onChange} disabled={disabled} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{L(WC_PLANS[id].en, WC_PLANS[id].es)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
          <ul className="mt-2 space-y-1">
            {bullets.map(([ok, text]) => (
              <li key={text} className="flex gap-2 text-xs text-gray-700">
                <span className={ok ? 'text-green-600' : 'text-gray-400'}>{ok ? '✓' : '✕'}</span>{text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </label>
  )
}

function WorkersCompForm({ data, onChange, disabled, isEs }) {
  const L    = (en, es) => (isEs ? es : en)
  const set  = (field) => (e) => onChange({ ...data, [field]: e.target.value })
  const fmt  = (v) => v ?? ''
  const plan = data.plan ?? 'ghost'
  const tier = data.health_tier ?? 'self'
  const needsDependents = plan === 'premium' && tier !== 'self'

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-900">
        {L(
          `Everyone who works on ${COMPANY.name} job sites must have workers' compensation coverage on file. Choose a plan below and complete the information the insurance carrier needs to issue your policy. The office will confirm the final cost with you before coverage starts.`,
          `Toda persona que trabaje en obras de ${COMPANY.name} debe tener cobertura de compensación laboral registrada. Elija un plan abajo y complete la información que la aseguradora necesita para emitir su póliza. La oficina le confirmará el costo final antes de que empiece la cobertura.`
        )}
      </div>

      {/* Plan choice */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">
          {L('1 — Choose Your Coverage', '1 — Elija Su Cobertura')} <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <WcPlanCard
            id="ghost" plan={plan} onChange={set('plan')} disabled={disabled} L={L}
            desc={L('The basic insurance required to work with us. Lowest cost.', 'El seguro básico requerido para trabajar con nosotros. Menor costo.')}
            bullets={[
              [true,  L('Certificate of insurance that lets you work on our jobs', 'Certificado de seguro que le permite trabajar en nuestras obras')],
              [true,  L('Meets our company and client requirements', 'Cumple los requisitos de la compañía y de los clientes')],
              [false, L('Does NOT pay your own medical bills or lost wages if you get hurt', 'NO paga sus propios gastos médicos ni salario perdido si se lastima')],
              [false, L('No health coverage', 'Sin cobertura de salud')],
            ]}
          />
          <WcPlanCard
            id="premium" plan={plan} onChange={set('plan')} disabled={disabled} L={L}
            desc={L('Everything in the ghost policy, plus health coverage. Higher cost.', 'Todo lo de la póliza fantasma, más cobertura de salud. Mayor costo.')}
            bullets={[
              [true, L('Certificate of insurance that lets you work on our jobs', 'Certificado de seguro que le permite trabajar en nuestras obras')],
              [true, L('Meets our company and client requirements', 'Cumple los requisitos de la compañía y de los clientes')],
              [true, L('Health coverage for you (and family, if added)', 'Cobertura de salud para usted (y su familia, si la agrega)')],
              [true, L('More expensive than the ghost policy', 'Más caro que la póliza fantasma')],
            ]}
          />
        </div>
      </div>

      {/* Insured information */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">{L('2 — Your Information', '2 — Su Información')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label={L('Full Legal Name', 'Nombre Legal Completo')} required>
            <input disabled={disabled} className={inputCls} value={fmt(data.legal_name)} onChange={set('legal_name')} />
          </FI>
          <FI label={L('Date of Birth', 'Fecha de Nacimiento')}>
            <input disabled={disabled} className={inputCls} type="date" value={fmt(data.dob)} onChange={set('dob')} />
          </FI>
          <FI label={L('Tax ID Type', 'Tipo de Número Fiscal')} required>
            <select disabled={disabled} className={_selectCls} value={fmt(data.tax_id_type)} onChange={set('tax_id_type')}>
              <option value="">{L('Select…', 'Seleccione…')}</option>
              <option value="ssn">SSN</option>
              <option value="itin">ITIN</option>
              <option value="fein">FEIN / EIN</option>
            </select>
          </FI>
          <FI label={L('Tax ID Number', 'Número Fiscal')} required>
            <input disabled={disabled} className={inputCls} value={fmt(data.tax_id)} onChange={set('tax_id')} placeholder="XXX-XX-XXXX" />
          </FI>
          <FI label={L('Phone', 'Teléfono')}>
            <input disabled={disabled} className={inputCls} type="tel" value={fmt(data.phone)} onChange={set('phone')} placeholder="(555) 000-0000" />
          </FI>
          <FI label={L('Email', 'Correo Electrónico')}>
            <input disabled={disabled} className={inputCls} type="email" value={fmt(data.email)} onChange={set('email')} />
          </FI>
          <FI label={L('Home Address', 'Dirección')} required>
            <input disabled={disabled} className={inputCls} value={fmt(data.address)} onChange={set('address')} />
          </FI>
          <FI label={L('City, State, ZIP', 'Ciudad, Estado, Código Postal')} required>
            <input disabled={disabled} className={inputCls} value={fmt(data.city_state_zip)} onChange={set('city_state_zip')} />
          </FI>
        </div>
        <div className="mt-4">
          <FI label={L('Photo of Your ID', 'Foto de Su Identificación')} required>
            <IdPhotoField value={data.id_photo} onChange={(v) => onChange({ ...data, id_photo: v })} disabled={disabled} L={L} />
          </FI>
        </div>
      </div>

      {/* Work / underwriting */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">{L('3 — Your Work', '3 — Su Trabajo')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FI label={L('Main Trade', 'Oficio Principal')} required>
            <select disabled={disabled} className={_selectCls} value={fmt(data.trade)} onChange={set('trade')}>
              <option value="">{L('Select…', 'Seleccione…')}</option>
              {WC_TRADES.map(([v, en, es]) => <option key={v} value={v}>{L(en, es)}</option>)}
            </select>
          </FI>
          <FI label={L('Years of Experience', 'Años de Experiencia')}>
            <input disabled={disabled} className={inputCls} type="number" min="0" step="1" value={fmt(data.years_experience)} onChange={set('years_experience')} />
          </FI>
          <div className="sm:col-span-2">
            <FI label={L('Describe the work you do', 'Describa el trabajo que hace')} required>
              <textarea disabled={disabled} className={`${inputCls} resize-none`} rows={2} value={fmt(data.job_duties)} onChange={set('job_duties')}
                placeholder={L('e.g. hang and finish drywall, interior trim, ladder work up to 12 ft', 'ej. instalar y terminar drywall, molduras interiores, trabajo en escalera hasta 12 pies')} />
            </FI>
          </div>
          <FI label={L('Requested Start Date', 'Fecha de Inicio Solicitada')}>
            <input disabled={disabled} className={inputCls} type="date" value={fmt(data.effective_date)} onChange={set('effective_date')} />
          </FI>
        </div>
      </div>

      {/* Health coverage — premium only */}
      {plan === 'premium' && (
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-3">{L('4 — Health Coverage', '4 — Cobertura de Salud')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FI label={L('Who should be covered?', '¿A quién se debe cubrir?')} required>
              <select disabled={disabled} className={_selectCls} value={tier} onChange={set('health_tier')}>
                {WC_TIERS.map(([v, en, es]) => <option key={v} value={v}>{L(en, es)}</option>)}
              </select>
            </FI>
            <FI label={L('Current health insurance (if any)', 'Seguro de salud actual (si tiene)')}>
              <input disabled={disabled} className={inputCls} value={fmt(data.current_insurance)} onChange={set('current_insurance')} placeholder={L('None', 'Ninguno')} />
            </FI>
          </div>

          {needsDependents && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {L('Family members to cover', 'Familiares a cubrir')} <span className="text-red-500">*</span>
              </p>
              <div className="space-y-2">
                {Array.from({ length: WC_DEPENDENT_SLOTS }, (_, i) => i + 1).map((n) => (
                  <div key={n} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input disabled={disabled} className={inputCls} value={fmt(data[`dep${n}_name`])} onChange={set(`dep${n}_name`)}
                      placeholder={`${n}. ${L('Full name', 'Nombre completo')}`} />
                    <select disabled={disabled} className={_selectCls} value={fmt(data[`dep${n}_relationship`])} onChange={set(`dep${n}_relationship`)}>
                      <option value="">{L('Relationship…', 'Parentesco…')}</option>
                      <option value="spouse">{L('Spouse', 'Cónyuge')}</option>
                      <option value="child">{L('Child', 'Hijo/a')}</option>
                    </select>
                    <input disabled={disabled} className={inputCls} type="date" value={fmt(data[`dep${n}_dob`])} onChange={set(`dep${n}_dob`)}
                      aria-label={L('Date of birth', 'Fecha de nacimiento')} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        {plan === 'premium'
          ? L(
              `By signing below, I elect the Premium Plan with health coverage and understand it costs more than the ghost policy. I certify the information above is true and complete, and I authorize ${COMPANY.name} to share it with its insurance agent and carrier to obtain my coverage.`,
              `Al firmar abajo, elijo el Plan Premium con cobertura de salud y entiendo que cuesta más que la póliza fantasma. Certifico que la información anterior es verdadera y completa, y autorizo a ${COMPANY.name} a compartirla con su agente y aseguradora para obtener mi cobertura.`
            )
          : L(
              `By signing below, I elect the Ghost Policy. I understand it is the insurance required to work with ${COMPANY.name} and that it does NOT pay my own medical bills or lost wages if I am injured. I certify the information above is true and complete, and I authorize ${COMPANY.name} to share it with its insurance agent and carrier to obtain my coverage.`,
              `Al firmar abajo, elijo la Póliza Fantasma. Entiendo que es el seguro requerido para trabajar con ${COMPANY.name} y que NO paga mis propios gastos médicos ni salario perdido si me lastimo. Certifico que la información anterior es verdadera y completa, y autorizo a ${COMPANY.name} a compartirla con su agente y aseguradora para obtener mi cobertura.`
            )}
      </p>
    </div>
  )
}

// Returns an error string, or '' when the workers' comp form is complete.
function validateWorkersComp(d, isEs) {
  const L = (en, es) => (isEs ? es : en)
  // What the insurance carrier needs up front: full name, photo ID, tax ID /
  // SSN, address and type of work. (Property type is always commercial —
  // filled in on the Excel export, not asked.)
  const req = ['legal_name', 'tax_id_type', 'tax_id', 'address', 'city_state_zip', 'trade', 'job_duties']
  if (req.some((f) => !String(d[f] ?? '').trim())) return L('Please complete all required fields.', 'Complete todos los campos obligatorios.')
  if (!d.id_photo) return L('Please add a photo of your ID.', 'Agregue una foto de su identificación.')
  if (d.plan === 'premium' && d.health_tier !== 'self') {
    const has = (n) => d[`dep${n}_name`]?.trim()
    const listed = Array.from({ length: WC_DEPENDENT_SLOTS }, (_, i) => i + 1).filter(has)
    if (!listed.length) return L('Add at least one family member to cover.', 'Agregue al menos un familiar a cubrir.')
    if (listed.some((n) => !d[`dep${n}_relationship`] || !d[`dep${n}_dob`])) {
      return L('Each family member needs a relationship and date of birth.', 'Cada familiar necesita parentesco y fecha de nacimiento.')
    }
  }
  return ''
}

export default function MyDocuments() {
  const { user } = useAuthStore()
  const { t, i18n } = useTranslation()
  const isEs     = i18n.language.startsWith('es')
  const dfLocale = isEs ? es : enUS
  const fmtDate  = (iso) => format(parseISO(iso), 'MMMM d, yyyy', { locale: dfLocale })
  const fmtDateTime = (iso) => format(parseISO(iso), "MMMM d, yyyy 'at' h:mm a", { locale: dfLocale })
  const [agreements, setAgreements]     = useState([])
  const [wcExempt, setWcExempt]         = useState(false)
  const [loading, setLoading]           = useState(true)
  const [activeType, setActiveType]     = useState(null)
  const [signedData, setSignedData]     = useState(null)  // full signed doc for view mode
  const [formData, setFormData]         = useState({})
  const [agreed, setAgreed]             = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const sigRef = useRef(null)

  // Loan pagarés — signed separately from the onboarding documents above,
  // and only listed when the employee has any.
  const [loanNotes, setLoanNotes]   = useState([])
  const [activeNote, setActiveNote] = useState(null)
  const [noteMsg, setNoteMsg]       = useState('')
  const loadNotes = useCallback(() => {
    listMyLoanNotes().then(setLoanNotes).catch(() => setLoanNotes([]))
  }, [])
  useEffect(() => { loadNotes() }, [loadNotes])

  const requiredDefs = AGREEMENT_DEFS.filter((d) =>
    !(d.id === 'workers_comp' && wcExempt) &&
    (d.required_for.includes('all') || (d.required_for.includes('w2') && user?.pay_type === 'w2'))
  )

  // Always ask for our own record by user_id. Without it, an admin viewing
  // their own /my-docs hits the HR-overview branch of index.php (which
  // returns { employees: [...] }, not { agreements: [...] }), so nothing
  // ever shows as signed and the progress bar stays at zero.
  const load = useCallback(() => {
    if (!user?.id) return
    setLoading(true)
    listAgreements({ user_id: user.id })
      .then((d) => { setAgreements(d.agreements ?? []); setWcExempt(!!d.wc_exempt) })
      .finally(() => setLoading(false))
  }, [user?.id])

  useEffect(() => { load() }, [load])

  const statusOf = (id) => agreements.find((a) => a.agreement_type === id)

  const signed  = requiredDefs.filter((d) => !!statusOf(d.id)?.signed_at).length
  const total   = requiredDefs.length
  const allDone = signed === total

  const openSign = async (def) => {
    const existing = statusOf(def.id)
    setActiveType(def)
    setError('')
    setAgreed(false)
    setFormData(def.id === 'workers_comp' ? {
      plan: 'ghost',
      health_tier: 'self',
      legal_name: user?.name ?? '',
      phone: user?.phone ?? '',
      email: user?.email ?? '',
      effective_date: format(new Date(), 'yyyy-MM-dd'),
    } : {})
    setSignedData(null)
    if (existing?.signed_at) {
      // Load full data for read-only view
      try {
        const full = await getAgreement({ type: def.id })
        setSignedData(full)
      } catch { setSignedData(existing) }
    }
  }

  const handleSign = async () => {
    if (!agreed && !activeType.has_form) { setError('You must check the acknowledgement box to proceed.'); return }
    if (sigRef.current?.isEmpty()) { setError('Please draw your signature before submitting.'); return }

    // Validate form fields
    if (activeType.id === 'emergency_contact') {
      if (!formData.c1_name?.trim() || !formData.c1_relationship?.trim() || !formData.c1_phone?.trim()) {
        setError('Primary emergency contact name, relationship, and phone are required.'); return
      }
    }
    if (activeType.id === 'i9') {
      if (!formData.last_name?.trim() || !formData.first_name?.trim() || !formData.dob || !formData.ssn_last4?.trim() || !formData.citizenship) {
        setError('Please complete all required I-9 fields.'); return
      }
    }
    if (activeType.id === 'w4') {
      if (!formData.first_name?.trim() || !formData.last_name?.trim() || !formData.ssn?.trim() || !formData.filing_status) {
        setError('Please complete all required W-4 fields.'); return
      }
    }

    if (activeType.id === 'workers_comp') {
      const msg = validateWorkersComp(formData, isEs)
      if (msg) { setError(msg); return }
    }

    setSaving(true); setError('')
    try {
      await signAgreement({
        agreement_type: activeType.id,
        form_data:      Object.keys(formData).length ? formData : { acknowledged: true },
        signature_data: sigRef.current.getDataURL(),
      })
      setActiveType(null)
      load()
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const printDoc = () => window.print()

  // Inject print CSS when overlay is open
  useEffect(() => {
    if (!activeType) return
    const s = document.createElement('style')
    s.id = 'doc-sign-print'
    s.textContent = `@media print { @page { size: letter; margin: 0.75in; } body > *:not(#doc-sign-root) { display: none !important; } .no-print { display: none !important; } }`
    document.head.appendChild(s)
    return () => document.getElementById('doc-sign-print')?.remove()
  }, [activeType])

  const docText = activeType && {
    at_will:           <AtWillText name={user?.name ?? ''} />,
    non_solicitation:  <NonSolicitationText name={user?.name ?? ''} />,
    conflict_of_interest: <ConflictOfInterestText name={user?.name ?? ''} />,
  }[activeType.id]

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{t('docs.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('docs.subtitle')}</p>
      </div>

      {/* Progress bar */}
      {!loading && (
        <div className={`rounded-2xl p-4 mb-6 border ${allDone ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-sm font-semibold ${allDone ? 'text-green-700' : 'text-amber-700'}`}>
              {allDone ? t('docs.allDone') : t('docs.pending', { count: total - signed })}
            </p>
            <p className="text-xs text-gray-400">{t('docs.progress', { signed, total })}</p>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: `${(signed / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {requiredDefs.map((def) => {
            const ag       = statusOf(def.id)
            const isSigned = !!ag?.signed_at
            return (
              <button
                key={def.id}
                onClick={() => openSign(def)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 ${
                  isSigned ? 'bg-green-50 border-green-200 hover:border-green-300' : 'bg-white border-gray-100 hover:border-brand-300'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isSigned ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {isSigned ? '✓' : '○'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{def.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{def.desc}</p>
                    {isSigned && ag.signed_at && (
                      <p className="text-xs text-green-600 mt-1 font-medium">
                        {t('docs.signedOn', { date: fmtDate(ag.signed_at) })}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${isSigned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isSigned ? t('docs.signed') : t('docs.pendingLabel')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Loan pagarés ─────────────────────────────────────────────────── */}
      {loanNotes.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-bold text-gray-900">{t('pagare.sectionTitle')}</h2>
          <p className="text-sm text-gray-500 mt-0.5 mb-3">{t('pagare.sectionDesc')}</p>
          {noteMsg && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">{noteMsg}</p>}
          <div className="flex flex-col gap-3">
            {loanNotes.map((n) => {
              const needsMe  = !n.borrower_signed_at
              const complete = !!n.company_signed_at
              return (
                <button key={n.id}
                  onClick={() => { setNoteMsg(''); setActiveNote(n) }}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 ${
                    complete ? 'bg-green-50 border-green-200 hover:border-green-300'
                      : needsMe ? 'bg-white border-amber-300 hover:border-amber-400' : 'bg-white border-gray-100 hover:border-brand-300'
                  }`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {t(`pagare.kind_${n.kind}`, { amount: formatCurrency(n.principal) })}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('pagare.weekly', { amount: formatCurrency(n.weekly_amount), date: fmtDate(n.first_due_date) })}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${
                    complete ? 'bg-green-100 text-green-700' : needsMe ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {complete ? t('pagare.signedBoth') : needsMe ? t('pagare.toSign') : t('pagare.waitingCompany')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {activeNote && (
        <LoanNoteOverlay
          note={activeNote}
          mode={activeNote.borrower_signed_at ? 'view' : 'sign'}
          onClose={() => setActiveNote(null)}
          onDone={() => { setActiveNote(null); loadNotes() }}
          onStale={() => { setActiveNote(null); setNoteMsg(t('pagare.stale')); loadNotes() }}
        />
      )}

      {/* ── Signing overlay ──────────────────────────────────────────────── */}
      {activeType && createPortal(
        <div id="doc-sign-root" style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 9999, overflowY: 'auto' }}>

          {/* Header bar */}
          <div className="no-print sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
            <div>
              <p className="text-sm font-bold text-gray-900">{activeType.title}</p>
              {signedData?.signed_at && (
                <p className="text-xs text-green-600 font-medium">
                  {t('docs.signedOn', { date: fmtDate(signedData.signed_at) })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {signedData?.signed_at && (
                <button
                  onClick={printDoc}
                  className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600"
                >
                  {t('docs.printPdf')}
                </button>
              )}
              <button
                onClick={() => setActiveType(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
              >
                {t('docs.close')}
              </button>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

            {/* Company header (visible in print) */}
            <div className="hidden print:block border-b-2 border-gray-800 pb-3 mb-4">
              <p className="font-bold text-lg">{COMPANY.name}</p>
              <p className="text-sm text-gray-600">{activeType.title}</p>
            </div>

            {/* Employee + date info */}
            <div className="flex gap-6 text-sm">
              <div><p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Employee</p><p className="font-semibold">{user?.name}</p></div>
              <div><p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Date</p><p className="font-semibold">{format(new Date(), 'MMMM d, yyyy')}</p></div>
            </div>

            {/* Legal text / form */}
            {docText && <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">{docText}</div>}
            {activeType.id === 'emergency_contact' && (
              <EmergencyContactForm
                data={signedData?.form_data ?? formData}
                onChange={setFormData}
                disabled={!!signedData?.signed_at}
              />
            )}
            {activeType.id === 'i9' && (
              <I9Form
                data={signedData?.form_data ?? formData}
                onChange={setFormData}
                disabled={!!signedData?.signed_at}
                empName={user?.name}
              />
            )}
            {activeType.id === 'w4' && (
              <W4Form
                data={signedData?.form_data ?? formData}
                onChange={setFormData}
                disabled={!!signedData?.signed_at}
              />
            )}

            {activeType.id === 'workers_comp' && (
              <WorkersCompForm
                data={signedData?.form_data ?? formData}
                onChange={setFormData}
                disabled={!!signedData?.signed_at}
                isEs={isEs}
              />
            )}

            {/* Acknowledgement checkbox (text-only docs) */}
            {!activeType.has_form && !signedData?.signed_at && (
              <label className="flex items-start gap-3 cursor-pointer bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                <input
                  type="checkbox"
                  className="mt-0.5 flex-shrink-0"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span className="text-sm text-indigo-800 font-medium">
                  {t('docs.agreeCheck')}
                </span>
              </label>
            )}

            {/* Signature area */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                {signedData?.signed_at ? t('docs.signatureOnFile') : t('docs.drawSignature')}
              </p>
              {signedData?.signed_at && signedData.signature_data ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-col gap-2">
                  <img
                    src={signedData.signature_data}
                    alt="Signature"
                    className="max-h-28 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <p className="text-xs text-gray-400">
                    {t('docs.signedOn', { date: fmtDateTime(signedData.signed_at) })}
                    {signedData.ip_address ? ` · ${t('docs.ipAddress', { ip: signedData.ip_address })}` : ''}
                  </p>
                </div>
              ) : (
                !signedData?.signed_at && <SignaturePad ref={sigRef} height={140} />
              )}
            </div>

            {/* Error */}
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            {/* Sign button */}
            {!signedData?.signed_at && (
              <div className="no-print pb-6">
                <Button fullWidth loading={saving} onClick={handleSign}>
                  {t('docs.submitBtn', { title: activeType.title })}
                </Button>
                <p className="text-xs text-gray-400 text-center mt-2">
                  {t('docs.immutable')}
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
