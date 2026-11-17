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
// All JCCS work is commercial; the carrier asks for it, so the export states it.
export const WC_PROPERTY_TYPE = 'Commercial'
