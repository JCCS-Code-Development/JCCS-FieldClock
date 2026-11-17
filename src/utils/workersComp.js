// Shared option lists for the workers' comp coverage form (My Docs) and the
// insurance-agent Excel export (HR Compliance). Tuples are [value, en, es].
export const WC_PLANS = {
  ghost:   { en: 'Ghost Policy (default)',            es: 'Póliza Fantasma (predeterminada)' },
  premium: { en: 'Premium Plan — with Health Coverage', es: 'Plan Premium — con Cobertura de Salud' },
}
export const WC_TRADES = [
  ['general_labor', 'General Labor', 'Labor General'],
  ['carpentry',     'Carpentry',     'Carpintería'],
  ['drywall',       'Drywall',       'Drywall / Tablaroca'],
  ['painting',      'Painting',      'Pintura'],
  ['flooring',      'Flooring',      'Pisos'],
  ['electrical',    'Electrical',    'Electricidad'],
  ['plumbing',      'Plumbing',      'Plomería'],
  ['roofing',       'Roofing',       'Techos'],
  ['other',         'Other',         'Otro'],
]
export const WC_TIERS = [
  ['self',     'Me only',               'Solo yo'],
  ['spouse',   'Me + spouse',           'Yo + cónyuge'],
  ['children', 'Me + child(ren)',       'Yo + hijo(s)'],
  ['family',   'Me + spouse + children', 'Yo + cónyuge + hijos'],
]
export const WC_DEPENDENT_SLOTS = 4

// ── Report wording (review table + Excel export), English / Spanish ─────────
const REPORT_TIERS = {
  self:     ['Employee only',               'Solo el empleado'],
  spouse:   ['Employee + spouse',           'Empleado + cónyuge'],
  children: ['Employee + child(ren)',       'Empleado + hijo(s)'],
  family:   ['Employee + spouse + children', 'Empleado + cónyuge + hijos'],
}
const REPORT_TEXT = {
  en: {
    sheet: "Workers' Comp", missingSheet: 'Not Yet Submitted', fileName: 'JCCS Workers Comp',
    name: 'Full Legal Name', plan: 'Coverage Plan', taxIdType: 'Tax ID Type', taxId: 'Tax ID / SSN',
    dob: 'Date of Birth', phone: 'Phone', email: 'Email', address: 'Address', cityStateZip: 'City, State, ZIP',
    trade: 'Trade', work: 'Work Description', propertyType: 'Property Type', years: 'Years Experience',
    start: 'Requested Start Date', healthFor: 'Health Coverage For', currentIns: 'Current Health Insurance',
    family: 'Family Members Covered', signed: 'Form Signed', photo: 'Photo ID', payType: 'Pay Type',
    notOnFile: 'Not on file', dobShort: 'DOB', ghost: 'Ghost Policy', premium: 'Premium Plan — with Health Coverage',
    ghostShort: 'Ghost', premiumShort: 'Premium + Health', commercial: 'Commercial',
    spouse: 'spouse', child: 'child',
    submitted: 'submitted', notSubmitted: 'not yet submitted', missingPhoto: 'missing ID photo',
    tabSubmitted: 'Submitted', tabMissing: 'Not yet submitted', download: 'Download Excel',
    noneSubmitted: "No workers' comp forms have been submitted yet.", allDone: 'Everyone who needs to has submitted the form.',
    none: 'None', viewId: 'View ID', closeHint: 'Click anywhere to close', workCol: 'Trade & Work', startCol: 'Start',
    footer: 'Tax IDs are masked on screen; the downloaded Excel file contains them in full along with the ID photos — send it to the agent securely.',
  },
  es: {
    sheet: 'Compensación Laboral', missingSheet: 'Pendientes', fileName: 'JCCS Compensacion Laboral',
    name: 'Nombre Legal Completo', plan: 'Plan de Cobertura', taxIdType: 'Tipo de Número Fiscal', taxId: 'Tax ID / SSN',
    dob: 'Fecha de Nacimiento', phone: 'Teléfono', email: 'Correo Electrónico', address: 'Dirección', cityStateZip: 'Ciudad, Estado, Código Postal',
    trade: 'Oficio', work: 'Descripción del Trabajo', propertyType: 'Tipo de Propiedad', years: 'Años de Experiencia',
    start: 'Fecha de Inicio Solicitada', healthFor: 'Cobertura de Salud Para', currentIns: 'Seguro de Salud Actual',
    family: 'Familiares Cubiertos', signed: 'Formulario Firmado', photo: 'Foto de Identificación', payType: 'Tipo de Pago',
    notOnFile: 'No registrada', dobShort: 'Nac.', ghost: 'Póliza Fantasma', premium: 'Plan Premium — con Cobertura de Salud',
    ghostShort: 'Fantasma', premiumShort: 'Premium + Salud', commercial: 'Comercial',
    spouse: 'cónyuge', child: 'hijo/a',
    submitted: 'enviados', notSubmitted: 'pendientes', missingPhoto: 'sin foto de identificación',
    tabSubmitted: 'Enviados', tabMissing: 'Pendientes', download: 'Descargar Excel',
    noneSubmitted: 'Todavía no se ha enviado ningún formulario de compensación laboral.', allDone: 'Todos los que deben llenarlo ya lo enviaron.',
    none: 'Ninguna', viewId: 'Ver identificación', closeHint: 'Haga clic en cualquier lugar para cerrar', workCol: 'Oficio y Trabajo', startCol: 'Inicio',
    footer: 'Los números fiscales están ocultos en pantalla; el archivo de Excel los incluye completos junto con las fotos de identificación — envíelo al agente de forma segura.',
  },
}

// Everything the report needs in one language: fixed labels plus helpers that
// turn stored form values into readable text.
export function wcReport(lang = 'en') {
  const es  = lang === 'es'
  const T   = REPORT_TEXT[es ? 'es' : 'en']
  const pick = (list, v) => { const r = list.find(([k]) => k === v); return r ? r[es ? 2 : 1] : (v ?? '') }
  return {
    ...T,
    planLabel:  (p) => (p === 'premium' ? T.premium : T.ghost),
    planShort:  (p) => (p === 'premium' ? T.premiumShort : T.ghostShort),
    tradeLabel: (v) => pick(WC_TRADES, v),
    tierLabel:  (v) => (REPORT_TIERS[v ?? 'self'] ?? REPORT_TIERS.self)[es ? 1 : 0],
    relLabel:   (v) => (v === 'spouse' ? T.spouse : v === 'child' ? T.child : (v ?? '')),
  }
}
