import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useTheme } from '../contexts/ThemeContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { colors, typography, spacing, radii, shadows, isDarkTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  // Demo accounts pop-up (opens automatically on the sign-in page)
  const [showDemoInfo, setShowDemoInfo] = useState(true);
  const demoAccounts = [
    { role: t('login.demoRoleParent'), email: 'demo.parent@example.com', password: 'DemoParent-9R7kX2Lq' },
    { role: t('login.demoRoleBusAdmin'), email: 'demo.busadmin@example.com', password: 'DemoBusAdmin-4Vn8Mt6Z' },
    { role: t('login.demoRoleSchoolAdmin'), email: 'demo.schooladmin@example.com', password: 'DemoSchoolAdmin-7Hb3Pq9F' },
  ];

  // Show session expired banner if redirected from ProtectedRoute
  const sessionExpired = location.state?.sessionExpired === true;

  // ── Forgot password state ─────────────────────────────────────────────────
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState(''); // 'success' | 'error' | ''
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // If already logged in, push them out immediately
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleDoc = await getDoc(doc(db, 'roles', user.uid));
          if (roleDoc.exists()) {
            const role = roleDoc.data().role;
            if (role === 'school_admin') navigate('/school-admin');
            else if (role === 'bus_admin') navigate('/bus-admin');
            else if (role === 'parent') navigate('/parent');
            else {
              auth.signOut();
              setError(t('login.errInvalidRole'));
              setAuthChecking(false);
            }
          } else {
            auth.signOut();
            setError(t('login.errNoRole'));
            setAuthChecking(false);
          }
        } catch (err) {
          console.error('Role check error:', err);
          auth.signOut();
          setError(t('login.errVerifyFailed'));
          setAuthChecking(false);
        }
      } else {
        setAuthChecking(false);
      }
    });

    return unsubscribe;
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const roleDoc = await getDoc(doc(db, 'roles', user.uid));

      if (roleDoc.exists()) {
        const role = roleDoc.data().role;
        if (role === 'school_admin') navigate('/school-admin');
        else if (role === 'bus_admin') navigate('/bus-admin');
        else if (role === 'parent') navigate('/parent');
        else {
          setError(t('login.errInvalidRole'));
          auth.signOut();
        }
      } else {
        setError(t('login.errNoRole'));
        auth.signOut();
      }
    } catch (err) {
      console.error('Login error:', err);
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError(t('login.errInvalidCredentials'));
          break;
        case 'auth/too-many-requests':
          setError(t('login.errTooManyRequests'));
          break;
        default:
          setError(t('login.errGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password handler ───────────────────────────────────────────────
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetStatus('');
    setResetMessage('');

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetStatus('success');
      setResetMessage(t('login.resetSuccess'));
      setResetEmail('');
    } catch (err) {
      console.error('Reset error:', err);
      setResetStatus('error');
      switch (err.code) {
        case 'auth/user-not-found':
          setResetMessage(t('login.errResetUserNotFound'));
          break;
        case 'auth/invalid-email':
          setResetMessage(t('login.errResetInvalidEmail'));
          break;
        case 'auth/too-many-requests':
          setResetMessage(t('login.errResetTooMany'));
          break;
        default:
          setResetMessage(t('login.errResetGeneric'));
      }
    } finally {
      setResetLoading(false);
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
      padding: spacing[10],
      maxWidth: '400px',
      width: '100%',
      boxShadow: shadows.lg,
      transition: 'background-color 0.3s ease, border-color 0.3s ease'
    },
    title: {
      color: colors.textPrimary,
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold,
      margin: `0 0 ${spacing[2]} 0`,
      textAlign: 'center'
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: typography.sizes.sm,
      marginBottom: spacing[8],
      textAlign: 'center'
    },
    formGroup: {
      marginBottom: spacing[5],
    },
    label: {
      display: 'block',
      color: colors.textSecondary,
      fontSize: typography.sizes.sm,
      marginBottom: spacing[2],
      fontWeight: typography.weights.medium,
    },
    input: {
      width: '100%',
      padding: spacing[3],
      backgroundColor: colors.background,
      color: colors.textPrimary,
      border: `1px solid ${colors.borders}`,
      borderRadius: radii.sm,
      fontSize: typography.sizes.base,
      fontFamily: typography.fontFamily,
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    button: {
      width: '100%',
      padding: spacing[3],
      backgroundColor: colors.primary,
      color: isDarkTheme ? '#0f1117' : '#ffffff',
      border: 'none',
      borderRadius: radii.sm,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.7 : 1,
      marginTop: spacing[4],
      transition: 'all 0.2s',
    },
    error: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      color: colors.danger,
      padding: spacing[3],
      borderRadius: radii.sm,
      border: `1px solid ${colors.danger}`,
      fontSize: typography.sizes.sm,
      marginBottom: spacing[6],
      textAlign: 'center'
    },
    spinner: {
      display: 'inline-block',
      width: '16px',
      height: '16px',
      border: `2px solid ${isDarkTheme ? '#0f1117' : '#ffffff'}`,
      borderTop: `2px solid transparent`,
      borderRadius: radii.full,
      animation: 'spin 1s linear infinite',
      marginRight: spacing[2],
      verticalAlign: 'middle'
    },
    forgotLink: {
      display: 'block',
      textAlign: 'right',
      marginTop: spacing[2],
      fontSize: typography.sizes.sm,
      color: colors.primary,
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      padding: 0,
      fontFamily: typography.fontFamily,
      textDecoration: 'underline',
    },
    backLink: {
      display: 'block',
      textAlign: 'center',
      marginTop: spacing[4],
      fontSize: typography.sizes.sm,
      color: colors.textSecondary,
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      padding: 0,
      fontFamily: typography.fontFamily,
      textDecoration: 'underline',
    },
    successMsg: {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      color: colors.success,
      padding: spacing[3],
      borderRadius: radii.sm,
      border: `1px solid ${colors.success}`,
      fontSize: typography.sizes.sm,
      marginBottom: spacing[4],
      textAlign: 'center'
    },
  };

  if (authChecking) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.spinner, width: '40px', height: '40px', border: `3px solid ${colors.borders}`, borderTop: `3px solid ${colors.accent}` }} />
      </div>
    );
  }

  // ── Forgot Password View ──────────────────────────────────────────────────
  if (showForgotPassword) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>{t('login.resetTitle')}</h1>
          <p style={styles.subtitle}>{t('login.resetSubtitle')}</p>

          {resetStatus === 'success' && (
            <div style={styles.successMsg}>{resetMessage}</div>
          )}
          {resetStatus === 'error' && (
            <div style={styles.error}>{resetMessage}</div>
          )}

          <form onSubmit={handlePasswordReset}>
            <div style={styles.formGroup}>
              <label style={styles.label}>{t('login.email')}</label>
              <input
                type="email"
                style={styles.input}
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                disabled={resetLoading}
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            <button
              type="submit"
              style={{ ...styles.button, cursor: resetLoading ? 'not-allowed' : 'pointer', opacity: resetLoading ? 0.7 : 1 }}
              disabled={resetLoading}
            >
              {resetLoading ? (
                <><span style={styles.spinner}></span> {t('login.sending')}</>
              ) : (
                t('login.sendResetEmail')
              )}
            </button>
          </form>

          <button
            style={styles.backLink}
            onClick={() => {
              setShowForgotPassword(false);
              setResetStatus('');
              setResetMessage('');
              setResetEmail('');
            }}
          >
            ← {t('login.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  // ── Normal Login View ─────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{t('login.welcomeBack')}</h1>
        <p style={styles.subtitle}>{t('login.subtitle')}</p>

        {/* Session expired banner */}
        {sessionExpired && (
          <div style={{ ...styles.error, backgroundColor: 'rgba(251, 191, 36, 0.1)', color: '#f59e0b', borderColor: '#f59e0b', marginBottom: spacing[4] }}>
            ⏱ {t('login.sessionExpired')}
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div style={styles.formGroup}>
            <label style={styles.label}>{t('login.email')}</label>
            <input
              type="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder={t('login.emailPlaceholder')}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t('login.password')}</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
            />
            {/* Forgot password link */}
            <button
              type="button"
              style={styles.forgotLink}
              onClick={() => {
                setShowForgotPassword(true);
                setResetEmail(email); // pre-fill with whatever they typed
                setError('');
              }}
            >
              {t('login.forgotPassword')}
            </button>
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? (
              <><span style={styles.spinner}></span> {t('login.verifying')}</>
            ) : (
              t('common.signIn')
            )}
          </button>
        </form>

        <button
          type="button"
          style={styles.backLink}
          onClick={() => setShowDemoInfo(true)}
        >
          {t('login.demoShow')}
        </button>

        <div style={{ marginTop: spacing[6], textAlign: 'center' }}>
          <LanguageSwitcher variant="inline" />
        </div>
      </div>

      {/* Demo accounts pop-up */}
      {showDemoInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing[4],
            zIndex: 1000,
          }}
          onClick={() => setShowDemoInfo(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-accounts-title"
            style={{
              backgroundColor: colors.cards,
              border: `1px solid ${colors.borders}`,
              borderRadius: radii.lg,
              boxShadow: shadows.lg,
              padding: spacing[6],
              maxWidth: '420px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxSizing: 'border-box',
              fontFamily: typography.fontFamily,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="demo-accounts-title"
              style={{
                color: colors.textPrimary,
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold,
                margin: `0 0 ${spacing[2]} 0`,
                textAlign: 'center',
              }}
            >
              {t('login.demoTitle')}
            </h2>
            <p style={{ ...styles.subtitle, marginBottom: spacing[4] }}>{t('login.demoNote')}</p>

            {demoAccounts.map((acc) => (
              <div
                key={acc.email}
                style={{
                  backgroundColor: colors.background,
                  border: `1px solid ${colors.borders}`,
                  borderRadius: radii.sm,
                  padding: spacing[3],
                  marginBottom: spacing[3],
                  fontSize: typography.sizes.sm,
                  color: colors.textSecondary,
                }}
              >
                <div style={{ color: colors.textPrimary, fontWeight: typography.weights.semibold, marginBottom: spacing[1] }}>
                  {acc.role}
                </div>
                <div>
                  {t('login.demoEmail')}:{' '}
                  <code dir="ltr" style={{ color: colors.textPrimary, userSelect: 'all', wordBreak: 'break-all' }}>{acc.email}</code>
                </div>
                <div>
                  {t('login.demoPassword')}:{' '}
                  <code dir="ltr" style={{ color: colors.textPrimary, userSelect: 'all', wordBreak: 'break-all' }}>{acc.password}</code>
                </div>
              </div>
            ))}

            <button
              type="button"
              style={{ ...styles.button, cursor: 'pointer', opacity: 1, marginTop: spacing[2] }}
              onClick={() => setShowDemoInfo(false)}
            >
              {t('login.demoClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
