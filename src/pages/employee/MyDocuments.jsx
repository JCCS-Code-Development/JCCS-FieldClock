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
const selectCls = `${inputCls} bg-white`

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

function I9Form({ data, onChange, disabled, empName }) {
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
export default function MyDocuments() {
  const { user } = useAuthStore()
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language.startsWith('es') ? es : enUS
  const fmtDate  = (iso) => format(parseISO(iso), 'MMMM d, yyyy', { locale: dfLocale })
  const fmtDateTime = (iso) => format(parseISO(iso), "MMMM d, yyyy 'at' h:mm a", { locale: dfLocale })
  const [agreements, setAgreements]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [activeType, setActiveType]     = useState(null)
  const [signedData, setSignedData]     = useState(null)  // full signed doc for view mode
  const [formData, setFormData]         = useState({})
  const [agreed, setAgreed]             = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const sigRef = useRef(null)

  const requiredDefs = AGREEMENT_DEFS.filter((d) =>
    d.required_for.includes('all') || (d.required_for.includes('w2') && user?.pay_type === 'w2')
  )

  const load = useCallback(() => {
    setLoading(true)
    listAgreements().then((d) => setAgreements(d.agreements ?? [])).finally(() => setLoading(false))
  }, [])

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
    setFormData({})
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
