import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { colors, typography, spacing, radii, shadows, isDarkTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      navigate('/login');
    }
  };

  const styles = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: colors.background,
      fontFamily: typography.fontFamily,
      padding: spacing[4],
      transition: 'background-color 0.3s ease'
    },
    card: {
      backgroundColor: colors.cards,
      border: `1px solid ${colors.borders}`,
      borderRadius: radii.lg,
      padding: spacing[8],
      maxWidth: '450px',
      width: '100%',
      textAlign: 'center',
      boxShadow: shadows.lg,
      transition: 'background-color 0.3s ease, border-color 0.3s ease'
    },
    title: {
      color: colors.danger,
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold,
      margin: `0 0 ${spacing[2]} 0`,
    },
    message: {
      color: colors.textSecondary,
      fontSize: typography.sizes.base,
      marginBottom: spacing[8],
    },
    button: {
      width: '100%',
      padding: spacing[4],
      backgroundColor: colors.primary,
      color: isDarkTheme ? '#0f1117' : '#ffffff',
      border: 'none',
      borderRadius: radii.sm,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{t('unauthorized.title')}</h1>
        <p style={styles.message}>
          {t('unauthorized.message')}
        </p>
        <button style={styles.button} onClick={handleLogout}>
          🔙 {t('unauthorized.returnToLogin')}
        </button>
      </div>
    </div>
  );
}
