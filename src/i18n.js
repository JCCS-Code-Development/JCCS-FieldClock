import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import es from './locales/es.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    // Spanish is the app's default for anyone who hasn't picked a language
    // yet — intentionally not browser-locale-detected, so an English-locale
    // browser doesn't silently override it. localStorage (an explicit prior
    // choice via LangSwitcher) is the only thing allowed to take precedence.
    fallbackLng: 'es',
    supportedLngs: ['en', 'es'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'fieldclock-lang',
    },
  })

export default i18n
