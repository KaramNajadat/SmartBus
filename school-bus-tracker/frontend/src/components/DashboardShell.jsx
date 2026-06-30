import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signOut } from 'firebase/auth';
import { Bus } from 'lucide-react';
import { auth } from '../firebase';
import { useTheme } from '../contexts/ThemeContext';
import LanguageSwitcher from './LanguageSwitcher';
import './DashboardShell.css';

export default function DashboardShell({
  // ── New layout props ──
  roleLabel,
  navItems = [],
  activeNavId,
  onNavChange,
  headerExtra,
  alertBadge,
  // ── Legacy props ──
  title,
  subtitle,
  children,
  loading = false,
  accessDenied = false,
  opsMode = false,
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [toastError, setToastError] = useState('');
  const { isDarkTheme, toggleTheme } = useTheme();

  // ── Sidebar state ──────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Live clock ─────────────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Responsive: auto-collapse on tablet, auto-hide on mobile ───────────────
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1024px)');
    const handler = (e) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    handler(mql);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Close mobile sidebar on route-like interactions
  const handleNavClick = useCallback((id) => {
    onNavChange?.(id);
    setMobileOpen(false);
  }, [onNavChange]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      setToastError(t('shell.logoutFailed'));
      setTimeout(() => setToastError(''), 5000);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Loading state
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="ds-fullscreen">
        <div className="ds-spinner"></div>
        <p className="ds-loading-text">{t('common.loading')}</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Access denied state
  // ═══════════════════════════════════════════════════════════════════════════
  if (accessDenied) {
    return (
      <div className="ds-fullscreen">
        <div className="ds-error-card">
          <h2 className="ds-error-title">{t('shell.noAccess')}</h2>
          <p className="ds-error-message">{t('shell.noAccessMsg')}</p>
          <button className="ds-btn-primary" onClick={handleLogout}>
            {t('common.signOut')}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Ops mode — backwards-compatible pass-through
  // Dashboards that use opsMode build their own layout inside the render prop.
  // ═══════════════════════════════════════════════════════════════════════════
  if (opsMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {toastError && <div className="ds-toast">{toastError}</div>}
        {typeof children === 'function'
          ? children({ handleLogout, toggleTheme, isDarkTheme })
          : children}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Full shell layout — sidebar + header + content
  // ═══════════════════════════════════════════════════════════════════════════
  const sidebarClasses = [
    'ds-sidebar',
    sidebarCollapsed ? 'ds-sidebar--collapsed' : '',
    mobileOpen ? 'ds-sidebar--mobile-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="ds-layout">
      {toastError && <div className="ds-toast">{toastError}</div>}

      {/* ── Mobile overlay ── */}
      <div
        className={`ds-overlay${mobileOpen ? ' ds-overlay--visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* ── Sidebar ── */}
      <aside className={sidebarClasses}>
        {/* Brand + toggle */}
        <div className="ds-sidebar__top">
          <div className="ds-sidebar__brand">
            <span className="ds-sidebar__brand-icon"><Bus size={22} strokeWidth={2} /></span>
            <span className="ds-sidebar__brand-text">SmartBus</span>
          </div>
          <button
            className="ds-sidebar__toggle"
            onClick={() => {
              setSidebarCollapsed((prev) => !prev);
              setMobileOpen(false);
            }}
            title={sidebarCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>

        {/* Nav items */}
        <nav className="ds-sidebar__nav">
          {navItems.map((item) => {
            const isActive = activeNavId === item.id;
            const badgeCount =
              alertBadge?.navId === item.id ? alertBadge.count : item.badge;

            return (
              <button
                key={item.id}
                className={`ds-sidebar__nav-item${isActive ? ' ds-sidebar__nav-item--active' : ''}`}
                onClick={() => handleNavClick(item.id)}
                title={item.label}
              >
                <span className="ds-sidebar__nav-icon">{item.icon}</span>
                <span className="ds-sidebar__nav-label">{item.label}</span>
                {badgeCount > 0 && (
                  <span className="ds-sidebar__badge">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer — Log Out only. (The non-functional "Support" button was
            removed; re-add it here once a support destination exists.) */}
        <div className="ds-sidebar__footer">
          <button
            className="ds-sidebar__footer-btn ds-sidebar__footer-btn--danger"
            onClick={handleLogout}
            title={t('common.logOut')}
          >
            <span className="ds-sidebar__footer-btn-icon">🚪</span>
            <span className="ds-sidebar__footer-btn-label">{t('common.logOut')}</span>
          </button>
        </div>
      </aside>

      {/* ── Body (header + content) ── */}
      <div className="ds-body">
        {/* Top header */}
        <header className="ds-header">
          <div className="ds-header__left">
            <button
              className="ds-header__hamburger"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={t('shell.toggleMenu')}
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
            {roleLabel && <span className="ds-header__role">{roleLabel}</span>}
          </div>

          <div className="ds-header__center">
            {headerExtra || null}
          </div>

          <div className="ds-header__right">
            <span className="ds-header__clock">
              {currentTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <LanguageSwitcher />
            <button
              className="ds-header__theme-btn"
              onClick={toggleTheme}
              title={isDarkTheme ? t('shell.switchToLight') : t('shell.switchToDark')}
            >
              {isDarkTheme ? '☀️' : '🌙'}
            </button>
            <button className="ds-header__signout" onClick={handleLogout}>
              {t('common.signOut')}
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="ds-main">
          {typeof children === 'function'
            ? children({ handleLogout, toggleTheme, isDarkTheme })
            : children}
        </main>
      </div>
    </div>
  );
}
