import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { collection as fsCollection, onSnapshot as fsOnSnapshot, query as fsQuery, where as fsWhere } from 'firebase/firestore';
import {
  LayoutDashboard, 
  Users, 
  Bus, 
  AlertTriangle,
  Backpack,
  Timer, 
  Map, 
  User, 
  UserCheck, 
  Hourglass, 
  CheckCircle, 
  Home, 
  MapPin, 
  Wrench,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Navigation
} from 'lucide-react';
import LiveMap from '../components/LiveMap';
import StudentRoster from '../components/StudentRoster';
import DashboardShell from '../components/DashboardShell';
import DemoPanel from '../components/DemoPanel';
import { useTheme } from '../contexts/ThemeContext';
import useDemoMode from '../hooks/useDemoMode';
import useNotifications from '../hooks/useNotifications';
import NotificationBanner from '../components/NotificationBanner';
import {
  ATTENDANCE_ALERT_THRESHOLD,
  MORNING_DROPOFF_ALERT_THRESHOLD,
  AFTERNOON_DROPOFF_ALERT_THRESHOLD,
  getTodayDateString,
  isPastThreshold,
} from '../utils/schedule';
import { getDocName } from '../utils/normalizeAttendance';
import './SchoolAdminDashboard.css';

const NAV_ITEMS = [
  { id: 'dashboard', icon: <LayoutDashboard size={18} />, labelKey: 'nav.dashboard' },
  { id: 'students', icon: <Users size={18} />, labelKey: 'nav.students' },
  { id: 'fleet', icon: <Bus size={18} />, labelKey: 'nav.fleet' },
  { id: 'alerts', icon: <AlertTriangle size={18} />, labelKey: 'nav.alerts' },
  // Settings is hidden until it's implemented (was a "coming soon" placeholder).
  // Re-add this entry once the Settings view does something:
  // { id: 'settings', icon: <Settings size={18} />, labelKey: 'nav.settings' },
];

