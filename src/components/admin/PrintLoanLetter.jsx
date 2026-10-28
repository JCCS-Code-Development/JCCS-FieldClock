import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, addDays, parseISO } from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import { formatCurrency } from '../../utils/format'

// Printable bilingual letters for a loan pagaré (wording matches sections 4,
// 6 and 7 of api/loans/_note_template.php):
//   kind 'late'   — W-2 only: 7-day written notice before deducting missed
//                   Zelle installments from wages (required by the note and
//                   by SC's 7-day rule before a deduction change)
//   kind 'demand' — balance still owed after the 30-day post-separation
//                   deadline: demand for payment before going to court
// `row` is a row from api/loans/due.php.
const LENDER = 'JCCS Services LLC'
const ZELLE  = 'Laura Garcia'

const noteNo = (id) => `L-${String(id).padStart(4, '0')}`
const en = (d) => format(d, 'MMMM d, yyyy')
const es = (d) => format(d, "d 'de' MMMM 'de' yyyy", { locale: esLocale })

export default function PrintLoanLetter({ kind, row, onClose, onPrinted }) {
  const today = new Date()
  const [letterDate, setLetterDate] = useState(format(today, 'yyyy-MM-dd'))
  const [actionDate, setActionDate] = useState(format(addDays(today, kind === 'late' ? 7 : 10), 'yyyy-MM-dd'))
  const minAction = format(addDays(parseISO(letterDate), kind === 'late' ? 7 : 1), 'yyyy-MM-dd')

  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'loan-letter-print'
    s.textContent = `@media print { @page { size: letter; margin: 0.8in; } body > *:not(#loan-letter-root) { display: none !important; } #loan-letter-root { position: static !important; overflow: visible !important; background: #fff !important; } .no-print { display: none !important; } .letter-page { box-shadow: none !important; margin: 0 !important; } .letter-break { page-break-before: always; } }`
    document.head.appendChild(s)
    return () => document.getElementById('loan-letter-print')?.remove()
  }, [])

  const d  = parseISO(letterDate)
  const ad = parseISO(actionDate < minAction ? minAction : actionDate)
  const amount = kind === 'late' ? row.behind : row.remaining
  const dueDate = row.balance_due_date ? parseISO(row.balance_due_date) : null

  const body = kind === 'late' ? {
    en: {
      title: 'NOTICE OF PAYROLL DEDUCTION FOR MISSED LOAN INSTALLMENTS',
      paras: [
        `Under Promissory Note No. ${noteNo(row.loan_id)}, you agreed to pay weekly installments by Zelle to ${ZELLE}, on behalf of ${LENDER}. As of the date of this notice, ${formatCurrency(amount)} in installments is more than 14 days overdue.`,
        `As authorized in section 4 of the Note, the Company will deduct ${formatCurrency(amount)} from your wages on or after ${en(ad)}. This notice is given at least 7 days before the deduction.`,
        `To avoid the deduction, send the overdue amount by Zelle to ${ZELLE} before ${en(ad)}. If you have questions or believe this amount is wrong, contact the office before that date.`,
      ],
    },
    es: {
      title: 'AVISO DE DESCUENTO DE SALARIO POR CUOTAS DE PRÉSTAMO ATRASADAS',
      paras: [
        `Según el Pagaré No. ${noteNo(row.loan_id)}, usted acordó pagar cuotas semanales mediante Zelle a ${ZELLE}, en nombre de ${LENDER}. A la fecha de este aviso, ${formatCurrency(amount)} en cuotas tienen más de 14 días de atraso.`,
        `Según lo autorizado en la sección 4 del Pagaré, la Compañía descontará ${formatCurrency(amount)} de su salario a partir del ${es(ad)}. Este aviso se entrega con al menos 7 días de anticipación al descuento.`,
        `Para evitar el descuento, envíe la cantidad atrasada mediante Zelle a ${ZELLE} antes del ${es(ad)}. Si tiene preguntas o cree que esta cantidad es incorrecta, comuníquese con la oficina antes de esa fecha.`,
      ],
    },
  } : {
    en: {
      title: 'DEMAND FOR PAYMENT',
      paras: [
        `Under Promissory Note No. ${noteNo(row.loan_id)}, the unpaid balance of your loan from ${LENDER} became due when your employment or engagement ended, and any amount not covered by your final pay was due in full${dueDate ? ` by ${en(dueDate)}` : ' within 30 days'}.`,
        `The balance of ${formatCurrency(amount)} remains unpaid. The Company demands payment of ${formatCurrency(amount)} by ${en(ad)}, by Zelle to ${ZELLE} or as the Company directs in writing.`,
        `If the balance is not paid by that date, the Company may file a claim in South Carolina magistrate court to collect it. Under section 7 of the Note, you would also be responsible for reasonable costs of collection, including attorney's fees of up to 15% of the unpaid balance.`,
      ],
    },
    es: {
      title: 'REQUERIMIENTO DE PAGO',
      paras: [
        `Según el Pagaré No. ${noteNo(row.loan_id)}, el saldo pendiente de su préstamo de ${LENDER} se volvió exigible al terminar su empleo o contratación, y cualquier cantidad no cubierta por su pago final debía pagarse en su totalidad${dueDate ? ` a más tardar el ${es(dueDate)}` : ' dentro de 30 días'}.`,
        `El saldo de ${formatCurrency(amount)} sigue sin pagarse. La Compañía le requiere el pago de ${formatCurrency(amount)} a más tardar el ${es(ad)}, mediante Zelle a ${ZELLE} o como la Compañía indique por escrito.`,
        `Si el saldo no se paga para esa fecha, la Compañía podrá presentar una demanda en el tribunal de magistrados de Carolina del Sur para cobrarlo. Según la sección 7 del Pagaré, usted también sería responsable de los costos razonables de cobranza, incluidos honorarios de abogado de hasta el 15% del saldo pendiente.`,
      ],
    },
  }

  const Page = ({ lang, className = '' }) => {
    const b = body[lang]
    return (
      <div className={`letter-page bg-white shadow-md w-full max-w-[8.5in] px-12 py-10 text-[13px] leading-relaxed text-gray-900 ${className}`}>
        <p className="font-bold text-base">{LENDER}</p>
        <p className="text-gray-500 text-xs mb-8">South Carolina</p>
        <p>{lang === 'es' ? es(d) : en(d)}</p>
        <p className="mt-4">{row.user_name}</p>
        <p className="mt-8 font-bold">{b.title}</p>
        <p className="mt-1 text-gray-500 text-xs">{lang === 'es' ? 'Pagaré' : 'Note'} No. {noteNo(row.loan_id)}</p>
        {b.paras.map((p, i) => <p key={i} className="mt-4">{p}</p>)}
        <div className="mt-12 grid grid-cols-2 gap-10">
          <div>
            <div className="border-b border-gray-800 h-10" />
            <p className="text-xs mt-1">{lang === 'es' ? `Por ${LENDER}` : `For ${LENDER}`}</p>
          </div>
          <div>
            <div className="border-b border-gray-800 h-10" />
            <p className="text-xs mt-1">{lang === 'es' ? 'Recibido por el empleado (firma y fecha)' : 'Received by employee (signature and date)'}</p>
          </div>
        </div>
      </div>
    )
  }

  return createPortal(
    <div id="loan-letter-root" style={{ position: 'fixed', inset: 0, background: '#f1f5f9', zIndex: 9999, overflowY: 'auto' }}>
      <div className="no-print sticky top-0 z-10 bg-slate-900 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">{kind === 'late' ? 'Late Payment Notice' : 'Demand Letter'} — {row.user_name}</p>
          <p className="text-xs text-slate-400">Prints English and Spanish. Give a copy to the employee and keep one.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[10px] uppercase tracking-wider text-slate-400 font-bold gap-1">
            Letter date
            <input type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white normal-case" />
          </label>
          <label className="flex flex-col text-[10px] uppercase tracking-wider text-slate-400 font-bold gap-1">
            {kind === 'late' ? 'Deduct on/after (min 7 days)' : 'Pay by'}
            <input type="date" value={actionDate} min={minAction} onChange={(e) => setActionDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white normal-case" />
          </label>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm">← Back</button>
          <button onClick={() => { window.print(); onPrinted?.() }} className="px-5 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold">Print</button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-8 py-8 px-4">
        <Page lang="en" />
        <Page lang="es" className="letter-break" />
      </div>
    </div>,
    document.body
  )
}
