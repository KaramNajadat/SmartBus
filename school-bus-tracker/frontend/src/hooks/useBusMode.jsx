/**
 * useBusMode.jsx
 * ==============
 * React hook that auto-detects the current bus operations mode based on
 * the current time and GPS location relative to the school geofence.
 *
 * GPS coordinates come from the Raspberry Pi via the Firestore
 * `bus_location` collection — NOT from the browser's Geolocation API.
 *
 * Modes:
 *   1. MORNING_PICKUP    — 06:00–07:30, outside school
 *   2. SCHOOL_ARRIVAL    — 07:30–08:30, inside school
 *   3. AFTERNOON_BOARDING — 14:00–14:10, inside school
 *   4. HOMEBOUND_DROPOFF — after 14:10, outside school
 *
 * Exports the mode constants, the hook, and the SCHOOL_LOCATION config.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Home, School, Hourglass, Bus } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { GPS_OFFLINE_KEY, GPS_OFFLINE_EVENT } from './useDemoMode';
import { haversineMeters } from '../utils/geo';

// ── School geofence center: Ajman University, Al Jurf, Ajman, UAE ────────────
// Coords are the verified campus location (25°24'41.3"N 55°30'27.4"E).
export const SCHOOL_LOCATION = {
  lat: 25.411472,
  lng: 55.507611,
  radiusMeters: 500,
  name: 'Ajman University',
};

// ── The bus ID whose GPS we listen to ────────────────────────────────────────
const BUS_ID = 'BUS_01';

// ── Mode constants ───────────────────────────────────────────────────────────
export const BUS_MODES = {
  MORNING_PICKUP: {
    id: 'morning_pickup',
    label: 'Morning Pickup',
    shortLabel: 'Pickup',
    icon: <Home size={16} />,
    color: '#3b82f6',       // blue
    bgColor: 'rgba(59, 130, 246, 0.10)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    scanAction: 'add',      // scan → add to boarded list
    description: 'Picking up students from their homes',
  },
  SCHOOL_ARRIVAL: {
    id: 'school_arrival',
    label: 'School Arrival',
    shortLabel: 'Arrival',
    icon: <School size={16} />,
    color: '#10b981',       // green
    bgColor: 'rgba(16, 185, 129, 0.10)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    scanAction: 'remove',   // scan → remove from boarded list
    description: 'Dropping students off at school',
  },
  AFTERNOON_BOARDING: {
    id: 'afternoon_boarding',
    label: 'Afternoon Boarding',
    shortLabel: 'Boarding',
    icon: <Hourglass size={16} />,
    color: '#f59e0b',       // amber
    bgColor: 'rgba(245, 158, 11, 0.10)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    scanAction: 'add',      // scan → add to boarded list
    description: 'Waiting for students to board after school',
  },
  HOMEBOUND_DROPOFF: {
    id: 'homebound_dropoff',
    label: 'Homebound Drop-off',
    shortLabel: 'Drop-off',
    icon: <Bus size={16} />,
    color: '#8b5cf6',       // purple
    bgColor: 'rgba(139, 92, 246, 0.10)',
    borderColor: 'rgba(139, 92, 246, 0.25)',
    scanAction: 'remove',   // scan → remove from boarded list
    description: 'Dropping students off at their homes',
  },
};

// Ordered list for UI rendering
export const BUS_MODE_LIST = [
  BUS_MODES.MORNING_PICKUP,
  BUS_MODES.SCHOOL_ARRIVAL,
  BUS_MODES.AFTERNOON_BOARDING,
  BUS_MODES.HOMEBOUND_DROPOFF,
];

// ── Time-based mode detection ────────────────────────────────────────────────
function detectModeByTime(now) {
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMinutes = h * 60 + m;

  // 06:00 – 07:29  → Morning Pickup
  if (totalMinutes >= 360 && totalMinutes < 450) return 'MORNING_PICKUP';
  // 07:30 – 08:29  → School Arrival
  if (totalMinutes >= 450 && totalMinutes < 510) return 'SCHOOL_ARRIVAL';
  // 14:00 – 14:09  → Afternoon Boarding
  if (totalMinutes >= 840 && totalMinutes < 850) return 'AFTERNOON_BOARDING';
  // 14:10+          → Homebound Drop-off
  if (totalMinutes >= 850) return 'HOMEBOUND_DROPOFF';

  // Outside any defined window → default to morning pickup (pre-6AM)
  // or afternoon boarding (between 08:30 and 14:00)
  if (totalMinutes < 360) return 'MORNING_PICKUP';
  return 'AFTERNOON_BOARDING';
}

// ── Location-based mode refinement ───────────────────────────────────────────
function refineWithLocation(timeMode, isInsideSchool) {
  if (isInsideSchool === null) return timeMode; // no GPS data, trust time

  switch (timeMode) {
    case 'MORNING_PICKUP':
      // If inside school during morning hours, we've arrived early → School Arrival
      return isInsideSchool ? 'SCHOOL_ARRIVAL' : 'MORNING_PICKUP';
    case 'SCHOOL_ARRIVAL':
      // If outside school during arrival window, still picking up
      return isInsideSchool ? 'SCHOOL_ARRIVAL' : 'MORNING_PICKUP';
    case 'AFTERNOON_BOARDING':
      // Should be inside school; if outside, assume already dropping off
      return isInsideSchool ? 'AFTERNOON_BOARDING' : 'HOMEBOUND_DROPOFF';
    case 'HOMEBOUND_DROPOFF':
      // If still inside school, still boarding
      return isInsideSchool ? 'AFTERNOON_BOARDING' : 'HOMEBOUND_DROPOFF';
    default:
      return timeMode;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Hook
// ═════════════════════════════════════════════════════════════════════════════
export default function useBusMode() {
  const [autoMode, setAutoMode] = useState(() =>
    detectModeByTime(new Date())
  );
  const [manualMode, setManualMode] = useState(null); // null = auto
  const [busPosition, setBusPosition] = useState(null); // { lat, lng }
  const [isInsideSchool, setIsInsideSchool] = useState(null); // null = unknown
  const [geoError, setGeoError] = useState(null);

  // ── Demo: simulated GPS-offline flag (set from the Demo panel) ────────────
  const [demoGpsOffline, setDemoGpsOffline] = useState(() => {
    try { return localStorage.getItem(GPS_OFFLINE_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const onEvent = (e) => setDemoGpsOffline(Boolean(e.detail));
    const onStorage = (e) => {
      if (e.key === GPS_OFFLINE_KEY) setDemoGpsOffline(e.newValue === 'true');
    };
    window.addEventListener(GPS_OFFLINE_EVENT, onEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(GPS_OFFLINE_EVENT, onEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // ── Firestore listener: read GPS from Raspberry Pi via bus_location ──────
  useEffect(() => {
    if (demoGpsOffline) return; // simulated offline — skip live listener
    const busDocRef = doc(db, 'bus_location', BUS_ID);

    const unsubscribe = onSnapshot(
      busDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const lat = data.lat;
          const lng = data.lng;

          if (lat != null && lng != null) {
            setBusPosition({ lat, lng });

            const distance = haversineMeters(
              lat, lng,
              SCHOOL_LOCATION.lat, SCHOOL_LOCATION.lng
            );
            setIsInsideSchool(distance <= SCHOOL_LOCATION.radiusMeters);
            setGeoError(null);
          } else {
            // Document exists but no valid coordinates yet
            setGeoError('Bus GPS coordinates not available');
            setIsInsideSchool(null);
          }
        } else {
          // bus_location document doesn't exist (Pi is offline)
          setGeoError('Bus GPS offline — Raspberry Pi not transmitting');
          setBusPosition(null);
          setIsInsideSchool(null);
        }
      },
      (error) => {
        console.warn('[useBusMode] Firestore bus_location error:', error.message);
        setGeoError(error.message);
        setIsInsideSchool(null);
      }
    );

    return () => unsubscribe();
  }, [demoGpsOffline]);

  // ── Demo offline: clear GPS-derived state and raise a synthetic error ─────
  useEffect(() => {
    if (demoGpsOffline) {
      setBusPosition(null);
      setIsInsideSchool(null);
      setGeoError('Bus GPS offline — Raspberry Pi not transmitting (demo)');
    } else {
      setGeoError(null);
    }
  }, [demoGpsOffline]);

  // ── Auto-detection timer (re-evaluate every 30s) ──────────────────────────
  useEffect(() => {
    function update() {
      const timeMode = detectModeByTime(new Date());
      const refined = refineWithLocation(timeMode, isInsideSchool);
      setAutoMode(refined);
    }

    update(); // run immediately
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [isInsideSchool]);

  // ── Current active mode ──────────────────────────────────────────────────
  const currentModeKey = manualMode || autoMode;
  const currentMode = BUS_MODES[currentModeKey];
  const isAutoDetected = manualMode === null;

  // ── Public API ───────────────────────────────────────────────────────────
  const setManual = useCallback((modeKey) => {
    if (BUS_MODES[modeKey]) setManualMode(modeKey);
  }, []);

  const resetToAuto = useCallback(() => {
    setManualMode(null);
  }, []);

  return {
    currentMode,
    currentModeKey,
    isAutoDetected,
    setManualMode: setManual,
    resetToAuto,
    busPosition,
    isInsideSchool,
    geoError,
    allModes: BUS_MODE_LIST,
  };
}
