import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '@shulkr/frontend/i18n/locales/en.json';
import fr from '@shulkr/frontend/i18n/locales/fr.json';
import es from '@shulkr/frontend/i18n/locales/es.json';
import de from '@shulkr/frontend/i18n/locales/de.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    showSupportNotice: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'shulkr-language',
    },
  })
  .then();

export default i18n;