// ─── Demo fleet ──────────────────────────────────────────────────────────────
// Shown only while Demo mode is ON, so the fleet view looks populated for
// presentations even before any real `buses` documents are seeded. Routes mirror
// the real stops in utils/busRoute.js (Ajman). Edit freely — it's showcase data.
const DEMO_FLEET = [
  { id: 'BUS_01', route: 'City Centre Route',  driver: 'Ahmad Khalil',  supervisor: 'Sara Abdullah', students: 22, capacity: 30, status: 'ON ROUTE', color: '#F59E0B' },
  { id: 'BUS_02', route: 'Al Mowaihat Route',  driver: 'Sami Rashid',   supervisor: 'Khaled Bilal',  students: 18, capacity: 30, status: 'ON ROUTE', color: '#3b82f6' },
  { id: 'BUS_03', route: 'Sheikh Zayed Mosque', driver: 'Nour Hassan',  supervisor: 'Mona Saleh',    students: 12, capacity: 20, status: 'DELAYED',  color: '#22c55e' },
  { id: 'BUS_04', route: 'Al Jurf Express',    driver: 'Layla Mansour', supervisor: 'Fadi Rami',     students: 5,  capacity: 16, status: 'IDLE',     color: '#a855f7' },
  { id: 'BUS_05', route: 'Kindergarten West',  driver: 'Omar Tariq',    supervisor: 'Huda Karim',    students: 0,  capacity: 20, status: 'OFFLINE',  color: '#f97316' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getStatusClass(status) {
  switch (status) {
    case 'ON ROUTE': return 'sa-bus-status--on-route';
    case 'DELAYED': return 'sa-bus-status--delayed';
    case 'IDLE': return 'sa-bus-status--idle';
    case 'OFFLINE': return 'sa-bus-status--offline';
    default: return 'sa-bus-status--idle';
  }
}

export default function SchoolAdminDashboard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const demo = useDemoMode();
  const { demoBuses, demoScenario, demoMissingStudents, demoNotDroppedOff: demoOnBus } = demo;

  const navItems = NAV_ITEMS.map((item) => ({ ...item, label: t(item.labelKey) }));

  const statusLabel = (status) => {
    const map = {
      'ON ROUTE': t('schoolAdmin.status.onRoute'),
      'DELAYED': t('schoolAdmin.status.delayed'),
      'IDLE': t('schoolAdmin.status.idle'),
      'OFFLINE': t('schoolAdmin.status.offline'),
    };
    return map[status] || status;
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [statsCollapsed, setStatsCollapsed] = useState(false);

  // ── Live Firestore data ────────────────────────────────────────────────────
  const [liveBuses, setLiveBuses] = useState([]);         // live GPS pings (bus_location)
  const [fleetConfig, setFleetConfig] = useState([]);     // school-managed metadata (buses)
  const [activeStudentsCount, setActiveStudentsCount] = useState(0);
  const [studentsByBus, setStudentsByBus] = useState({}); // active boarded count per bus_id

  // ── Alert detail state ────────────────────────────────────────────────────
  const [allStudentNames, setAllStudentNames] = useState([]);
  const [todayScannedNames, setTodayScannedNames] = useState(new Set());
  const [todayAttendanceFull, setTodayAttendanceFull] = useState([]);
  const [missingStudents, setMissingStudents] = useState([]);
  const [notDroppedOff, setNotDroppedOff] = useState([]);

  // Clock — re-evaluates alert thresholds periodically
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // ── Live buses (GPS pings from the Pi) ──────────────────────────────────
  useEffect(() => {
    return fsOnSnapshot(fsCollection(db, 'bus_location'), (snapshot) => {
      setLiveBuses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // ── Fleet config (school-managed bus metadata) ──────────────────────────
  useEffect(() => {
    return fsOnSnapshot(fsCollection(db, 'buses'), (snapshot) => {
      setFleetConfig(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // ── Students on board (total + per-bus counts) ──────────────────────────
  useEffect(() => {
    const q = fsQuery(fsCollection(db, 'attendance'), fsWhere('active', '==', true));
    return fsOnSnapshot(q, (snapshot) => {
      const names = new Set();
      const byBus = {};
      snapshot.docs.forEach((doc) => {
        const d = doc.data();
        const name = d.name || d.Name;
        if (name) names.add(name);
        const bus = d.bus_id || d.busId;
        if (bus) byBus[bus] = (byBus[bus] || 0) + 1;
      });
      setActiveStudentsCount(names.size);
      setStudentsByBus(byBus);
    });
  }, []);

  // ── All student names ───────────────────────────────────────────────────
  useEffect(() => {
    return fsOnSnapshot(fsCollection(db, 'users'), (snapshot) => {
      setAllStudentNames(
        snapshot.docs.map((doc) => getDocName(doc)).filter(Boolean)
      );
    });
  }, []);

  // ── Today's scanned names + full records ────────────────────────────────
  useEffect(() => {
    const today = getTodayDateString();
    const q = fsQuery(fsCollection(db, 'attendance'), fsWhere('date', '==', today));
    return fsOnSnapshot(q, (snapshot) => {
      const docs = snapshot.docs;
      setTodayScannedNames(
        new Set(docs.map((doc) => getDocName(doc)).filter(Boolean))
      );
      setTodayAttendanceFull(
        docs.map(doc => {
          const d = doc.data();
          return {
            name: d.Name || d.name || null,
            time: d.time || null,
            active: d.active !== false,
          };
        }).filter(r => r.name && r.time)
      );
    });
  }, []);

  // ── Derive missing students ─────────────────────────────────────────────
  useEffect(() => {
    if (!isPastThreshold(ATTENDANCE_ALERT_THRESHOLD)) {
      setMissingStudents([]);
      return;
    }
    const missing = allStudentNames.filter(
      (name) => !todayScannedNames.has(name)
    );
    setMissingStudents(missing);
  }, [allStudentNames, todayScannedNames, currentTime]);

  // ── Derive students who boarded but were never dropped off ──────────────
  useEffect(() => {
    const result = [];

    if (isPastThreshold(MORNING_DROPOFF_ALERT_THRESHOLD)) {
      const morningBoarders = new Set(
        todayAttendanceFull
          .filter(r => r.time >= '06:00:00' && r.time < '07:30:00' && r.active)
          .map(r => r.name)
      );
      const morningDropoffs = new Set(
        todayAttendanceFull
          .filter(r => r.time >= '07:30:00' && r.time < '08:30:00' && r.active)
          .map(r => r.name)
      );
      morningBoarders.forEach(name => {
        if (!morningDropoffs.has(name))
          result.push({ name, phase: 'morning' });
      });
    }

    if (isPastThreshold(AFTERNOON_DROPOFF_ALERT_THRESHOLD)) {
      const afternoonBoarders = new Set(
        todayAttendanceFull
          .filter(r => r.time >= '14:00:00' && r.time < '14:10:00' && r.active)
          .map(r => r.name)
      );
      const afternoonDropoffs = new Set(
        todayAttendanceFull
          .filter(r => r.time >= '14:10:00' && r.active)
          .map(r => r.name)
      );
      afternoonBoarders.forEach(name => {
        if (!afternoonDropoffs.has(name))
          result.push({ name, phase: 'afternoon' });
      });
    }

    setNotDroppedOff(result);
  }, [todayAttendanceFull, currentTime]);

  // Demo scenario overrides — each scenario zeroes out the other alert type
  // so real Firebase data doesn't bleed through during a demo.
  const effectiveMissingStudents = demoScenario === 'missing' ? demoMissingStudents
                                 : (demoScenario === 'on-bus' || demoScenario === 'all-clear') ? []
                                 : missingStudents;
  const effectiveNotDroppedOff   = demoScenario === 'on-bus'  ? demoOnBus
                                 : (demoScenario === 'missing' || demoScenario === 'all-clear') ? []
                                 : notDroppedOff;
  const isDemoScenarioActive = demoScenario !== null;

  // Computed from both alert types so stats + badge stay in sync
  const activeAlertsCount = effectiveMissingStudents.length + effectiveNotDroppedOff.length;

  // ── Notifications ──────────────────────────────────────────────────────────
  const { unreadNotifications, sendNotification, dismissNotification } = useNotifications('school_admin');

  useEffect(() => {
    const shouldNotify = effectiveNotDroppedOff.length > 0 &&
      (isDemoScenarioActive || isPastThreshold(AFTERNOON_DROPOFF_ALERT_THRESHOLD));
    if (!shouldNotify) return;

    const busId = isDemoScenarioActive ? 'BUS_01' : 'FLEET';
    sendNotification({
      type: 'students_on_bus',
      message: `${effectiveNotDroppedOff.length} student${effectiveNotDroppedOff.length > 1 ? 's' : ''} still on ${busId} — not scanned off after route`,
      studentNames: effectiveNotDroppedOff.map(s => s.name),
      busId,
    });
  }, [effectiveNotDroppedOff.length, isDemoScenarioActive]);

  // ── Fleet: real data from Firestore, or the demo fleet for showcase ───────
  // Real fleet = the `buses` config collection, enriched with live GPS presence
  // and per-bus boarded counts. With Demo mode ON we swap in DEMO_FLEET so the
  // dashboard looks populated for presentations even before `buses` is seeded.
  const realFleet = useMemo(() => fleetConfig.map((cfg) => {
    const live = liveBuses.find((b) => b.id === cfg.id);
    return {
      id: cfg.id,
      route: cfg.route || '—',
      driver: cfg.driver || '—',
      supervisor: cfg.supervisor || '—',
      capacity: cfg.capacity ?? 0,
      students: studentsByBus[cfg.id] || 0,
      status: live ? 'ON ROUTE' : 'OFFLINE',
      color: cfg.color || colors.primary,
    };
  }), [fleetConfig, liveBuses, studentsByBus, colors.primary]);

  const fleetData = demo.demoEnabled ? DEMO_FLEET : realFleet;

  // ── Fleet-derived metrics (replace the previously hardcoded values) ───────
  const fleetActive = fleetData.filter((b) => b.status === 'ON ROUTE' || b.status === 'DELAYED');
  const onRouteCount = fleetData.filter((b) => b.status === 'ON ROUTE').length;
  const delaysCount = fleetData.filter((b) => b.status === 'DELAYED').length;
  const coveragePct = fleetData.length ? Math.round((fleetActive.length / fleetData.length) * 100) : 0;
  const onTimeRate = fleetActive.length ? `${Math.round((onRouteCount / fleetActive.length) * 100)}%` : '—';
  const activeBusesCount = fleetActive.length;
  const activeRoutesCount = new Set(fleetActive.map((b) => b.route)).size;

  // ── Header extra: demo & test-scenario panel ──────────────────────────
  const demoToggle = <DemoPanel demo={demo} />;

  // ── Stats data ─────────────────────────────────────────────────────────
  const statsData = [
    { title: t('schoolAdmin.activeBuses'), value: activeBusesCount, total: fleetData.length, icon: <Bus size={20} />, trend: t('schoolAdmin.livePings'), color: colors.primary, live: true },
    { title: t('schoolAdmin.studentsOnBoard'), value: activeStudentsCount, total: null, icon: <Backpack size={20} />, trend: t('schoolAdmin.liveTracking'), color: colors.success, live: true },
    { title: t('schoolAdmin.onTimeRate'), value: onTimeRate, total: null, icon: <Timer size={20} />, trend: onTimeRate === '—' ? t('schoolAdmin.pendingData') : t('schoolAdmin.liveTracking'), color: '#FFCC00', live: onTimeRate !== '—' },
    { title: t('schoolAdmin.activeAlerts'), value: activeAlertsCount, total: null, icon: <AlertTriangle size={20} />, trend: isPastThreshold(ATTENDANCE_ALERT_THRESHOLD) ? t('schoolAdmin.afterThreshold', { time: ATTENDANCE_ALERT_THRESHOLD }) : t('schoolAdmin.activatesAt', { time: ATTENDANCE_ALERT_THRESHOLD }), color: colors.danger, live: true, clickable: true, isAlerts: true },
    { title: t('schoolAdmin.activeRoutes'), value: activeRoutesCount, total: null, icon: <Map size={20} />, trend: t('schoolAdmin.liveRoutes'), color: '#a855f7', live: true },
  ];

  // ── Render helpers ─────────────────────────────────────────────────────
  const renderStatsRow = () => (
    <div className="sa-stats-row">
      {statsData.map((stat, idx) => (
        <div
          key={idx}
          className={`sa-stat-card${stat.clickable ? ' sa-stat-card--clickable' : ''}${stat.isAlerts && activeAlertsCount > 0 ? ' sa-stat-card--alert' : ''}`}
          onClick={stat.clickable ? () => setActiveTab('alerts') : undefined}
        >
          <div className="sa-stat-header">
            <div className="sa-stat-label-group">
              <span className="sa-stat-label">{stat.title}</span>
              {stat.live && <div className="sa-live-dot" />}
            </div>
            <div className="sa-stat-icon" style={{ background: `${stat.color}20`, color: stat.color }}>
              {stat.icon}
            </div>
          </div>
          <div className="sa-stat-value-row">
            <span className={`sa-stat-value${stat.isAlerts && activeAlertsCount > 0 ? ' sa-stat-value--danger' : ''}`}>
              {stat.value}
            </span>
            {stat.total != null && <span className="sa-stat-total">/ {stat.total}</span>}
          </div>
          <span className="sa-stat-trend">{stat.trend}</span>
        </div>
      ))}
    </div>
  );

  const renderBusList = () => {
    const activeBuses = fleetData.filter(b => b.status === 'ON ROUTE' || b.status === 'DELAYED');
    const visibleBuses = activeBuses.slice(0, 3);
    return (
      <div className="sa-card">
        <div className="sa-card__header">
          <h3>{t('schoolAdmin.activeFleet')}</h3>
          <span className="sa-card__header-badge" style={{ background: `${colors.primary}15`, color: colors.primary }}>
            {t('schoolAdmin.nActive', { count: activeBuses.length })}
          </span>
        </div>
        <div className="sa-card__body">
          {visibleBuses.length === 0 ? (
            <div className="sa-alerts-empty" style={{ border: 'none', padding: '20px 0' }}>
              <div className="sa-alerts-empty__icon"><Bus size={48} /></div>
              <p>{t('schoolAdmin.noActiveBuses')}</p>
            </div>
          ) : (
            <>
              {visibleBuses.map((bus) => (
                <div key={bus.id} className="sa-bus-row">
                  <div className="sa-bus-dot" style={{ background: bus.color }} />
                  <div className="sa-bus-info">
                    <div className="sa-bus-id">{bus.id}</div>
                    <div className="sa-bus-route">{bus.route}</div>
                    <div className="sa-bus-driver"><User size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {bus.driver}</div>
                    <div className="sa-bus-supervisor"><UserCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {bus.supervisor}</div>
                  </div>
                  <span className="sa-bus-capacity">{bus.students}/{bus.capacity}</span>
                  <span className={`sa-bus-status ${getStatusClass(bus.status)}`}>
                    {statusLabel(bus.status)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
        {activeBuses.length > 0 && (
          <div className="sa-card__footer">
            <button className="sa-show-all-link" onClick={() => setActiveTab('fleet')}>
              {t('schoolAdmin.showAllBuses', { count: fleetData.length })}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderAlertPreview = () => {
    const alertItems = [];

    // Not dropped off alerts (shown first — higher urgency)
    effectiveNotDroppedOff.slice(0, 2).forEach(({ name, phase }) => {
      alertItems.push({
        type: 'not-dropped-off',
        name,
        desc: t(phase === 'morning' ? 'busAdmin.descMorning' : 'busAdmin.descAfternoon'),
        severity: 'warning',
        initial: name[0]?.toUpperCase(),
        style: { color: '#ea580c', bg: '#fff7ed' },
        badge: t('schoolAdmin.onBus'),
      });
    });

    // Missing student alerts
    effectiveMissingStudents.slice(0, Math.max(1, 3 - effectiveNotDroppedOff.length)).forEach((name) => {
      alertItems.push({
        type: 'absent',
        name,
        desc: t('schoolAdmin.notScannedBy', { time: ATTENDANCE_ALERT_THRESHOLD }),
        severity: 'critical',
        initial: name[0]?.toUpperCase(),
      });
    });

    // Placeholder future alert types
    alertItems.push({
      type: 'placeholder',
      name: t('schoolAdmin.busDelayAlert'),
      desc: t('schoolAdmin.boardingDelay'),
      severity: 'warning',
      initial: <Timer size={16} />,
      isPlaceholder: true,
    });

    return (
      <div className="sa-card">
        <div className="sa-card__header">
          <h3>{t('schoolAdmin.liveAlerts')}</h3>
          {activeAlertsCount > 0 && (
            <span className="sa-card__header-badge" style={{ background: `${colors.danger}15`, color: colors.danger }}>
              {t('schoolAdmin.nActive', { count: activeAlertsCount })}
            </span>
          )}
        </div>
        <div className="sa-card__body">
          {(!isDemoScenarioActive && !isPastThreshold(ATTENDANCE_ALERT_THRESHOLD)) ? (
            <div className="sa-alerts-empty" style={{ border: 'none', padding: '20px 0' }}>
              <div className="sa-alerts-empty__icon"><Hourglass size={48} /></div>
              <p>{t('schoolAdmin.alertsActivateAt', { time: ATTENDANCE_ALERT_THRESHOLD })}</p>
            </div>
          ) : effectiveMissingStudents.length === 0 && effectiveNotDroppedOff.length === 0 ? (
            <div className="sa-alerts-empty" style={{ border: 'none', padding: '20px 0' }}>
              <div className="sa-alerts-empty__icon"><CheckCircle size={48} /></div>
              <p>{t('schoolAdmin.allClearNoAlerts')}</p>
            </div>
          ) : (
            <div className="sa-alerts-grid">
              {alertItems.map((alert, idx) => (
                <div
                  key={idx}
                  className={`sa-alert-card sa-alert-card--${alert.severity}${alert.isPlaceholder ? ' sa-alert-card--placeholder' : ''}`}
                  style={{ border: 'none', padding: '10px 0', boxShadow: 'none', borderBottom: `1px solid var(--borders)` }}
                >
                  <div
                    className={`sa-alert-avatar sa-alert-avatar--${alert.severity === 'critical' ? 'danger' : alert.severity}`}
                    style={alert.style ? { background: alert.style.bg, color: alert.style.color } : undefined}
                  >
                    {alert.initial}
                  </div>
                  <div className="sa-alert-body">
                    <div className="sa-alert-name">{alert.name}</div>
                    <div className="sa-alert-desc">{alert.desc}</div>
                  </div>
                  <span
                    className={`sa-alert-severity sa-alert-severity--${alert.severity}`}
                    style={alert.style ? { background: alert.style.bg, color: alert.style.color, border: `1px solid ${alert.style.color}40` } : undefined}
                  >
                    {alert.badge || (alert.severity === 'critical' ? t('schoolAdmin.absent') : t('schoolAdmin.pending'))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sa-card__footer">
          <button className="sa-show-all-link" onClick={() => setActiveTab('alerts')}>
            {t('schoolAdmin.showAllAlerts')}
          </button>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // TAB: Dashboard
  // ═════════════════════════════════════════════════════════════════════════
  const renderDashboard = () => (
    <div className="sa-tab-content" key="dashboard">
      <div 
        className="sa-stats-collapse-toggle" 
        onClick={() => setStatsCollapsed(!statsCollapsed)}
      >
        {statsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        <span>{t('schoolAdmin.overview')}</span>
      </div>
      <div className={`sa-stats-row-wrapper${statsCollapsed ? ' sa-stats-row-wrapper--collapsed' : ''}`}>
        {renderStatsRow()}
      </div>

      {/* Live Map */}
      <div className={`sa-map-section${mapExpanded ? ' sa-map-section--expanded' : ''}`}>
        <div className="sa-map-toolbar">
          <div className="sa-map-pill">
            <div className="sa-map-pill__stat">
              <span className="sa-map-pill__stat-label">{t('schoolAdmin.coverage')}</span>
              <span className="sa-map-pill__stat-value" style={{ color: colors.success }}>{coveragePct}%</span>
            </div>
            <div className="sa-map-pill__divider" />
            <div className="sa-map-pill__stat">
              <span className="sa-map-pill__stat-label">{t('schoolAdmin.delays')}</span>
              <span className="sa-map-pill__stat-value" style={{ color: colors.danger }}>{delaysCount}</span>
            </div>
            <div className="sa-map-pill__divider" />
            <button
              className="btn-sa-map"
              onClick={() => setMapExpanded(!mapExpanded)}
              title={mapExpanded ? t('schoolAdmin.collapseMap') : t('schoolAdmin.expandMap')}
            >
              {mapExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
        <div className="sa-map-body">
          <LiveMap masterView={true} demoBuses={demoBuses} />
        </div>
      </div>

      {/* Bottom grid: Buses + Alerts */}
      {!mapExpanded && (
        <div className="sa-dashboard-bottom">
          {renderBusList()}
          {renderAlertPreview()}
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // TAB: Students
  // ═════════════════════════════════════════════════════════════════════════
  const notBoardedCount = allStudentNames.length - activeStudentsCount;

  const renderStudents = () => (
    <div className="sa-tab-content" key="students">
      <div className="sa-student-counters">
        <div className="sa-counter-card">
          <div className="sa-counter-icon" style={{ background: `${colors.primary}15`, color: colors.primary }}>
            <Users size={24} />
          </div>
          <div className="sa-counter-info">
            <span className="sa-counter-value">{allStudentNames.length}</span>
            <span className="sa-counter-label">{t('schoolAdmin.totalStudents')}</span>
          </div>
        </div>
        <div className="sa-counter-card">
          <div className="sa-counter-icon" style={{ background: `${colors.success}15`, color: colors.success }}>
            <Bus size={24} />
          </div>
          <div className="sa-counter-info">
            <span className="sa-counter-value">{activeStudentsCount}</span>
            <span className="sa-counter-label">{t('schoolAdmin.onBusCount')}</span>
          </div>
        </div>
        <div className="sa-counter-card">
          <div className="sa-counter-icon" style={{ background: `${colors.danger}15`, color: colors.danger }}>
            <Home size={24} />
          </div>
          <div className="sa-counter-info">
            <span className="sa-counter-value">{notBoardedCount < 0 ? 0 : notBoardedCount}</span>
            <span className="sa-counter-label">{t('schoolAdmin.notBoarded')}</span>
          </div>
        </div>
      </div>

      <div className="sa-student-roster-wrapper">
        <StudentRoster masterView={true} busOptions={fleetData.map(b => b.id)} />
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // TAB: Fleet
  // ═════════════════════════════════════════════════════════════════════════
  const renderFleet = () => (
    <div className="sa-tab-content" key="fleet">
      {fleetData.length === 0 ? (
        <div className="sa-alerts-empty">
          <div className="sa-alerts-empty__icon"><Bus size={48} /></div>
          <p>{t('schoolAdmin.noFleetConfigured')}</p>
        </div>
      ) : (
      <div className="sa-fleet-grid">
        {fleetData.map((bus) => {
          const pct = bus.capacity > 0 ? (bus.students / bus.capacity) * 100 : 0;
          let barColor = colors.primary;
          if (pct > 85) barColor = colors.danger;
          else if (pct > 0) barColor = colors.success;

          return (
            <div key={bus.id} className="sa-fleet-card">
              <div className="sa-fleet-card__top">
                <div className="sa-fleet-card__id-group">
                  <div className="sa-fleet-card__color-dot" style={{ background: bus.color }} />
                  <span className="sa-fleet-card__id">{bus.id}</span>
                </div>
                <span className={`sa-bus-status ${getStatusClass(bus.status)}`}>
                  {statusLabel(bus.status)}
                </span>
              </div>

              <div className="sa-fleet-card__detail-row">
                <div className="sa-fleet-card__detail">
                  <span className="sa-fleet-card__detail-icon"><MapPin size={14} /></span>
                  <span className="sa-fleet-card__detail-label">{t('schoolAdmin.route')}:</span>
                  <span className="sa-fleet-card__detail-value">{bus.route}</span>
                </div>
                <div className="sa-fleet-card__detail">
                  <span className="sa-fleet-card__detail-icon"><User size={14} /></span>
                  <span className="sa-fleet-card__detail-label">{t('schoolAdmin.driver')}:</span>
                  <span className="sa-fleet-card__detail-value">{bus.driver}</span>
                </div>
                <div className="sa-fleet-card__detail">
                  <span className="sa-fleet-card__detail-icon"><UserCheck size={14} /></span>
                  <span className="sa-fleet-card__detail-label">{t('schoolAdmin.supervisor')}:</span>
                  <span className="sa-fleet-card__detail-value">{bus.supervisor}</span>
                </div>
              </div>

              <div className="sa-fleet-card__capacity">
                <div className="sa-fleet-card__capacity-header">
                  <span>{t('schoolAdmin.studentsBoarded')}</span>
                  <span>{bus.students} / {bus.capacity}</span>
                </div>
                <div className="sa-fleet-card__progress-track">
                  <div
                    className="sa-fleet-card__progress-fill"
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // TAB: Alerts
  // ═════════════════════════════════════════════════════════════════════════
  const renderAlerts = () => (
    <div className="sa-tab-content" key="alerts">
      <div className="sa-alerts-header">
        <h2>{t('schoolAdmin.liveAlerts')}</h2>
        {activeAlertsCount > 0 && (
          <div className="sa-alerts-count-badge">
            {t('schoolAdmin.nActive', { count: activeAlertsCount })}
          </div>
        )}
      </div>

      {/* ── Not dropped off section ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Bus size={18} style={{ color: '#ea580c' }} />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{t('schoolAdmin.notDroppedOff')}</h3>
          {effectiveNotDroppedOff.length > 0 && (
            <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
              {effectiveNotDroppedOff.length}
            </span>
          )}
        </div>

        {effectiveNotDroppedOff.length === 0 ? (
          <div className="sa-alerts-empty" style={{ padding: '20px 0' }}>
            <div className="sa-alerts-empty__icon"><CheckCircle size={36} /></div>
            <p style={{ fontSize: '13px' }}>
              {(!isDemoScenarioActive && !isPastThreshold(MORNING_DROPOFF_ALERT_THRESHOLD))
                ? t('schoolAdmin.dropoffActivateAfter', { time: MORNING_DROPOFF_ALERT_THRESHOLD })
                : t('schoolAdmin.allDroppedOff')}
            </p>
          </div>
        ) : (
          <div className="sa-alerts-grid" style={{ maxWidth: '800px' }}>
            {effectiveNotDroppedOff.map(({ name, phase, desc }) => (
              <div key={`${name}-${phase}`} className="sa-alert-card" style={{ borderLeft: '3px solid #ea580c' }}>
                <div className="sa-alert-avatar" style={{ background: '#fff7ed', color: '#ea580c' }}>
                  {name[0]?.toUpperCase()}
                </div>
                <div className="sa-alert-body">
                  <div className="sa-alert-name">{name}</div>
                  <div className="sa-alert-desc">{t(phase === 'morning' ? 'busAdmin.descMorning' : 'busAdmin.descAfternoon')}</div>
                </div>
                <span className="sa-alert-severity" style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa' }}>
                  {t('schoolAdmin.onBus')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Absent / missing scan section ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <Navigation size={18} style={{ color: 'var(--danger)' }} />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{t('schoolAdmin.absentToday')}</h3>
      </div>

      {(!isDemoScenarioActive && !isPastThreshold(ATTENDANCE_ALERT_THRESHOLD)) ? (
        <div className="sa-alerts-empty">
          <div className="sa-alerts-empty__icon"><Hourglass size={48} /></div>
          <p>{t('schoolAdmin.absenceActivateAfter', { time: ATTENDANCE_ALERT_THRESHOLD })}</p>
        </div>
      ) : effectiveMissingStudents.length === 0 ? (
        <div className="sa-alerts-empty">
          <div className="sa-alerts-empty__icon"><CheckCircle size={48} /></div>
          <p>{t('schoolAdmin.allScanned')}</p>
        </div>
      ) : (
        <div className="sa-alerts-grid" style={{ maxWidth: '800px' }}>
          {effectiveMissingStudents.map((name) => (
            <div key={name} className="sa-alert-card sa-alert-card--critical">
              <div className="sa-alert-avatar sa-alert-avatar--danger">
                {name[0]?.toUpperCase()}
              </div>
              <div className="sa-alert-body">
                <div className="sa-alert-name">{name}</div>
                <div className="sa-alert-desc">{t('schoolAdmin.notScannedBy', { time: ATTENDANCE_ALERT_THRESHOLD })}</div>
              </div>
              <span className="sa-alert-severity sa-alert-severity--critical">
                {t('schoolAdmin.absent')}
              </span>
            </div>
          ))}

          {/* Future alert placeholders */}
          <div className="sa-alert-card sa-alert-card--warning sa-alert-card--placeholder">
            <div className="sa-alert-avatar sa-alert-avatar--warning"><Bus size={20} /></div>
            <div className="sa-alert-body">
              <div className="sa-alert-name">{t('schoolAdmin.busCrashDetection')}</div>
              <div className="sa-alert-desc">{t('schoolAdmin.busCrashDesc')}</div>
            </div>
            <span className="sa-alert-severity sa-alert-severity--warning">{t('common.future')}</span>
          </div>
          <div className="sa-alert-card sa-alert-card--info sa-alert-card--placeholder">
            <div className="sa-alert-avatar sa-alert-avatar--info"><Timer size={20} /></div>
            <div className="sa-alert-body">
              <div className="sa-alert-name">{t('schoolAdmin.boardingDelayAlert')}</div>
              <div className="sa-alert-desc">{t('schoolAdmin.boardingDelayDesc')}</div>
            </div>
            <span className="sa-alert-severity sa-alert-severity--warning">{t('common.future')}</span>
          </div>
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // TAB: Settings
  // ═════════════════════════════════════════════════════════════════════════
  const renderSettings = () => (
    <div className="sa-tab-content sa-under-construction" key="settings">
      <div className="sa-under-construction__inner">
        <div className="sa-under-construction__icon"><Wrench size={48} /></div>
        <h3 className="sa-under-construction__title">{t('schoolAdmin.underConstruction')}</h3>
        <p className="sa-under-construction__text">{t('schoolAdmin.settingsSoon')}</p>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <DashboardShell
      roleLabel={t('roles.school_admin')}
      navItems={navItems}
      activeNavId={activeTab}
      onNavChange={setActiveTab}
      alertBadge={{ navId: 'alerts', count: activeAlertsCount }}
      headerExtra={demoToggle}
    >
      <NotificationBanner notifications={unreadNotifications} onDismiss={dismissNotification} />
      <div className="sa-root">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'students' && renderStudents()}
        {activeTab === 'fleet' && renderFleet()}
        {activeTab === 'alerts' && renderAlerts()}
        {activeTab === 'settings' && renderSettings()}
      </div>
    </DashboardShell>
  );
}
