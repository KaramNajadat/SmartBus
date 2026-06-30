/**
 * schedule.js — shared daily-schedule helpers and alert thresholds.
 *
 * These were previously copy-pasted into BusAdminDashboard, SchoolAdminDashboard,
 * ParentDashboard and useNotifications (with a "Must match the value in
 * SchoolAdminDashboard.jsx" comment begging for this). Centralising them here
 * keeps every dashboard in sync and removes the drift risk.
 */

// ── Alert thresholds (24h "HH:MM") ───────────────────────────────────────────
// After these times the dashboards start surfacing the matching alerts.
export const ATTENDANCE_ALERT_THRESHOLD = '14:45';        // missing-scan alerts
export const MORNING_DROPOFF_ALERT_THRESHOLD = '08:30';   // not-dropped-off (morning)
export const AFTERNOON_DROPOFF_ALERT_THRESHOLD = '15:30'; // not-dropped-off (afternoon)

// ── Date / time formatting ───────────────────────────────────────────────────

/** Today as "YYYY-MM-DD" (local time) — matches the attendance `date` field. */
export function getTodayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Current time as "HH:MM:SS" (local time) — matches the attendance `time` field. */
export function getCurrentTimeString() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** This week's dates (Mon → today) as "YYYY-MM-DD" — used for chronic-absence stats. */
export function getWeekDateStrings() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    if (d.toDateString() === now.toDateString()) break;
  }
  return dates;
}

/** Format "HH:MM:SS" → "h:MM AM/PM". */
export function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

/** True once the current local time is at or past the given "HH:MM" threshold. */
export function isPastThreshold(threshold) {
  const [thHour, thMin] = threshold.split(':').map(Number);
  const now = new Date();
  return (
    now.getHours() > thHour ||
    (now.getHours() === thHour && now.getMinutes() >= thMin)
  );
}
