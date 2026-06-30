import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, addDoc, doc, deleteDoc } from 'firebase/firestore';
import {
  LayoutDashboard, 
  Users,
  Bell,
  Map,
  Maximize2, 
  Minimize2, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  BarChart3, 
  Bus, 
  AlertTriangle, 
  AlertCircle, 
  Radio, 
  X, 
  ClipboardList, 
  Check, 
  FileText,
  RotateCcw,
  ChevronDown
} from 'lucide-react';
import LiveMap from '../components/LiveMap';
import DashboardShell from '../components/DashboardShell';
import DemoPanel from '../components/DemoPanel';

import { useTheme } from '../contexts/ThemeContext';
import useDemoMode from '../hooks/useDemoMode';
import useNotifications from '../hooks/useNotifications';
import NotificationBanner from '../components/NotificationBanner';
import useBusMode, { BUS_MODES, BUS_MODE_LIST } from '../hooks/useBusMode';
import { BUS_STOPS } from '../utils/busRoute';
import normalizeAttendanceDoc, { getDocName } from '../utils/normalizeAttendance';
import {
  ATTENDANCE_ALERT_THRESHOLD,
  MORNING_DROPOFF_ALERT_THRESHOLD,
  AFTERNOON_DROPOFF_ALERT_THRESHOLD,
  getTodayDateString,
  getCurrentTimeString,
  getWeekDateStrings,
  isPastThreshold,
  formatTime12h,
} from '../utils/schedule';
import { haversineMeters } from '../utils/geo';
import 'leaflet/dist/leaflet.css';
import './BusAdminDashboard.css';

