/**
 * normalizeAttendanceDoc(data)
 *
 * Accepts a raw Firestore attendance document's data object and returns a
 * normalized copy where:
 *   - date  → always YYYY-MM-DD
 *   - time  → always HH:MM:SS
 *
 * Handles two production schemas:
 *   1. Correct:  { date: "2026-04-17", time: "14:32:00", ... }
 *   2. Broken:   combined datetime in `timestamp`, `date`, or `time` field
 *                e.g. "2026-04-17T14:32:00" or "2026-04-17 14:32:00"
 */

// Matches "YYYY-MM-DD" optionally followed by "T" or " " and "HH:MM:SS"
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY_RE = /^\d{2}:\d{2}:\d{2}$/;

export function getDocName(doc) {
    const d = doc.data();
    return d.Name || d.name || null;
}

export default function normalizeAttendanceDoc(data) {
    if (!data || typeof data !== 'object') return data;

    const out = { ...data };

    // ── Already correct schema ──────────────────────────────────────────────
    if (DATE_ONLY_RE.test(out.date) && TIME_ONLY_RE.test(out.time)) {
        return out;
    }

    // ── Try to extract from a combined datetime string ──────────────────────
    // Check `timestamp` field first, then `date`, then `time` as fallbacks
    const candidates = [out.timestamp, out.date, out.time].filter(
        (v) => typeof v === 'string'
    );

    for (const candidate of candidates) {
        const match = candidate.match(DATETIME_RE);
        if (match) {
            out.date = match[1];
            out.time = match[2];
            return out;
        }
    }

    // ── Could not normalize: return data unchanged to avoid crashes ─────────
    return out;
}
