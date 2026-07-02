import { useState, useEffect, useRef } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, isAfter } from 'date-fns'
import { listInvoices, uploadInvoice, deleteInvoice, getDownloadUrl } from '../../api/contractor'
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from '../../api/push'

// ── helpers ─────────────────────────────────────────────────────────
const weekStart = (d) => startOfWeek(d, { weekStartsOn: 1 })
const weekEnd   = (d) => endOfWeek(d,   { weekStartsOn: 1 })
const fmt       = (d) => format(d, 'MMM d, yyyy')
const fmtShort  = (d) => format(d, 'MMM d')

function useWeek(offset) {
  const now  = new Date()
  const base = addWeeks(weekStart(now), offset)
  return {
    start: base,
    end:   weekEnd(base),
    label: offset === 0 ? 'This Week' : offset === -1 ? 'Last Week' : `${fmtShort(base)} – ${fmtShort(weekEnd(base))}`,
  }
}

const STATUS_META = {
  submitted:    { label: 'Submitted',    color: 'bg-amber-100 text-amber-700' },
  under_review: { label: 'Under Review', color: 'bg-blue-100 text-blue-700' },
  check_ready:  { label: 'Check Ready',  color: 'bg-green-100 text-green-700' },
  paid:         { label: 'Paid',         color: 'bg-gray-100 text-gray-600' },
}

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
)

const BellIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} className="size-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
)

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