const NAV_ITEMS = [
  { id: 'dashboard', icon: <LayoutDashboard size={18} />, labelKey: 'nav.dashboard' },
  { id: 'students', icon: <Users size={18} />, labelKey: 'nav.students' },
  { id: 'alerts', icon: <Bell size={18} />, labelKey: 'nav.alerts' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitial(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

const STOP_VISITED_RADIUS = 100; // metres — same as BusRouteLayer

export default function BusAdminDashboard({ userRole }) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  const demo = useDemoMode();
  const { demoBuses, demoScenario, demoMissingStudents, demoNotDroppedOff: demoOnBus } = demo;
  const busMode = useBusMode();

  const navItems = NAV_ITEMS.map((item) => ({ ...item, label: t(item.labelKey) }));

  const [activeTab, setActiveTab] = useState('dashboard');

  // ── Alert state ───────────────────────────────────────────────────────────
  const [allStudentNames, setAllStudentNames] = useState([]);
  const [todayScannedNames, setTodayScannedNames] = useState(new Set());
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [missingStudents, setMissingStudents] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  // ── Map expand state ──────────────────────────────────────────────────────
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // ── Roster filter ─────────────────────────────────────────────────────────
  const [rosterFilter, setRosterFilter] = useState('all');

  // ── Manual attendance state ───────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState('');
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionStudent, setExceptionStudent] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  // ── Boarded students tracking ─────────────────────────────────────────────
  const [boardedStudents, setBoardedStudents] = useState([]);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [prevAttendanceIds, setPrevAttendanceIds] = useState(new Set());

  // ── Visited stops (scan-confirmed drop-offs) ──────────────────────────────
  const [visitedStopIds, setVisitedStopIds] = useState(new Set());
  const prevBoardedLengthRef = useRef(null);

  // ── Insights state ────────────────────────────────────────────────────────
  const [activeBusCount, setActiveBusCount] = useState(0);
  const [weekAttendance, setWeekAttendance] = useState([]);

  // Clock — re-evaluates alert thresholds periodically
  const [clock, setClock] = useState(new Date().toLocaleTimeString());
  useEffect(() => {
    const interval = setInterval(
      () => setClock(new Date().toLocaleTimeString()),
      30_000
    );
    return () => clearInterval(interval);
  }, []);

  // ── All students from users collection ───────────────────────────────────
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setAllStudentNames(
        snap.docs.map((doc) => getDocName(doc)).filter(Boolean)
      );
    });
  }, []);

  // ── Active buses from bus_location ────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(collection(db, 'bus_location'), (snap) => {
      setActiveBusCount(snap.docs.length);
    });
  }, []);

  // ── This week's attendance (for chronic absence calc) ─────────────────────
  useEffect(() => {
    const weekDates = getWeekDateStrings();
    if (weekDates.length === 0) return;
    const q = query(collection(db, 'attendance'), where('date', 'in', weekDates));
    return onSnapshot(q, (snap) => {
      setWeekAttendance(
        snap.docs.map((doc) => {
          const d = doc.data();
          return { name: (d.Name || d.name || '').toLowerCase(), date: d.date, active: d.active !== false };
        }).filter((r) => r.name)
      );
    });
  }, []);

  // ── Today's attendance records ─────────────────────────────────────────────
  useEffect(() => {
    const today = getTodayDateString();
    const q = query(collection(db, 'attendance'), where('date', '==', today));
    return onSnapshot(q, (snap) => {
      const records = snap.docs.map((doc) => {
        const norm = normalizeAttendanceDoc(doc.data());
        return {
          id: doc.id,
          name: norm.Name || norm.name || null,
          time: norm.time || null,
          date: norm.date || null,
          active: norm.active !== false,
          permission: norm.permission || 'scan',
        };
      }).filter((r) => r.name);

      // Sort by time descending
      records.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

      setTodayAttendance(records);
      setTodayScannedNames(new Set(records.map((r) => r.name)));
    });
  }, []);

  // ── Boarded students: process new scans based on current mode ─────────────
  useEffect(() => {
    if (todayAttendance.length === 0) return;

    const currentIds = new Set(todayAttendance.map((r) => r.id));
    const newRecords = todayAttendance.filter((r) => !prevAttendanceIds.has(r.id));

    if (newRecords.length > 0) {
      const action = busMode.currentMode?.scanAction;
      setBoardedStudents((prev) => {
        let updated = [...prev];
        for (const record of newRecords) {
          const name = record.name;
          if (prevAttendanceIds.size === 0 || action === 'add') {
            if (!updated.includes(name)) updated.push(name);
          } else if (action === 'remove') {
            updated = updated.filter((n) => n !== name);
          }
        }
        return updated;
      });
    }

    setPrevAttendanceIds(currentIds);
  }, [todayAttendance, busMode.currentMode]);

  // ── Derive missing students ───────────────────────────────────────────────
  const [prevMissingKey, setPrevMissingKey] = useState('');

  useEffect(() => {
    if (!isPastThreshold(ATTENDANCE_ALERT_THRESHOLD)) {
      setMissingStudents([]);
      return;
    }
    const missing = allStudentNames.filter(
      (name) => !todayScannedNames.has(name)
    );
    setMissingStudents(missing);

    const key = missing.slice().sort().join(',');
    if (key !== prevMissingKey && missing.length > 0) {
      setDismissed(false);
      setPrevMissingKey(key);
    } else if (missing.length === 0) {
      setPrevMissingKey('');
    }
  }, [allStudentNames, todayScannedNames, clock]);

  // ── Students who boarded but were never dropped off ───────────────────────
  const notDroppedOff = useMemo(() => {
    const result = [];

    if (isPastThreshold(MORNING_DROPOFF_ALERT_THRESHOLD)) {
      const morningBoarders = new Set(
        todayAttendance
          .filter(r => r.time >= '06:00:00' && r.time < '07:30:00' && r.active !== false)
          .map(r => r.name)
      );
      const morningDropoffs = new Set(
        todayAttendance
          .filter(r => r.time >= '07:30:00' && r.time < '08:30:00' && r.active !== false)
          .map(r => r.name)
      );
      morningBoarders.forEach(name => {
        if (!morningDropoffs.has(name))
          result.push({ name, phase: 'morning' });
      });
    }

    if (isPastThreshold(AFTERNOON_DROPOFF_ALERT_THRESHOLD)) {
      const afternoonBoarders = new Set(
        todayAttendance
          .filter(r => r.time >= '14:00:00' && r.time < '14:10:00' && r.active !== false)
          .map(r => r.name)
      );
      const afternoonDropoffs = new Set(
        todayAttendance
          .filter(r => r.time >= '14:10:00' && r.active !== false)
          .map(r => r.name)
      );
      afternoonBoarders.forEach(name => {
        if (!afternoonDropoffs.has(name))
          result.push({ name, phase: 'afternoon' });
      });
    }

    return result;
  }, [todayAttendance, clock]);

  // ── Demo scenario overrides ────────────────────────────────────────────────
  // Each scenario shows only its own canned data; the other alert type is zeroed
  // out so real Firebase data doesn't bleed through during a demo.
  const effectiveMissingStudents = demoScenario === 'missing' ? demoMissingStudents
                                 : (demoScenario === 'on-bus' || demoScenario === 'all-clear') ? []
                                 : missingStudents;
  const effectiveNotDroppedOff   = demoScenario === 'on-bus'  ? demoOnBus
                                 : (demoScenario === 'missing' || demoScenario === 'all-clear') ? []
                                 : notDroppedOff;
  const isDemoScenarioActive = demoScenario !== null;

  // Names shown in the exception modal dropdown — use alert-derived demo names
  // when a scenario is active so the demo students appear as selectable options.
  const modalStudentNames = isDemoScenarioActive
    ? [...new Set([
        ...effectiveMissingStudents,
        ...effectiveNotDroppedOff.map((s) => s.name),
      ])]
    : allStudentNames;

  // ── Notifications ──────────────────────────────────────────────────────────
  const { unreadNotifications, sendNotification, dismissNotification } = useNotifications('bus_admin');

  useEffect(() => {
    const shouldNotify = effectiveNotDroppedOff.length > 0 &&
      (isDemoScenarioActive || isPastThreshold(AFTERNOON_DROPOFF_ALERT_THRESHOLD));
    if (!shouldNotify) return;

    const busId = isDemoScenarioActive ? 'BUS_01' : (userRole?.busId || 'UNKNOWN');
    sendNotification({
      type: 'students_on_bus',
      message: `${effectiveNotDroppedOff.length} student${effectiveNotDroppedOff.length > 1 ? 's' : ''} still on ${busId} — not scanned off after route`,
      studentNames: effectiveNotDroppedOff.map(s => s.name),
      busId,
    });
  }, [effectiveNotDroppedOff.length, isDemoScenarioActive]);

  // ── Mark a stop as visited when students are scanned off nearby ───────────
  useEffect(() => {
    const busPos = busMode.busPosition;
    const currentLength = boardedStudents.length;
    const prevLength = prevBoardedLengthRef.current;

    if (
      busMode.currentModeKey === 'HOMEBOUND_DROPOFF' &&
      busPos &&
      prevLength !== null &&
      currentLength < prevLength
    ) {
      const stops = BUS_STOPS[userRole?.busId] || [];
      setVisitedStopIds(prev => {
        const next = new Set(prev);
        let changed = false;
        for (const stop of stops) {
          if (!prev.has(stop.id)) {
            const dist = haversineMeters(busPos.lat, busPos.lng, stop.lat, stop.lng);
            if (dist < STOP_VISITED_RADIUS) {
              next.add(stop.id);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }

    prevBoardedLengthRef.current = currentLength;
  }, [boardedStudents, busMode.busPosition, busMode.currentModeKey, userRole]);

  // Reset visited stops at the start of each morning run
  useEffect(() => {
    if (busMode.currentModeKey === 'MORNING_PICKUP') {
      setVisitedStopIds(new Set());
      prevBoardedLengthRef.current = null;
    }
  }, [busMode.currentModeKey]);

  // ── Demo buses filtered to this admin's assigned bus ──────────────────────
  const filteredDemoBuses = useMemo(
    () => demoBuses.filter(b => b.id === userRole?.busId),
    [demoBuses, userRole]
  );

  // ── Filtered roster ────────────────────────────────────────────────────────
  const filteredRoster = useMemo(() => {
    return allStudentNames.map((name) => ({
      name,
      boarded: todayScannedNames.has(name),
    })).filter((s) => {
      if (rosterFilter === 'boarded') return s.boarded;
      if (rosterFilter === 'notBoarded') return !s.boarded;
      return true;
    });
  }, [allStudentNames, todayScannedNames, rosterFilter]);

  // ── Insight computations ──────────────────────────────────────────────────
  const insights = useMemo(() => {
    const totalStudents = allStudentNames.length;
    const presentToday = todayScannedNames.size;
    const absentToday = totalStudents - presentToday;
    const attendanceRate = totalStudents > 0 ? Math.round((presentToday / totalStudents) * 100) : 0;
    const alertsToday = todayAttendance.filter((r) => r.permission === 'exception' || !r.active).length;

    // Chronic absence: students absent 3+ days this week
    const weekDates = getWeekDateStrings();
    const totalSchoolDays = weekDates.length;
    const attendedDaysByStudent = {};
    weekAttendance.forEach((r) => {
      if (r.active) {
        const key = r.name;
        if (!attendedDaysByStudent[key]) attendedDaysByStudent[key] = new Set();
        attendedDaysByStudent[key].add(r.date);
      }
    });
    let chronicAbsent = 0;
    allStudentNames.forEach((name) => {
      const attended = attendedDaysByStudent[name.toLowerCase()]?.size || 0;
      const missed = totalSchoolDays - attended;
      if (missed >= 3) chronicAbsent++;
    });

    return { totalStudents, presentToday, absentToday, attendanceRate, alertsToday, chronicAbsent };
  }, [allStudentNames, todayScannedNames, todayAttendance, weekAttendance]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  }

  // ── Mark Present handler ──────────────────────────────────────────────────
  async function handleMarkPresent(studentName) {
    try {
      setSubmitting(true);
      await addDoc(collection(db, 'attendance'), {
        name: studentName.toLowerCase(),
        active: true,
        date: getTodayDateString(),
        time: getCurrentTimeString(),
        permission: 'manual',
      });
      showToast(t('busAdmin.toastMarkedPresent', { name: studentName }));
    } catch (err) {
      console.error('Mark present failed:', err);
      showToast(t('busAdmin.toastMarkFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Add Exception handler ─────────────────────────────────────────────────
  async function handleAddException() {
    if (!exceptionStudent || !exceptionReason.trim()) return;
    try {
      setSubmitting(true);
      await addDoc(collection(db, 'attendance'), {
        name: exceptionStudent.toLowerCase(),
        active: false,
        date: getTodayDateString(),
        time: getCurrentTimeString(),
        permission: 'exception',
        reason: exceptionReason.trim(),
      });
      showToast(t('busAdmin.toastExceptionRecorded', { name: exceptionStudent }));
      setShowExceptionModal(false);
      setExceptionStudent('');
      setExceptionReason('');
    } catch (err) {
      console.error('Add exception failed:', err);
      showToast(t('busAdmin.toastExceptionFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Remove Attendance handler ─────────────────────────────────────────────
  async function handleRemoveAttendance(recordId, studentName) {
    try {
      setSubmitting(true);
      await deleteDoc(doc(db, 'attendance', recordId));
      showToast(t('busAdmin.toastRemoved', { name: studentName }));
      setConfirmRemoveId(null);
    } catch (err) {
      console.error('Remove failed:', err);
      showToast(t('busAdmin.toastRemoveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Scan status badge type ────────────────────────────────────────────────
  function getScanBadge(record) {
    if (!record.active) return { label: t('busAdmin.absent'), cls: 'badge--absent' };
    if (record.permission === 'exception') return { label: t('busAdmin.exceptionTitle'), cls: 'badge--late' };
    if (record.time && record.time > '08:00:00') return { label: t('schoolAdmin.status.delayed'), cls: 'badge--late' };
    return { label: t('parent.boarded'), cls: 'badge--boarded' };
  }

  // ── Last scanned student ──────────────────────────────────────────────────
  const lastScan = todayAttendance.length > 0 ? todayAttendance[0] : null;

  // ── Header extra: bus ID badge + bus status + mode indicator + demo toggle ──
  const headerExtra = (
    <div className="bus-header-extra">
      <div className="bus-id-badge">
        {userRole.busId}
      </div>

      {busMode.currentMode && (
        <div
          className="bus-mode-indicator"
          style={{
            background: busMode.currentMode.bgColor,
            borderColor: busMode.currentMode.borderColor,
            color: busMode.currentMode.color,
          }}
          title={busMode.isAutoDetected ? t('busAdmin.autoDetected') : t('busAdmin.manuallySet')}
        >
          <span>{busMode.currentMode.icon}</span>
          <span>{t(`busModes.${busMode.currentMode.id}.short`)}</span>
          {!busMode.isAutoDetected && <span className="bus-mode-indicator__manual">{t('busAdmin.manual')}</span>}
        </div>
      )}
      <DemoPanel demo={demo} busMode={busMode} />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      roleLabel={t('roles.bus_admin')}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={setActiveTab}
      alertBadge={effectiveMissingStudents.length + effectiveNotDroppedOff.length > 0 ? { navId: 'alerts', count: effectiveMissingStudents.length + effectiveNotDroppedOff.length } : undefined}
      headerExtra={headerExtra}
    >
      <NotificationBanner notifications={unreadNotifications} onDismiss={dismissNotification} />
      <div className="bus-dashboard-root">

        {/* ── Dashboard tab: bento grid ── */}
        {activeTab === 'dashboard' && (
          <>
          <div className={`bus-bento-grid${isMapExpanded ? ' bus-bento-grid--fullmap' : ''}`}>

            {/* ── Live Map ── */}
            <div className={`bento-card bento-card--map${isMapExpanded ? ' bento-card--map-expanded' : ''}`}>
              <div className="bento-card__header">
                <div className="bento-card__title-group">
                  <span className="bento-card__icon"><Map size={20} /></span>
                  <h3>{t('busAdmin.liveRouteView')}</h3>
                </div>
                <button
                  className="btn-expand"
                  onClick={() => setIsMapExpanded(!isMapExpanded)}
                  title={isMapExpanded ? t('busAdmin.closeFullscreen') : t('busAdmin.expandMap')}
                >
                  {isMapExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
              </div>
              
              <div className="bento-card__body bento-card__body--map">
                <LiveMap busId={userRole.busId} demoBuses={filteredDemoBuses} visitedStopIds={visitedStopIds} />
              </div>
            </div>

            {/* ── Insights Panel ── */}
            {!isMapExpanded && (
              <div className="bento-card bento-card--insights">
                <div className="bento-card__header">
                  <div className="bento-card__title-group">
                    <span className="bento-card__icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><TrendingUp size={20} /></span>
                    <h3>{t('busAdmin.todaysOverview')}</h3>
                  </div>
                  <span className="scan-count">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="bento-card__body">
                  <div className="bus-insights-grid">
                    <div className="dash-stat dash-stat--primary">
                      <span className="dash-stat__icon"><Users size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{insights.totalStudents}</span>
                        <span className="dash-stat__label">{t('busAdmin.totalStudents')}</span>
                      </div>
                    </div>
                    <div className="dash-stat dash-stat--success">
                      <span className="dash-stat__icon"><CheckCircle size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{insights.presentToday}</span>
                        <span className="dash-stat__label">{t('busAdmin.present')}</span>
                      </div>
                    </div>
                    <div className="dash-stat dash-stat--danger">
                      <span className="dash-stat__icon"><XCircle size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{insights.absentToday}</span>
                        <span className="dash-stat__label">{t('busAdmin.absent')}</span>
                      </div>
                    </div>
                    <div className="dash-stat dash-stat--accent">
                      <span className="dash-stat__icon"><BarChart3 size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{insights.attendanceRate}%</span>
                        <span className="dash-stat__label">{t('busAdmin.attendanceRate')}</span>
                      </div>
                      <div className="dash-stat__bar">
                        <div className="dash-stat__bar-fill" style={{ width: `${insights.attendanceRate}%` }} />
                      </div>
                    </div>
                    <div className="dash-stat dash-stat--info">
                      <span className="dash-stat__icon"><Bus size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{activeBusCount}</span>
                        <span className="dash-stat__label">{t('busAdmin.activeBuses')}</span>
                      </div>
                    </div>
                    <div className="dash-stat dash-stat--warning">
                      <span className="dash-stat__icon"><AlertTriangle size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{insights.alertsToday}</span>
                        <span className="dash-stat__label">{t('busAdmin.activeAlerts')}</span>
                      </div>
                    </div>
                    <div className="dash-stat dash-stat--critical">
                      <span className="dash-stat__icon"><AlertCircle size={20} /></span>
                      <div className="dash-stat__content">
                        <span className="dash-stat__value">{insights.chronicAbsent}</span>
                        <span className="dash-stat__label">{t('busAdmin.absent3Days')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Operations Mode + Boarded Students (below bento grid) ── */}
          {!isMapExpanded && (
            <div className="bus-ops-row">
              {/* Mode Selector */}
              <div className="bento-card bento-card--mode">
                <div className="bento-card__header">
                  <div className="bento-card__title-group">
                    <span className="bento-card__icon" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                      <Radio size={20} />
                    </span>
                    <h3>{t('busAdmin.operationsMode')}</h3>
                  </div>
                  {!busMode.isAutoDetected && (
                    <button className="btn-reset-auto" onClick={busMode.resetToAuto} title={t('busAdmin.resetToAuto')}>
                      <RotateCcw size={14} /> {t('busAdmin.auto')}
                    </button>
                  )}
                  {busMode.isAutoDetected && (
                    <span className="scan-count" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', borderColor: 'rgba(16,185,129,0.25)' }}>
                      {t('busAdmin.auto')}
                    </span>
                  )}
                </div>
                <div className="bento-card__body">
                  {/* Current mode display */}
                  <div className="bus-mode-current" style={{ background: busMode.currentMode?.bgColor, borderColor: busMode.currentMode?.borderColor }}>
                    <span className="bus-mode-current__icon">{busMode.currentMode?.icon}</span>
                    <div className="bus-mode-current__info">
                      <span className="bus-mode-current__label" style={{ color: busMode.currentMode?.color }}>{busMode.currentMode && t(`busModes.${busMode.currentMode.id}.label`)}</span>
                      <span className="bus-mode-current__desc">{busMode.currentMode && t(`busModes.${busMode.currentMode.id}.description`)}</span>
                    </div>
                    <span className="bus-mode-current__action" style={{ color: busMode.currentMode?.color }}>
                      {busMode.currentMode?.scanAction === 'add' ? `▲ ${t('busAdmin.board')}` : `▼ ${t('busAdmin.deboard')}`}
                    </span>
                  </div>

                  {/* Mode selector pills */}
                  <div className="bus-mode-pills">
                    {BUS_MODE_LIST.map((mode) => {
                      const isActive = busMode.currentMode?.id === mode.id;
                      return (
                        <button
                          key={mode.id}
                          className={`bus-mode-pill${isActive ? ' bus-mode-pill--active' : ''}`}
                          style={isActive ? { background: mode.color, borderColor: mode.color, color: '#fff' } : { borderColor: mode.borderColor, color: mode.color }}
                          onClick={() => {
                            const modeKey = Object.keys(BUS_MODES).find(k => BUS_MODES[k].id === mode.id);
                            if (modeKey) busMode.setManualMode(modeKey);
                          }}
                          title={t(`busModes.${mode.id}.description`)}
                        >
                          <span>{mode.icon}</span>
                          <span>{t(`busModes.${mode.id}.short`)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* GPS status */}
                  {busMode.geoError && (
                    <div className="bus-mode-geo-warn">
                      <AlertTriangle size={14} /> {t('busAdmin.gpsUnavailable')}
                    </div>
                  )}
                </div>
              </div>

              {/* Boarded Students Panel */}
              <div className="bento-card bento-card--boarded">
                <div className="bento-card__header">
                  <div className="bento-card__title-group">
                    <span className="bento-card__icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                      <Users size={20} />
                    </span>
                    <h3>{t('busAdmin.boardedStudents')}</h3>
                  </div>
                  <span className="boarded-count" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                    {boardedStudents.length}
                  </span>
                </div>
                <div className="bento-card__body boarded-panel__body">
                  {boardedStudents.length === 0 ? (
                    <div className="boarded-empty">
                      <Bus size={32} />
                      <p>No students currently on board</p>
                      <span>Students will appear here as they are scanned</span>
                    </div>
                  ) : (
                    <div className="boarded-list">
                      {boardedStudents.slice(-3).reverse().map((name, i) => (
                        <div key={name} className="boarded-item" style={{ animationDelay: `${i * 50}ms` }}>
                          <div className="boarded-item__avatar" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                            {getInitial(name)}
                          </div>
                          <span className="boarded-item__name">{name}</span>
                          <span className="boarded-item__badge" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                            {t('busAdmin.onBoard')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {boardedStudents.length > 0 && (
                  <div className="bento-card__footer">
                    <button className="view-all-link" onClick={() => setActiveTab('students')}>
                      {boardedStudents.length > 3 ? t('busAdmin.viewAllStudents', { count: boardedStudents.length }) : `${t('common.viewAll')} →`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          </>
        )}

        {/* ── Students tab — attendance + roster ── */}
        {activeTab === 'students' && (
          <div className="students-tab">
            {/* Boarded Students */}
            <div className="bento-card">
              <div className="bento-card__header">
                <div className="bento-card__title-group">
                  <span className="bento-card__icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                    <Users size={20} />
                  </span>
                  <h3>{t('busAdmin.boardedStudents')}</h3>
                </div>
                <span className="boarded-count" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                  {boardedStudents.length}
                </span>
              </div>
              <div className="bento-card__body" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {boardedStudents.length === 0 ? (
                  <div className="boarded-empty">
                    <Bus size={32} />
                    <p>{t('busAdmin.noStudentsOnBoard')}</p>
                    <span>{t('busAdmin.willAppearScanned')}</span>
                  </div>
                ) : (
                  <div className="boarded-list">
                    {boardedStudents.map((name, i) => (
                      <div key={name} className="boarded-item" style={{ animationDelay: `${i * 50}ms` }}>
                        <div className="boarded-item__avatar" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                          {getInitial(name)}
                        </div>
                        <span className="boarded-item__name">{name}</span>
                        <span className="boarded-item__badge" style={{ background: busMode.currentMode?.bgColor, color: busMode.currentMode?.color }}>
                          On Board
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Student Roster */}
            <div className="bento-card">
              <div className="bento-card__header">
                <div className="bento-card__title-group">
                  <span className="bento-card__icon"><ClipboardList size={20} /></span>
                  <h3>{t('busAdmin.studentRoster')}</h3>
                </div>
              </div>
              <div className="roster-filters">
                {[
                  { key: 'all', label: t('common.all') },
                  { key: 'boarded', label: t('busAdmin.filterBoarded') },
                  { key: 'notBoarded', label: t('busAdmin.filterNotBoarded') },
                ].map((f) => (
                  <button
                    key={f.key}
                    className={`filter-pill${rosterFilter === f.key ? ' active' : ''}`}
                    onClick={() => setRosterFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="roster-list roster-list--full">
                {filteredRoster.length === 0 && (
                  <p className="empty-msg">{t('busAdmin.noStudentsMatch')}</p>
                )}
                {filteredRoster.map((student) => (
                  <div
                    key={student.name}
                    className={`roster-row${student.boarded ? ' roster-row--boarded' : ''}`}
                    onClick={() => !student.boarded && handleMarkPresent(student.name)}
                    title={student.boarded ? t('busAdmin.alreadyBoarded') : t('busAdmin.markPresentHint', { name: student.name })}
                  >
                    <div className="roster-row__check">
                      <div className={`checkbox${student.boarded ? ' checked' : ''}`}>
                        {student.boarded && <Check size={14} />}
                      </div>
                    </div>
                    <div className="roster-row__avatar">
                      {getInitial(student.name)}
                    </div>
                    <span className="roster-row__name">
                      {student.name}
                    </span>
                    <span
                      className="scan-badge"
                      style={student.boarded
                        ? { background: 'rgba(52, 211, 153, 0.15)', color: 'var(--success-color)' }
                        : { background: 'var(--bg-dark)', color: 'var(--text-muted)' }}
                    >
                      {student.boarded ? t('busAdmin.filterBoarded') : t('busAdmin.filterNotBoarded')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="roster-footer">
                <button
                  className="btn-exception"
                  style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px' }}
                  onClick={() => setShowExceptionModal(true)}
                >
                  <AlertCircle size={16} /> {t('busAdmin.addException')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Alerts tab ── */}
        {activeTab === 'alerts' && (
          <div className="alerts-tab">

            {/* ── Not dropped off alert ── */}
            <div className="bento-card">
              <div className="bento-card__header">
                <div className="bento-card__title-group">
                  <span className="bento-card__icon" style={{ color: '#ea580c' }}><Bus size={20} /></span>
                  <h3>{t('busAdmin.notDroppedOff')}</h3>
                </div>
                <span className="scan-count" style={{ color: '#ea580c', background: 'rgba(234, 88, 12, 0.12)' }}>
                  {t('busAdmin.alertCount', { count: effectiveNotDroppedOff.length })}
                </span>
              </div>
              <div className="bento-card__body">
                {effectiveNotDroppedOff.length === 0 ? (
                  <div className="alerts-empty">
                    <span className="alerts-empty__icon" style={{ color: 'var(--success-color)' }}><CheckCircle size={40} /></span>
                    <p className="alerts-empty__title">{t('busAdmin.allDroppedOff')}</p>
                    <p className="alerts-empty__sub">
                      {(!isDemoScenarioActive && !isPastThreshold(MORNING_DROPOFF_ALERT_THRESHOLD))
                        ? t('busAdmin.willActivateMorning', { time: MORNING_DROPOFF_ALERT_THRESHOLD })
                        : t('busAdmin.noStudentsRemaining')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="alerts-summary">
                      <span className="alerts-summary__icon"><AlertTriangle size={20} /></span>
                      <span>{t('busAdmin.studentsBoardedNotOff', { count: effectiveNotDroppedOff.length })}</span>
                    </div>
                    <div className="alerts-list">
                      {effectiveNotDroppedOff.map(({ name, phase }) => (
                        <div key={`${name}-${phase}`} className="alert-row">
                          <div className="alert-row__avatar" style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)' }}>
                            {getInitial(name)}
                          </div>
                          <div className="alert-row__info">
                            <span className="alert-row__name">{name}</span>
                            <span className="alert-row__detail" style={{ color: '#ea580c' }}>{t(phase === 'morning' ? 'busAdmin.descMorning' : 'busAdmin.descAfternoon')}</span>
                          </div>
                          <div className="alert-row__actions">
                            <button
                              className="alert-row__btn"
                              style={{ background: 'rgba(234, 88, 12, 0.12)', color: '#ea580c' }}
                              onClick={() => { setExceptionStudent(name); setShowExceptionModal(true); }}
                              title={t('busAdmin.addExceptionFor', { name })}
                            >
                              <FileText size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Absent / missing scan alert ── */}
            <div className="bento-card">
              <div className="bento-card__header">
                <div className="bento-card__title-group">
                  <span className="bento-card__icon" style={{ color: 'var(--primary-color)' }}><Bell size={20} /></span>
                  <h3>{t('busAdmin.attendanceAlerts')}</h3>
                </div>
                <span className="scan-count">
                  {t('busAdmin.alertCount', { count: effectiveMissingStudents.length })}
                </span>
              </div>
              <div className="bento-card__body">
                {effectiveMissingStudents.length === 0 ? (
                  <div className="alerts-empty">
                    <span className="alerts-empty__icon" style={{ color: 'var(--success-color)' }}><CheckCircle size={48} /></span>
                    <p className="alerts-empty__title">{t('busAdmin.allClear')}</p>
                    <p className="alerts-empty__sub">
                      {(isDemoScenarioActive || isPastThreshold(ATTENDANCE_ALERT_THRESHOLD))
                        ? t('busAdmin.allClearSub')
                        : t('busAdmin.willAppearAfter', { time: ATTENDANCE_ALERT_THRESHOLD })}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="alerts-summary">
                      <span className="alerts-summary__icon"><AlertTriangle size={20} /></span>
                      <span>
                        {t('busAdmin.studentsNotScanned', { count: effectiveMissingStudents.length })}
                        <span className="alerts-summary__sub">{t('busAdmin.pastThreshold', { time: ATTENDANCE_ALERT_THRESHOLD })}</span>
                      </span>
                    </div>
                    <div className="alerts-list">
                      {effectiveMissingStudents.map((name) => (
                        <div key={name} className="alert-row">
                          <div className="alert-row__avatar">
                            {getInitial(name)}
                          </div>
                          <div className="alert-row__info">
                            <span className="alert-row__name">{name}</span>
                            <span className="alert-row__detail">{t('busAdmin.pendingScan')}</span>
                          </div>
                          <div className="alert-row__actions">
                            <button
                              className="alert-row__btn alert-row__btn--present"
                              onClick={() => handleMarkPresent(name)}
                              disabled={submitting}
                              title={t('busAdmin.markPresentTitle', { name })}
                            >
                              <Check size={18} />
                            </button>
                            <button
                              className="alert-row__btn"
                              style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}
                              onClick={() => {
                                setExceptionStudent(name);
                                setShowExceptionModal(true);
                              }}
                              title={t('busAdmin.addExceptionFor', { name })}
                            >
                              <FileText size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Exception modal ── */}
        {showExceptionModal && (
          <div className="exception-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExceptionModal(false); }}>
            <div className="exception-modal">
              <h4>{t('busAdmin.exceptionTitle')}</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-0.5rem 0 1rem' }}>
                {t('busAdmin.exceptionSubtitle')}
              </p>

              <label htmlFor="exception-student">{t('busAdmin.student')}</label>
              <select
                id="exception-student"
                value={exceptionStudent}
                onChange={(e) => setExceptionStudent(e.target.value)}
              >
                <option value="">{t('busAdmin.selectStudent')}</option>
                {modalStudentNames.map((name) => (<option key={name} value={name}>{name}</option>))}
              </select>

              <label htmlFor="exception-reason">{t('busAdmin.reason')}</label>
              <textarea
                id="exception-reason"
                rows={4}
                placeholder={t('busAdmin.reasonPlaceholder')}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
              />

              <div className="exception-modal-actions">
                <button
                  className="btn-exception-cancel"
                  onClick={() => { setShowExceptionModal(false); setExceptionStudent(''); setExceptionReason(''); }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-exception-submit"
                  disabled={!exceptionStudent || !exceptionReason.trim() || submitting}
                  onClick={handleAddException}
                >
                  {submitting ? t('busAdmin.saving') : t('busAdmin.submitException')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {toastMessage && <div className="toast-success">{toastMessage}</div>}

      </div>
    </DashboardShell>
  );
}
