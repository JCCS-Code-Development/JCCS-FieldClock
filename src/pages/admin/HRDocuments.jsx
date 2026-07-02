import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import PageHeader from '../../components/admin/PageHeader'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { listAgreements, getAgreement, resetAgreement } from '../../api/agreements'

const ALL_TYPES = [
  { id: 'at_will',              short: 'At-Will',    color: 'indigo' },
  { id: 'non_solicitation',     short: 'Non-Sol.',   color: 'purple' },
  { id: 'conflict_of_interest', short: 'COI',        color: 'violet' },
  { id: 'emergency_contact',    short: 'Emergency',  color: 'sky'    },
  { id: 'i9',                   short: 'I-9',        color: 'amber'  },
  { id: 'w4',                   short: 'W-4',        color: 'amber'  },
]

const W2_ONLY = ['i9', 'w4']

const COLOR_CHIP = {
  signed:  'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  na:      'bg-gray-100 text-gray-400',
}

function StatusChip({ status }) {
  const cls = COLOR_CHIP[status] ?? COLOR_CHIP.na
  const label = status === 'signed' ? '✓ Signed' : status === 'pending' ? 'Pending' : 'N/A'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

export default function HRDocuments() {
  const [employees, setEmployees]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [viewModal, setViewModal]       = useState(null) // { emp, type, data }
  const [viewLoading, setViewLoading]   = useState(false)
  const [resetting, setResetting]       = useState(null)

  const load = () => {
    setLoading(true)
    listAgreements().then((d) => setEmployees(d.employees ?? [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openView = async (emp, type) => {
    setViewLoading(true)
    setViewModal({ emp, type, data: null })
    try {
      const data = await getAgreement({ user_id: emp.user_id, type })
      setViewModal({ emp, type, data })
    } catch { setViewModal({ emp, type, data: null }) }
    finally { setViewLoading(false) }
  }

  const handleReset = async () => {
    if (!resetting) return
    await resetAgreement({ user_id: resetting.emp.user_id, type: resetting.type })
    setResetting(null)
    setViewModal(null)
    load()
  }

  const relevantTypes = (emp) =>
    ALL_TYPES.filter((t) => !W2_ONLY.includes(t.id) || emp.pay_type === 'w2')

  const statusFor = (emp, typeId) => {
    if (W2_ONLY.includes(typeId) && emp.pay_type !== 'w2') return 'na'
    return emp.agreements?.[typeId] ? 'signed' : 'pending'
  }

  const complianceCount = (emp) => {
    const types = relevantTypes(emp)
    const done  = types.filter((t) => emp.agreements?.[t.id]).length
    return { done, total: types.length }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="HR Compliance"
        subtitle="Track employee agreement and document signing status"
      />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide min-w-[160px]">Employee</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Progress</th>
                {ALL_TYPES.map((t) => (
                  <th key={t.id} className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{t.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const { done, total } = complianceCount(emp)
                return (
                  <tr key={emp.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.pay_type?.toUpperCase()}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-bold ${done === total ? 'text-green-600' : 'text-amber-600'}`}>
                          {done}/{total}
                        </span>
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${done === total ? 'bg-green-500' : 'bg-amber-400'}`}
                            style={{ width: `${(done / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    {ALL_TYPES.map((t) => {
                      const status = statusFor(emp, t.id)
                      const isSigned = status === 'signed'
                      return (
                        <td key={t.id} className="px-3 py-3 text-center">
                          {status === 'na' ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <button
                              onClick={() => isSigned ? openView(emp, t.id) : null}
                              className={isSigned ? 'cursor-pointer' : 'cursor-default'}
                            >
                              <StatusChip status={status} />
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={ALL_TYPES.length + 2} className="text-center text-gray-400 py-12">
                    No active employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* View signed document modal */}
      <Modal
        isOpen={!!viewModal}
        onClose={() => setViewModal(null)}
        title={`${viewModal?.emp?.name} — ${ALL_TYPES.find((t) => t.id === viewModal?.type)?.short ?? ''}`}
        size="lg"
      >
        {viewLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : viewModal?.data ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Signed</p><p className="font-medium">{viewModal.data.signed_at ? format(parseISO(viewModal.data.signed_at), 'MMM d, yyyy h:mm a') : '—'}</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">IP Address</p><p className="font-medium font-mono text-xs">{viewModal.data.ip_address ?? '—'}</p></div>
            </div>

            {viewModal.data.form_data && Object.keys(viewModal.data.form_data).length > 1 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Form Data</p>
                <div className="grid grid-cols-1 gap-1.5 text-sm">
                  {Object.entries(viewModal.data.form_data).map(([k, v]) => {
                    if (!v || k === 'acknowledged') return null
                    return (
                      <div key={k} className="flex justify-between gap-4">
                        <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-right">{String(v)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {viewModal.data.signature_data && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Signature</p>
                <div className="border border-gray-200 rounded-xl p-3 bg-white">
                  <img src={viewModal.data.signature_data} alt="Signature" className="max-h-24 object-contain" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="danger"
                onClick={() => setResetting({ emp: viewModal.emp, type: viewModal.type })}
              >
                Reset — Allow Re-Sign
              </Button>
              <Button variant="secondary" onClick={() => setViewModal(null)}>Close</Button>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">Could not load document details.</p>
        )}
      </Modal>

      {/* Reset confirmation */}
      <Modal isOpen={!!resetting} onClose={() => setResetting(null)} title="Reset Agreement?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            This will delete the signed copy and allow <strong>{resetting?.emp?.name}</strong> to re-sign.
            This action is irreversible.
          </p>
          <div className="flex gap-3">
            <Button variant="danger" fullWidth onClick={handleReset}>Yes, Reset</Button>
            <Button variant="secondary" fullWidth onClick={() => setResetting(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
