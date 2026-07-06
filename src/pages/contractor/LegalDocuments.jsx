import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { listDocuments, uploadDocument, getDocumentUrl } from '../../api/documents'

const DOC_TYPE_KEYS = [
  {
    key: 'w9',
    labelKey: 'contractor.docs.w9',
    descKey:  'contractor.docs.w9Desc',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-7 text-brand-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    key: 'workers_comp',
    labelKey: 'contractor.docs.workersComp',
    descKey:  'contractor.docs.workersCompDesc',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-7 text-brand-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
]

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
)

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5 text-green-600">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

export default function LegalDocuments() {
  const { t, i18n } = useTranslation()
  const dfnsLocale   = i18n.language.startsWith('es') ? es : enUS
  const DOC_TYPES    = DOC_TYPE_KEYS.map((d) => ({ ...d, label: t(d.labelKey), description: t(d.descKey) }))

  const [documents, setDocuments] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // Upload state: keyed by doc_type
  const [uploading, setUploading] = useState({})
  const [uploadErr, setUploadErr] = useState({})
  const fileRefs = { w9: useRef(), workers_comp: useRef() }

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const data = await listDocuments()
      setDocuments(data.documents ?? [])
    } catch { setError('Could not load documents. Try again.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const mostRecent = (type) =>
    documents.filter((d) => d.doc_type === type)[0] ?? null

  const handleFileSelect = async (docType, file) => {
    if (!file) return
    setUploadErr((e) => ({ ...e, [docType]: null }))
    setUploading((u) => ({ ...u, [docType]: true }))

    const form = new FormData()
    form.append('file', file)
    form.append('doc_type', docType)

    try {
      await uploadDocument(form)
      await load()
    } catch (err) {
      setUploadErr((e) => ({
        ...e,
        [docType]: err?.response?.data?.error ?? 'Upload failed. Try again.',
      }))
    }
    setUploading((u) => ({ ...u, [docType]: false }))
    // Reset input so same file can be re-selected if needed
    if (fileRefs[docType]?.current) fileRefs[docType].current.value = ''
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('contractor.docs.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('contractor.docs.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      <div className="space-y-4">
        {DOC_TYPES.map(({ key, label, description, icon }) => {
          const latest   = mostRecent(key)
          const history  = documents.filter((d) => d.doc_type === key)
          const isUploading = uploading[key]
          const err      = uploadErr[key]

          return (
            <div key={key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="flex items-start gap-4 px-5 py-5">
                <div className="mt-0.5 flex-shrink-0">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-gray-900">{label}</h2>
                    {latest ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckIcon />
                        {t('contractor.docs.onFile')}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        {t('contractor.docs.required')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>

                  {/* Most recent file */}
                  {latest && (
                    <div className="mt-3 flex items-center gap-2">
                      <a
                        href={getDocumentUrl(latest.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-700 transition-colors"
                      >
                        <ExternalIcon />
                        {latest.file_original_name}
                      </a>
                      <span className="text-xs text-gray-400">
                        · {format(parseISO(latest.uploaded_at), 'MMM d, yyyy', { locale: dfnsLocale })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Upload button */}
                <div className="flex-shrink-0">
                  <button
                    onClick={() => fileRefs[key]?.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60"
                  >
                    <UploadIcon />
                    {isUploading ? t('common.uploading') : latest ? t('contractor.docs.replace') : t('contractor.docs.upload')}
                  </button>
                  <input
                    ref={fileRefs[key]}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileSelect(key, e.target.files[0] ?? null)}
                  />
                </div>
              </div>

              {err && (
                <p className="text-xs text-red-600 px-5 pb-3 -mt-1">{err}</p>
              )}

              {/* Version history */}
              {history.length > 1 && (
                <div className="border-t border-gray-100 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('contractor.docs.previousVersions')}</p>
                  <div className="space-y-1.5">
                    {history.slice(1).map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2">
                        <a
                          href={getDocumentUrl(doc.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-500 hover:text-brand-500 transition-colors flex items-center gap-1"
                        >
                          <ExternalIcon />
                          {doc.file_original_name}
                        </a>
                        <span className="text-xs text-gray-300">
                          {format(parseISO(doc.uploaded_at), 'MMM d, yyyy', { locale: dfnsLocale })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center pb-4">{t('contractor.docs.footer')}</p>
    </div>
  )
}
