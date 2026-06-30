import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from 'firebase/firestore';
import LiveMap from '../components/LiveMap';
import DashboardShell from '../components/DashboardShell';
import BusStatus from '../components/BusStatus';
import DemoPanel from '../components/DemoPanel';
import { useTheme } from '../contexts/ThemeContext';
import useDemoMode from '../hooks/useDemoMode';
import { LayoutDashboard, History, Clock, Calendar, User, ChevronRight } from 'lucide-react';
import { getTodayDateString, formatTime12h } from '../utils/schedule';
import './ParentDashboard.css';

// ── History Tab Component ───────────────────────────────────────────────────
function HistoryTab({ childNames, colors, radii }) {
  const { t } = useTranslation();
  const today = getTodayDateString();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    if (!childNames.length) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, 'attendance'),
        where('name', 'in', childNames),
        where('date', '>=', fromDate),
        where('date', '<=', toDate),
        orderBy('date', 'desc'),
        orderBy('time', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(data);
    } catch (err) {
      console.error('Error fetching history:', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [childNames, fromDate, toDate]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const getInitialColor = (name) => {
    const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  };

  return (
    <div className="history-tab">
      <div className="parent-card history-card">
        <div className="parent-card-header" style={{ borderBottomColor: colors.borders }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={18} /> {t('parent.attendanceHistory')}
          </h3>
        </div>

        {/* Date Filters */}
        <div className="history-filters">
          <div className="filter-group">
            <label className="filter-label">
              <Calendar size={14} />
              {t('parent.from')}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="filter-date-input"
              style={{
                background: colors.skeleton,
                borderColor: colors.borders,
                color: colors.text,
              }}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">
              <Calendar size={14} />
              {t('parent.to')}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="filter-date-input"
              style={{
                background: colors.skeleton,
                borderColor: colors.borders,
                color: colors.text,
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="history-content">
          {loading ? (
            <div className="history-loading">
              <div className="history-spinner"></div>
              <span>{t('parent.loadingRecords')}</span>
            </div>
          ) : records.length === 0 ? (
            <div className="history-empty">
              <Clock size={40} strokeWidth={1.2} />
              <span className="history-empty-title">{t('parent.noRecordsFound')}</span>
              <span className="history-empty-sub">
                {t('parent.noRecordsSub')}
              </span>
            </div>
          ) : (
            <div className="history-list">
              {records.map((rec) => {
                const isBoarded = rec.active === true;
                const avatarColor = getInitialColor(rec.name);
                return (
                  <div key={rec.id} className="history-row" style={{ borderColor: colors.borders }}>
                    <div className="history-row-left">
                      <div
                        className="history-avatar"
                        style={{ background: avatarColor }}
                      >
                        {(rec.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="history-row-info">
                        <span className="history-name">{rec.name}</span>
                        <span className="history-datetime" style={{ color: colors.textSecondary }}>
                          <Calendar size={12} /> {rec.date}
                          <span className="history-time-sep">•</span>
                          <Clock size={12} /> {formatTime12h(rec.time)}
                        </span>
                      </div>
                    </div>
                    <div className="history-row-right">
                      <span className={`history-badge ${isBoarded ? 'boarded' : 'not-boarded'}`}>
                        <span className="history-badge-dot"></span>
                        {isBoarded ? t('parent.boarded') : t('parent.notBoarded')}
                      </span>
                      {rec.permission && (
                        <span className="history-permission" style={{ color: colors.textMuted }}>
                          {rec.permission}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Parent Dashboard ───────────────────────────────────────────────────
export default function ParentDashboard({ userRole }) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  const demo = useDemoMode();
  const { demoBuses } = demo;

  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: t('nav.dashboard') },
    { id: 'history', icon: <History size={18} />, label: t('nav.history') },
  ];

  const [activeTab, setActiveTab] = useState('dashboard');

  // Support both new array schema and old string schema seamlessly
  const childNames = userRole.childNames || (userRole.childName ? [userRole.childName] : []);
  const busIds = userRole.busIds ?? (userRole.busId ? [userRole.busId] : []);
  const uniqueBusIds = Array.from(new Set(busIds));

  // Map toggle state
  const [mapMode, setMapMode] = useState('combined');
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Real-time status for children
  const [childStatuses, setChildStatuses] = useState({});

  useEffect(() => {
    const today = getTodayDateString();
    
    // Track all children assigned to this parent
    const unsubscribes = childNames.map(name => {
      const q = query(
        collection(db, 'attendance'),
        where('name', '==', name),
        where('date', '==', today),
        orderBy('time', 'desc'),
        limit(1)
      );

      return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setChildStatuses(prev => ({ ...prev, [name]: snapshot.docs[0].data() }));
        } else {
          setChildStatuses(prev => ({ ...prev, [name]: null }));
        }
      }, (err) => {
        console.error(`Error tracking status for ${name}:`, err);
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [childNames.join(',')]); // Depend on child names to re-subscribe if they change

  const isMultipleChildren = childNames.length > 1;
  const headerNameText = isMultipleChildren
    ? childNames.join(' & ')
    : (childNames[0] || t('parent.yourChild'));

  // Determine which children to show in status cards
  const displayedChildren = isMultipleChildren && mapMode === 'separate'
    ? [childNames[selectedChildIndex]]
    : childNames;

  // ── Header extra: child badge + bus status + demo toggle ──────────────────
  const headerExtra = (
    <div className="parent-header-extra">
      <div className="child-badge" style={{ color: colors.success }}>
        {headerNameText}
      </div>
      {uniqueBusIds.map(busId => (
        <BusStatus key={busId} busId={busId} />
      ))}
      <DemoPanel demo={demo} />
    </div>
  );

  return (
    <DashboardShell
      roleLabel={t('roles.parent')}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={setActiveTab}
      headerExtra={headerExtra}
    >
      {/* ── Dashboard Tab ── */}
      {activeTab === 'dashboard' && (
        <div className="parent-dashboard-content">
          {/* ── Map Card ── */}
          <div className={`parent-card map-card ${isMapExpanded ? 'expanded' : ''}`}>
            <div className="parent-card-header" style={{ borderBottomColor: colors.borders }}>
              <h3>{t('parent.liveBusMap')}</h3>
              <div className="header-actions">
                {isMultipleChildren && (
                  <div className="mode-toggle" style={{ background: colors.skeleton }}>
                    <button
                      onClick={() => setMapMode('combined')}
                      className={mapMode === 'combined' ? 'active' : ''}
                    >{t('parent.combined')}</button>
                    <button
                      onClick={() => setMapMode('separate')}
                      className={mapMode === 'separate' ? 'active' : ''}
                    >{t('parent.separate')}</button>
                  </div>
                )}
                <span className="bus-badge">
                  {busIds.length > 1 ? t('parent.buses') : t('parent.bus')}: {busIds.join(', ')}
                </span>
                <button
                  onClick={() => setIsMapExpanded(!isMapExpanded)}
                  title={isMapExpanded ? t('parent.restoreSplit') : t('parent.expandMap')}
                  className="expand-btn"
                  style={{ borderColor: colors.borders, color: colors.textMuted }}
                >
                  {isMapExpanded ? '◨' : '🗖'}
                </button>
              </div>
            </div>

            {/* Map Rendering */}
            <div className="map-container">
              {isMultipleChildren && mapMode === 'separate' ? (
                <div className="separate-map-view">
                  <div className="child-tabs">
                    {childNames.map((child, index) => (
                      <button
                        key={child}
                        onClick={() => setSelectedChildIndex(index)}
                        className={`child-tab ${selectedChildIndex === index ? 'active' : ''}`}
                        style={{
                          borderColor: selectedChildIndex === index ? 'var(--primary-color)' : colors.borders,
                        }}
                      >{child}</button>
                    ))}
                  </div>
                  <div className="child-map-wrapper" style={{ borderColor: colors.borders }}>
                    <div className="child-map-header" style={{ background: colors.skeleton, borderBottomColor: colors.borders }}>
                      <span>{t('parent.childBus', { name: childNames[selectedChildIndex] })}</span>
                      <span className="bus-id-text">{t('parent.bus')}: {busIds[selectedChildIndex] || busIds[0]}</span>
                    </div>
                    <LiveMap busId={busIds[selectedChildIndex] || busIds[0]} demoBuses={demoBuses} />
                  </div>
                </div>
              ) : (
                <LiveMap busId={busIds} demoBuses={demoBuses} />
              )}
            </div>
          </div>

          {/* ── Real-time Status Tracker ── */}
          {!isMapExpanded && (
            <div className="parent-card scans-card">
              <div className="parent-card-header" style={{ borderBottomColor: colors.borders }}>
                <h3>{t('parent.childAttendanceStatus')}</h3>
                <span className="child-badge-small">{t('common.today')}</span>
              </div>
              <div className="status-tracker-container" style={{ padding: '1.25rem' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: displayedChildren.length > 1 ? '1fr 1fr' : '1fr', 
                  gap: '1rem' 
                }}>
                  {displayedChildren.map(name => {
                    const latestScan = childStatuses[name];
                    const isOnBus = latestScan && latestScan.active === true;

                    return (
                      <div
                        key={name}
                        className="child-status-card"
                        onClick={() => setActiveTab('history')}
                        style={{
                          padding: '1.5rem',
                          borderRadius: radii.lg,
                          background: colors.skeleton,
                          border: `1px solid ${colors.borders}`,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.75rem',
                          cursor: 'pointer',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                          position: 'relative',
                        }}
                      >
                        <div style={{ fontSize: '1.1rem', fontWeight: '700', color: colors.text }}>
                          {name}
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          background: isOnBus ? '#dcfce7' : '#fee2e2',
                          color: isOnBus ? '#166534' : '#991b1b',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          border: `1px solid ${isOnBus ? '#bbf7d0' : '#fecaca'}`
                        }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isOnBus ? '#22c55e' : '#ef4444',
                            boxShadow: `0 0 8px ${isOnBus ? '#22c55e88' : '#ef444488'}`
                          }}></span>
                          {isOnBus ? t('parent.onTheBus') : t('parent.notOnTheBus')}
                        </div>

                        {latestScan ? (
                          <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>
                            {t('parent.lastScan')} <span style={{ fontWeight: '500' }}>{latestScan.time}</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: colors.textMuted, fontStyle: 'italic' }}>
                            {t('parent.noScansToday')}
                          </div>
                        )}

                        <div className="view-history-link">
                          {t('parent.viewHistory')} <ChevronRight size={14} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === 'history' && (
        <HistoryTab childNames={childNames} colors={colors} radii={radii} />
      )}
    </DashboardShell>
  );
}
