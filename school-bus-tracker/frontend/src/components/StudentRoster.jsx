import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = `
  .roster-root {
    font-family: 'Outfit', sans-serif;
    background: transparent;
    color: var(--text-main);
    min-height: 100%;
    padding: 0;
    box-sizing: border-box;
  }

  .roster-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .roster-title-block h2 {
    margin: 0 0 2px;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-main);
    letter-spacing: -0.3px;
  }

  .roster-title-block p {
    margin: 0;
    font-size: 11px;
    color: var(--text-muted);
  }

  .roster-stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .stat-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--bg-card);
    border: 1px solid var(--text-muted);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11px;
    color: var(--text-main);
    font-weight: 500;
  }

  .stat-chip .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .stat-chip .count {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 12px;
    color: var(--text-main);
  }

  .roster-controls {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .bus-select {
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--text-muted);
    background: var(--bg-card);
    font-family: 'Outfit', sans-serif;
    font-size: 11px;
    color: var(--text-main);
    cursor: pointer;
    font-weight: 500;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    min-width: 100px;
  }

  .bus-select:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(59,130,246,0.15);
  }

  .search-wrap {
    position: relative;
    flex: 1;
    min-width: 140px;
    max-width: 240px;
  }

  .search-wrap svg {
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 5px 8px 5px 28px;
    border: 1px solid var(--text-muted);
    border-radius: 6px;
    font-size: 11px;
    font-family: 'Outfit', sans-serif;
    background: var(--bg-dark);
    color: var(--text-main);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .search-input:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(59,130,246,0.15);
  }

  .filter-btn {
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid var(--text-muted);
    background: var(--bg-card);
    font-family: 'Outfit', sans-serif;
    font-size: 11px;
    color: var(--text-main);
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
  }

  .filter-btn.active {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
  }

  .filter-btn:hover:not(.active) {
    background: var(--bg-dark);
    border-color: var(--text-main);
  }

  .roster-table-wrap {
    background: var(--bg-card);
    border: 1px solid var(--text-muted);
    border-radius: 8px;
    overflow: hidden;
  }

  .roster-table {
    width: 100%;
    border-collapse: collapse;
  }

  .roster-table thead tr {
    background: var(--bg-dark);
    border-bottom: 1px solid var(--text-muted);
  }

  .roster-table th {
    padding: 6px 10px;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .roster-table td {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-main);
    border-bottom: 1px solid var(--text-muted);
    vertical-align: middle;
  }

  .roster-table tbody tr:last-child td {
    border-bottom: none;
  }

  .roster-table tbody tr {
    transition: background 0.1s;
  }

  .roster-table tbody tr:hover {
    background: var(--bg-dark);
  }

  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-color), #6366f1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
    font-family: 'Outfit', sans-serif;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name-text {
    font-weight: 600;
    color: var(--text-main);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 16px;
    font-size: 10px;
    font-weight: 500;
  }

  .badge.boarded {
    background: rgba(16, 185, 129, 0.2);
    color: var(--success-color);
  }

  .badge.not-boarded {
    background: rgba(100, 116, 139, 0.2);
    color: var(--text-muted);
  }

  .badge .badge-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .doc-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-dark);
    border: 1px solid var(--text-muted);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .empty-state {
    text-align: center;
    padding: 24px 12px;
    color: var(--text-muted);
  }

  .empty-state svg {
    margin-bottom: 8px;
    opacity: 0.4;
  }

  .empty-state p {
    margin: 0;
    font-size: 12px;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 12px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--text-muted);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: var(--danger-color);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 11px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .live-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--success-color);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success-color);
    animation: livepulse 1.8s ease-in-out infinite;
  }

  @keyframes livepulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  .row-fade-in {
    animation: fadeInRow 0.25s ease forwards;
  }

  @keyframes fadeInRow {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

// The users collection doc ID is the student name (e.g. "Ayham").
// There is no name field or studentId field — doc.id IS the name.
function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * StudentRoster
 *
 * Props:
 *  - masterView  {boolean}  school_admin sees all students
 *  - busOptions  {string[]} optional list of bus IDs for the bus filter dropdown
 *
 * NOTE: The users collection is written by Python hardware only.
 *       This component is READ-ONLY. Never write to users collection.
 *
 * Firestore: users/{studentName}  →  whatever fields the hardware stores
 *            doc.id               →  student name (e.g. "Ayham")
 *            bus field (if present) → used for bus filter
 */
export default function StudentRoster({ masterView = false, busOptions = [] }) {
  const { t } = useTranslation();
  const [students, setStudents]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState('all'); // 'all' | 'boarded' | 'not-boarded'
  const [busFilter, setBusFilter] = useState('all'); // 'all' | specific bus ID

  // ── Real-time listener on users collection ──────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const usersRef = collection(db, 'users');

    // NO where() filter — users collection has no busId field.
    // The doc ID is the student name. We fetch all and filter in-memory if needed.
    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const records = snapshot.docs.map(doc => ({
          id: doc.id,          // This IS the student name (e.g. "Ayham")
          ...doc.data(),       // Any extra fields the hardware stored
        }));
        setStudents(records);
        setLoading(false);
      },
      (err) => {
        console.error('StudentRoster: Firestore error:', err);
        setError(t('roster.loadError'));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []); // no deps — we always want all students

  // ── Derived / filtered list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = students;

    // Search by name (doc.id)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.id.toLowerCase().includes(q));
    }

    // Filter by boarded status — 'active' field may exist if hardware adds it
    if (filter === 'boarded') {
      list = list.filter(s => s.active === true);
    } else if (filter === 'not-boarded') {
      list = list.filter(s => s.active !== true);
    }

    // Filter by bus assignment
    if (busFilter !== 'all') {
      list = list.filter(s => s.bus === busFilter);
    }

    return list;
  }, [students, search, filter, busFilter]);

  const boardedCount    = students.filter(s => s.active === true).length;
  const notBoardedCount = students.length - boardedCount;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <style>{styles}</style>
      <div className="roster-root">

        {/* Header */}
        <div className="roster-header">
          <div className="roster-title-block">
            <h2>{t('roster.title')}</h2>
            <p>
              {t('roster.liveFrom')} <code>{t('roster.collection')}</code> · {t('roster.readOnly')} ·{' '}
              <span className="live-indicator">
                <span className="live-dot" />
                {t('roster.realTime')}
              </span>
            </p>
          </div>

          <div className="roster-stats">
            <div className="stat-chip">
              <span className="dot" style={{ background: '#3b82f6' }} />
              <span className="count">{students.length}</span>
              {t('roster.total')}
            </div>
            <div className="stat-chip">
              <span className="dot" style={{ background: '#22c55e' }} />
              <span className="count">{boardedCount}</span>
              {t('roster.onBus')}
            </div>
            <div className="stat-chip">
              <span className="dot" style={{ background: '#cbd5e1' }} />
              <span className="count">{notBoardedCount}</span>
              {t('roster.notBoarded')}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* Controls */}
        <div className="roster-controls">
          {/* Search */}
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="search-input"
              type="text"
              placeholder={t('roster.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Status filter */}
          {['all', 'boarded', 'not-boarded'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? t('roster.filterAll') : f === 'boarded' ? `🟢 ${t('roster.filterOnBus')}` : `⚪ ${t('roster.filterNotBoarded')}`}
            </button>
          ))}

          {/* Bus filter dropdown */}
          {busOptions.length > 0 && (
            <select
              className="bus-select"
              value={busFilter}
              onChange={e => setBusFilter(e.target.value)}
            >
              <option value="all">🚌 {t('roster.allBuses')}</option>
              {busOptions.map(busId => (
                <option key={busId} value={busId}>{busId}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="roster-table-wrap">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              {t('roster.loadingStudents')}
            </div>
          ) : (
            <table className="roster-table">
              <thead>
                <tr>
                  <th>{t('roster.student')}</th>
                  <th>{t('roster.docId')}</th>
                  <th>{t('roster.status')}</th>
                  {masterView && <th>{t('roster.permission')}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={masterView ? 4 : 3}>
                      <div className="empty-state">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <p>{search ? t('roster.noStudentsMatch', { query: search }) : t('roster.noStudentsFound')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((student, i) => (
                    <tr key={student.id} className="row-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                      {/* Name cell — doc.id IS the name */}
                      <td>
                        <div className="name-cell">
                          <div className="avatar">{getInitials(student.id)}</div>
                          <span className="name-text">{student.id}</span>
                        </div>
                      </td>

                      {/* Doc ID */}
                      <td>
                        <span className="doc-id">{student.id}</span>
                      </td>

                      {/* Boarded status — uses active field if hardware provides it */}
                      <td>
                        {student.active === true ? (
                          <span className="badge boarded">
                            <span className="badge-dot" /> {t('roster.onBus')}
                          </span>
                        ) : (
                          <span className="badge not-boarded">
                            <span className="badge-dot" /> {t('roster.notBoarded')}
                          </span>
                        )}
                      </td>

                      {/* Permission — only shown to school_admin (masterView) */}
                      {masterView && (
                        <td style={{ color: '#64748b', fontSize: 13 }}>
                          {student.permission || '—'}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, marginBottom: 0 }}>
          ⚠️ {t('roster.footerWarning')}
        </p>
      </div>
    </>
  );
}
