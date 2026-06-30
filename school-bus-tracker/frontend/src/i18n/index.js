/**
 * i18n setup — react-i18next with English + Arabic, language persisted to
 * localStorage, and automatic LTR/RTL document direction switching.
 *
 * Usage in components:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   <h1>{t('login.welcomeBack')}</h1>
 *
 * To change language:
 *   import i18n from '../i18n';
 *   i18n.changeLanguage('ar');
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

export const RTL_LANGUAGES = ['ar'];

/** Apply <html dir/lang> + a body class so CSS can react to direction. */
export function applyDirection(lng) {
  const dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  const root = document.documentElement;
  root.setAttribute('dir', dir);
  root.setAttribute('lang', lng);
  document.body.classList.toggle('rtl', dir === 'rtl');
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app-language',
      caches: ['localStorage'],
    },
  });

// Keep document direction in sync with the active language.
applyDirection(i18n.resolvedLanguage || i18n.language || 'en');
i18n.on('languageChanged', applyDirection);

export default i18n;
