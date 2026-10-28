import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { es as esLocale, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import SignaturePad from './ui/SignaturePad'
import Button from './ui/Button'
import { signLoanNote, countersignLoanNote, getMySignature, saveMySignature } from '../api/loans'

// Full-screen view of one loan pagaré (promissory note), used three ways:
//   mode 'sign'        — the borrower reads it in their language and signs
//   mode 'countersign' — an admin signs for the company after the borrower
//   mode 'view'        — read-only + print, for either side
// The text itself is always the server-rendered note_text_en/_es stored at
// creation (api/loans/_note_template.php), never rebuilt here, so what's on
// screen is exactly what the stored fingerprint covers.
const LENDER = 'JCCS Services LLC'

const parseDb = (s) => parseISO(String(s).replace(' ', 'T'))

export default function LoanNoteOverlay({ note, mode, onClose, onDone, onStale }) {
  // Borrower-facing strings follow the note's language, not the current app
  // language — the checkboxes ("I read this in Spanish…") must match the
  // version they're actually signing.
  const { i18n } = useTranslation()
  const t = i18n.getFixedT(note.language)
  const isAdminMode = mode !== 'sign'
  const [lang, setLang]       = useState(note.language)
  const [consent, setConsent] = useState(false)
  const [langAck, setLangAck] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const sigRef = useRef(null)

  // Countersigning: an admin's saved signature makes it one click. Without
  // one (or if they choose to draw a new one), they draw it and can save it.
  const countersigning = mode === 'countersign' && !note.company_signed_at
  const [savedSig, setSavedSig] = useState(undefined)   // undefined = loading, null = none
  const [drawNew,  setDrawNew]  = useState(false)
  const [saveSig,  setSaveSig]  = useState(true)
  useEffect(() => {
    if (!countersigning) return
    getMySignature().then((s) => setSavedSig(s ?? null)).catch(() => setSavedSig(null))
  }, [countersigning])
  const useSaved = countersigning && savedSig && !drawNew
  const dfLocale = lang === 'es' ? esLocale : enUS
  const fmtDateTime = (s) => format(parseDb(s), "MMMM d, yyyy h:mm a", { locale: dfLocale })
  const text = lang === 'es' ? note.note_text_es : note.note_text_en

  // Print just this document (same approach as My Documents).
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'loan-note-print'
    s.textContent = `@media print { @page { size: letter; margin: 0.75in; } body > *:not(#loan-note-root) { display: none !important; } #loan-note-root { position: static !important; overflow: visible !important; } .no-print { display: none !important; } }`
    document.head.appendChild(s)
    return () => document.getElementById('loan-note-print')?.remove()
  }, [])

  const handleSubmit = async () => {
    if (mode === 'sign') {
      if (!consent) { setError(t('pagare.errConsent')); return }
      if (!langAck) { setError(t('pagare.errLangAck')); return }
    }
    if (!useSaved && sigRef.current?.isEmpty()) { setError(mode === 'sign' ? t('pagare.errSignature') : 'Please draw your signature.'); return }
    setSaving(true); setError('')
    try {
      let res
      if (mode === 'sign') {
        res = await signLoanNote({ note_id: note.id, signature_data: sigRef.current.getDataURL(), esign_consent: true, language_ack: true })
      } else if (useSaved) {
        res = await countersignLoanNote({ note_id: note.id, use_saved: true })
      } else {
        const signature_data = sigRef.current.getDataURL()
        if (saveSig) await saveMySignature(signature_data)
        res = await countersignLoanNote({ note_id: note.id, signature_data })
      }
      onDone?.(res)
    } catch (err) {
      if (err?.response?.data?.stale) { onStale?.(); return }
      setError(err?.response?.data?.error ?? (mode === 'sign' ? t('pagare.errGeneric') : 'Could not save. Try again.'))
    } finally { setSaving(false) }
  }

  const title = isAdminMode ? (lang === 'es' ? 'Pagaré' : 'Promissory Note (Pagaré)') : t('pagare.title')

  return createPortal(
    <div id="loan-note-root" style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 9999, overflowY: 'auto' }}>
      {/* Header bar */}
      <div className="no-print sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 z-10">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-400 truncate">{note.borrower_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdminMode && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {['en', 'es'].map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold ${lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => window.print()}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
            {isAdminMode ? 'Print' : t('docs.printPdf')}
          </button>
          <button onClick={onClose}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
            {isAdminMode ? 'Close' : t('docs.close')}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {isAdminMode && lang !== note.language && (
          <p className="no-print text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            The employee {note.borrower_signed_at ? 'signed' : 'will sign'} the {note.language === 'es' ? 'Spanish' : 'English'} version — this is the translation.
          </p>
        )}

        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 print:bg-white print:border-0 print:p-0">
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{text}</div>
        </div>

        {/* Signatures */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SignatureBlock
            label={lang === 'es' ? 'Deudor' : 'Borrower'}
            name={note.borrower_name}
            image={note.borrower_signature}
            signedAt={note.borrower_signed_at && fmtDateTime(note.borrower_signed_at)}
            pad={mode === 'sign' && !note.borrower_signed_at ? <SignaturePad ref={sigRef} height={140} /> : null}
            waiting={lang === 'es' ? 'Pendiente de firma' : 'Not signed yet'}
          />
          <SignatureBlock
            label={lang === 'es' ? `Por ${LENDER}` : `For ${LENDER}`}
            name={note.company_signer_name}
            image={note.company_signature}
            signedAt={note.company_signed_at && fmtDateTime(note.company_signed_at)}
            pad={!countersigning ? null
              : savedSig === undefined ? <div className="h-20 flex items-center justify-center text-xs text-gray-300">Loading…</div>
              : useSaved ? (
                <div className="flex flex-col gap-1">
                  <img src={savedSig} alt="" className="max-h-28 object-contain self-start" />
                  <p className="text-xs text-gray-400">
                    Your saved signature ·{' '}
                    <button type="button" onClick={() => setDrawNew(true)} className="underline underline-offset-2 hover:text-gray-600">draw a different one</button>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <SignaturePad ref={sigRef} height={140} />
                  <label className="no-print flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={saveSig} onChange={(e) => setSaveSig(e.target.checked)} />
                    Save as my signature for future countersigning
                  </label>
                </div>
              )}
            waiting={lang === 'es' ? 'Pendiente de firma' : 'Not signed yet'}
          />
        </div>

        <p className="text-[11px] text-gray-400 break-all">
          {lang === 'es' ? 'Huella del documento (SHA-256): ' : 'Document fingerprint (SHA-256): '}{note.note_hash}
        </p>

        {/* Borrower: consent + language acknowledgment */}
        {mode === 'sign' && !note.borrower_signed_at && (
          <div className="no-print flex flex-col gap-3">
            <label className="flex items-start gap-3 cursor-pointer bg-indigo-50 rounded-xl p-4 border border-indigo-200">
              <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-sm text-indigo-800 font-medium">{t('pagare.consent')}</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer bg-indigo-50 rounded-xl p-4 border border-indigo-200">
              <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={langAck} onChange={(e) => setLangAck(e.target.checked)} />
              <span className="text-sm text-indigo-800 font-medium">{t('pagare.langAck')}</span>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        {((mode === 'sign' && !note.borrower_signed_at) || (mode === 'countersign' && !note.company_signed_at)) && (
          <div className="no-print pb-6">
            <Button fullWidth loading={saving} onClick={handleSubmit}>
              {mode === 'sign' ? t('pagare.signBtn') : useSaved ? 'Countersign with my saved signature' : 'Countersign for JCCS Services LLC'}
            </Button>
            <p className="text-xs text-gray-400 text-center mt-2">
              {mode === 'sign' ? t('pagare.afterSign') : 'Once countersigned the loan is active — hand over the money, and the employee is emailed a copy.'}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function SignatureBlock({ label, name, image, signedAt, pad, waiting }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      {pad ?? (image
        ? <img src={image} alt="" className="max-h-28 object-contain self-start" />
        : <div className="h-20 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300">{waiting}</div>)}
      {(name || signedAt) && (
        <p className="text-xs text-gray-500">{name}{name && signedAt ? ' · ' : ''}{signedAt}</p>
      )}
    </div>
  )
}
