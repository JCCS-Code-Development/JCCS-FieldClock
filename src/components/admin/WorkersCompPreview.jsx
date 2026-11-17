import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import Button from '../ui/Button'
import { WC_TRADES, WC_TIERS, WC_DEPENDENT_SLOTS } from '../../utils/workersComp'

// On-screen review of every workers' comp form before downloading the Excel
// file for the insurance agent. Tax IDs are masked here (the Excel file has
// them in full).

const labelOf = (list, v) => list.find(([k]) => k === v)?.[1] ?? v ?? ''
const fmtDate = (v) => { if (!v) return '—'; try { return format(parseISO(v), 'MM/dd/yyyy') } catch { return v } }
const mask = (v) => {
  const s = String(v ?? '').replace(/\D/g, '')
  return s ? `•••-••-${s.slice(-4)}` : '—'
}

function Th({ children }) {
  return <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{children}</th>
}
function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 align-top text-sm text-gray-800 ${className}`}>{children}</td>
}

export default function WorkersCompPreview({ data, onDownload, downloading }) {
  const [photo, setPhoto] = useState(null)
  const [tab, setTab]     = useState('forms')
  const forms   = data?.forms ?? []
  const missing = data?.missing ?? []
  const premiumCount = forms.filter((f) => f.form_data?.plan === 'premium').length
  const noPhoto      = forms.filter((f) => !f.form_data?.id_photo).length

  return (
    <div className="flex flex-col gap-4">
      {/* Summary + download */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">{forms.length} submitted</span>
          <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">{forms.length - premiumCount} ghost</span>
          <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-700">{premiumCount} premium + health</span>
          {missing.length > 0 && <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700">{missing.length} not yet submitted</span>}
          {noPhoto > 0 && <span className="px-3 py-1 rounded-full bg-red-100 text-red-700">{noPhoto} missing ID photo</span>}
        </div>
        <Button onClick={onDownload} loading={downloading} disabled={!forms.length}>
          Download Excel
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['forms', `Submitted (${forms.length})`], ['missing', `Not yet submitted (${missing.length})`]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'forms' ? (
        forms.length === 0 ? (
          <p className="text-center text-gray-400 py-10">No workers' comp forms have been submitted yet.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <Th>ID</Th><Th>Name</Th><Th>Plan</Th><Th>Tax ID</Th><Th>Address</Th><Th>Phone / Email</Th>
                  <Th>Trade &amp; Work</Th><Th>Start</Th><Th>Injury (5 yrs)</Th>
                  <Th>Health Coverage</Th><Th>Signed</Th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f) => {
                  const d = f.form_data ?? {}
                  const premium = d.plan === 'premium'
                  const deps = premium && d.health_tier !== 'self'
                    ? Array.from({ length: WC_DEPENDENT_SLOTS }, (_, i) => i + 1).filter((n) => d[`dep${n}_name`]?.trim())
                    : []
                  return (
                    <tr key={f.user_id} className={`border-b border-gray-100 ${f.is_active ? '' : 'opacity-60'}`}>
                      <Td>
                        {d.id_photo ? (
                          <button onClick={() => setPhoto({ src: d.id_photo, name: d.legal_name || f.name })} title="View ID">
                            <img src={d.id_photo} alt="ID" className="w-16 h-11 object-cover rounded-md border border-gray-200 hover:ring-2 hover:ring-brand-400" />
                          </button>
                        ) : <span className="text-xs font-semibold text-red-600">None</span>}
                      </Td>
                      <Td className="font-semibold whitespace-nowrap">
                        {d.legal_name || f.name}
                        {d.dob && <span className="block text-xs font-normal text-gray-500">DOB {fmtDate(d.dob)}</span>}
                      </Td>
                      <Td>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${premium ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
                          {premium ? 'Premium + Health' : 'Ghost'}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs">
                        <span className="block text-gray-500">{(d.tax_id_type ?? '').toUpperCase()}</span>{mask(d.tax_id)}
                      </Td>
                      <Td className="min-w-[160px]">{d.address}<span className="block text-xs text-gray-500">{d.city_state_zip}</span></Td>
                      <Td className="text-xs whitespace-nowrap">{d.phone || f.phone || '—'}<span className="block text-gray-500">{d.email || f.email}</span></Td>
                      <Td className="min-w-[200px]">
                        <span className="font-medium">{labelOf(WC_TRADES, d.trade)}</span>
                        <span className="block text-xs text-gray-500">{d.job_duties}</span>
                      </Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDate(d.effective_date)}</Td>
                      <Td className="text-xs min-w-[90px]">
                        {d.prior_injury === 'yes'
                          ? <><span className="font-semibold text-red-600">Yes</span><span className="block text-gray-500">{d.prior_injury_details}</span></>
                          : d.prior_injury === 'no' ? 'No' : '—'}
                      </Td>
                      <Td className="text-xs min-w-[150px]">
                        {premium ? (
                          <>
                            <span className="font-medium">{labelOf(WC_TIERS, d.health_tier ?? 'self').replace(/^Me/, 'Employee')}</span>
                            {deps.map((n) => (
                              <span key={n} className="block text-gray-500">
                                {d[`dep${n}_name`]} ({d[`dep${n}_relationship`]}, {fmtDate(d[`dep${n}_dob`])})
                              </span>
                            ))}
                          </>
                        ) : '—'}
                      </Td>
                      <Td className="text-xs whitespace-nowrap">{fmtDate(f.signed_at)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        missing.length === 0 ? (
          <p className="text-center text-gray-400 py-10">Everyone who needs to has submitted the form.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200"><tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Pay Type</Th></tr></thead>
              <tbody>
                {missing.map((m) => (
                  <tr key={m.user_id} className="border-b border-gray-100">
                    <Td className="font-semibold">{m.name}</Td><Td>{m.phone ?? '—'}</Td><Td>{m.email ?? '—'}</Td><Td>{(m.pay_type ?? '').toUpperCase()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="text-xs text-gray-400">
        Tax IDs are masked on screen; the downloaded Excel file contains them in full along with the ID photos — send it to the agent securely.
      </p>

      {/* ID photo lightbox */}
      {photo && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center p-4" onClick={() => setPhoto(null)}>
          <img src={photo.src} alt={`${photo.name} ID`} className="max-w-full max-h-[80vh] rounded-lg" />
          <p className="text-white text-sm font-semibold mt-3">{photo.name}</p>
          <p className="text-white/60 text-xs mt-1">Click anywhere to close</p>
        </div>
      )}
    </div>
  )
}