// ── Component ────────────────────────────────────────────────────────
export default function InvoicePortal() {
  const [offset, setOffset]         = useState(0)
  const week                         = useWeek(offset)

  const [invoices, setInvoices]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  // Upload modal
  const [uploading, setUploading]   = useState(false)
  const [uploadModal, setUploadModal] = useState(false)
  const [amount, setAmount]         = useState('')
  const [file, setFile]             = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [uploadWeekOffset, setUploadWeekOffset] = useState(0)
  const fileRef                      = useRef()

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]     = useState(false)

  // Push notifications
  const [pushSub, setPushSub]       = useState(null)
  const [pushLoading, setPushLoading] = useState(false)

  // ── Load invoices ────────────────────────────────────────────────
  async function load() {
    setLoading(true); setError(null)
    try {
      const data = await listInvoices()
      setInvoices(data.invoices ?? [])
    } catch { setError('Could not load invoices. Try again.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    getCurrentSubscription().then(setPushSub)
  }, [])

  // ── Push toggle ──────────────────────────────────────────────────
  async function togglePush() {
    setPushLoading(true)
    try {
      if (pushSub) {
        await unsubscribeFromPush()
        setPushSub(null)
      } else {
        const sub = await subscribeToPush()
        setPushSub(sub)
      }
    } catch (e) {
      console.error('Push toggle error:', e)
    }
    setPushLoading(false)
  }

  // ── Upload ───────────────────────────────────────────────────────
  function openUpload() {
    setAmount(''); setFile(null); setUploadError(null)
    setUploadWeekOffset(0); setUploadModal(true)
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) { setUploadError('Please select a file.'); return }

    const uploadWeek = useWeekObj(uploadWeekOffset)
    const form = new FormData()
    form.append('file', file)
    form.append('period_start', format(uploadWeek.start, 'yyyy-MM-dd'))
    form.append('period_end',   format(uploadWeek.end,   'yyyy-MM-dd'))
    if (amount) form.append('amount', amount)

    setUploading(true); setUploadError(null)
    try {
      await uploadInvoice(form)
      setUploadModal(false)
      load()
    } catch (err) {
      setUploadError(err?.response?.data?.error ?? 'Upload failed. Try again.')
    }
    setUploading(false)
  }

  function useWeekObj(off) {
    const now  = new Date()
    const base = addWeeks(weekStart(now), off)
    return { start: base, end: weekEnd(base) }
  }

  // ── Delete ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteInvoice(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch { alert('Could not delete invoice.') }
    setDeleting(false)
  }

  // ── Filter by selected week ──────────────────────────────────────
  const weekInvoices = invoices.filter((inv) => {
    const ps = new Date(inv.period_start + 'T00:00:00')
    const pe = new Date(inv.period_end   + 'T00:00:00')
    return !isAfter(ps, week.end) && !isAfter(week.start, pe)
  })

  // Current week check
  const thisWeekHasInvoice = weekInvoices.length > 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header + push toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit your weekly invoice and track payments</p>
        </div>
        <button
          onClick={togglePush}
          disabled={pushLoading}
          title={pushSub ? 'Notifications on — click to turn off' : 'Enable push notifications'}
          className={`p-2 rounded-xl transition-colors ${pushSub ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          <BellIcon active={!!pushSub} />
        </button>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-200 px-4 py-3">
        <button onClick={() => setOffset((o) => o - 1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-900">{week.label}</p>
          <p className="text-xs text-gray-500">{fmt(week.start)} – {fmt(week.end)}</p>
        </div>
        <button
          onClick={() => setOffset((o) => o + 1)}
          disabled={offset >= 0}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* This-week invoice or CTA */}
      {offset === 0 && (
        <div className={`rounded-2xl border p-5 ${thisWeekHasInvoice ? 'bg-green-50 border-green-200' : 'bg-white border-dashed border-gray-300'}`}>
          {thisWeekHasInvoice ? (
            <p className="text-green-700 font-medium text-sm">
              Invoice submitted for this week. We'll notify you when your check is ready.
            </p>
          ) : (
            <div className="text-center space-y-3">
              <p className="text-gray-500 text-sm">No invoice submitted for this week yet.</p>
              <button
                onClick={openUpload}
                className="inline-flex items-center gap-2 bg-brand-500 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors"
              >
                <UploadIcon />
                Submit Invoice
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invoice list for selected week */}
      <div className="space-y-3">
        {loading && <p className="text-center text-gray-400 py-8">Loading…</p>}
        {error && <p className="text-center text-red-500 py-4">{error}</p>}

        {!loading && !error && weekInvoices.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No invoices for this week.</p>
            {offset !== 0 && (
              <button onClick={openUpload} className="mt-3 text-brand-500 text-sm hover:underline">
                Submit one
              </button>
            )}
          </div>
        )}

        {weekInvoices.map((inv) => {
          const meta = STATUS_META[inv.status] ?? STATUS_META.submitted
          return (
            <div key={inv.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span>
                    {inv.status === 'check_ready' && (
                      <span className="text-green-600 text-xs font-medium">🎉 Ready for pickup!</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-700 font-medium truncate">{inv.file_original_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtShort(new Date(inv.period_start + 'T00:00:00'))} – {fmtShort(new Date(inv.period_end + 'T00:00:00'))}
                    {inv.amount ? ` · $${parseFloat(inv.amount).toFixed(2)}` : ''}
                  </p>
                  {inv.admin_note && (
                    <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="font-medium">Note: </span>{inv.admin_note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a
                    href={getDownloadUrl(inv.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
                    title="View invoice"
                  >
                    <ExternalIcon />
                  </a>
                  {inv.status === 'submitted' && (
                    <button
                      onClick={() => setDeleteTarget(inv)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-400"
                      title="Delete invoice"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* All other invoices summary */}
      {offset === 0 && invoices.filter((i) => !weekInvoices.includes(i)).length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">History</h2>
          <div className="space-y-2">
            {invoices.filter((i) => !weekInvoices.includes(i)).slice(0, 8).map((inv) => {
              const meta = STATUS_META[inv.status] ?? STATUS_META.submitted
              return (
                <div key={inv.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color} mr-2`}>{meta.label}</span>
                    <span className="text-sm text-gray-600">
                      {fmtShort(new Date(inv.period_start + 'T00:00:00'))} – {fmtShort(new Date(inv.period_end + 'T00:00:00'))}
                      {inv.amount ? ` · $${parseFloat(inv.amount).toFixed(2)}` : ''}
                    </span>
                  </div>
                  <a href={getDownloadUrl(inv.id)} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 p-1">
                    <ExternalIcon />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Upload modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">Submit Invoice</h2>

            <form onSubmit={handleUpload} className="space-y-4">
              {/* Week for upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pay Week</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setUploadWeekOffset((o) => o - 1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="flex-1 text-center text-sm font-medium text-gray-800">
                    {uploadWeekOffset === 0 ? 'This Week' : uploadWeekOffset === -1 ? 'Last Week' : `${fmtShort(useWeekObj(uploadWeekOffset).start)} – ${fmtShort(useWeekObj(uploadWeekOffset).end)}`}
                  </span>
                  <button type="button" onClick={() => setUploadWeekOffset((o) => o + 1)} disabled={uploadWeekOffset >= 0}
                    className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Amount (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* File */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice File</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-brand-500 transition-colors"
                >
                  {file ? (
                    <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                  ) : (
                    <>
                      <UploadIcon />
                      <p className="text-sm text-gray-500 mt-1">Tap to choose a PDF or photo</p>
                      <p className="text-xs text-gray-400">PDF, JPEG, PNG, WEBP · max 10 MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files[0] ?? null)}
                />
              </div>

              {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setUploadModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={uploading}
                  className="flex-1 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60">
                  {uploading ? 'Uploading…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Delete Invoice?</h2>
            <p className="text-sm text-gray-500">
              This will permanently delete <span className="font-medium">{deleteTarget.file_original_name}</span>. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
