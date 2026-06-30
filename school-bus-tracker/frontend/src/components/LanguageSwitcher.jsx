import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n';

/**
 * Compact EN/AR toggle button. Switching language also flips the document
 * direction (handled in i18n/index.js) so the whole UI mirrors to RTL.
 *
 * Props:
 *   variant — 'button' (default, for headers) | 'inline' (text link, for login)
 */
export default function LanguageSwitcher({ variant = 'button' }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language || 'en';

  // The language we'll switch TO when clicked (toggle between the two).
  const next = SUPPORTED_LANGUAGES.find((l) => l.code !== current) || SUPPORTED_LANGUAGES[0];

  const switchTo = () => i18n.changeLanguage(next.code);

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={switchTo}
        title={t('common.language')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--primary-color)',
          font: 'inherit',
          textDecoration: 'underline',
        }}
      >
        <Languages size={14} /> {next.label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      title={t('common.language')}
      aria-label={t('common.language')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 12px',
        background: 'transparent',
        border: '1px solid var(--borders)',
        borderRadius: 9999,
        color: 'var(--text-muted)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Languages size={16} /> {next.label}
    </button>
  );
}
