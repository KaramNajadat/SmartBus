import { useState, useEffect, useRef, useCallback } from 'react';
import { SCHOOL, BUS_STOPS, fetchOSRMRoute, isMorningPeriod } from '../utils/busRoute';

const STORAGE_KEY = 'smartbus_demo_mode';
const SCENARIO_KEY = 'smartbus_demo_scenario';
export const GPS_OFFLINE_KEY = 'smartbus_demo_gps_offline';
export const GPS_OFFLINE_EVENT = 'smartbus-demo-gps';
const TICK_MS = 1000;
const LOOP_DURATION = 120;

// ── Demo alert scenario data ───────────────────────────────────────────────
export const DEMO_MISSING_STUDENTS = ['Lina Nasser', 'Yousef Mahmoud'];
export const DEMO_NOT_DROPPED_OFF = [
  { name: 'Ahmad Hassan', phase: 'afternoon', desc: 'Boarded afternoon — not scanned off at home' },
  { name: 'Sara Ali',     phase: 'afternoon', desc: 'Boarded afternoon — not scanned off at home' },
];

const BUS_CONFIGS = [
  { busId: 'BUS_01', name: 'Bus 01 — City Centre Route' },
  { busId: 'BUS_02', name: 'Bus 02 — Al Mowaihat Route' },
];

export default function useDemoMode() {
  const [demoEnabled, setDemoEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const [demoScenario, setDemoScenarioState] = useState(() => {
    try { return localStorage.getItem(SCENARIO_KEY) || null; } catch { return null; }
  });

  const [demoGpsOffline, setDemoGpsOfflineState] = useState(() => {
    try { return localStorage.getItem(GPS_OFFLINE_KEY) === 'true'; } catch { return false; }
  });

  const [demoBuses, setDemoBuses] = useState([]);
  const tickRef = useRef(0);
  const intervalRef = useRef(null);
  const routeCoordsRef = useRef({});

  // ── GPS-offline simulation ──────────────────────────────────────────────
  // Persisted + broadcast via a window event so useBusMode (a separate hook
  // instance) can react and surface the "GPS offline" state.
  const setDemoGpsOffline = useCallback((value) => {
    setDemoGpsOfflineState(value);
    try {
      if (value) localStorage.setItem(GPS_OFFLINE_KEY, 'true');
      else localStorage.removeItem(GPS_OFFLINE_KEY);
    } catch { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent(GPS_OFFLINE_EVENT, { detail: value }));
    } catch { /* noop */ }
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* noop */ }
      if (!next) {
        setDemoScenarioState(null);
        try { localStorage.removeItem(SCENARIO_KEY); } catch { /* noop */ }
        setDemoGpsOffline(false);
      }
      return next;
    });
  }, [setDemoGpsOffline]);

  const setDemoScenario = useCallback((scenario) => {
    setDemoScenarioState(scenario);
    try {
      if (scenario) localStorage.setItem(SCENARIO_KEY, scenario);
      else localStorage.removeItem(SCENARIO_KEY);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!demoEnabled) {
      setDemoBuses([]);
      clearInterval(intervalRef.current);
      tickRef.current = 0;
      return;
    }

    let cancelled = false;

    async function fetchRoutes() {
      const isMorning = isMorningPeriod();
      for (const cfg of BUS_CONFIGS) {
        const stops = BUS_STOPS[cfg.busId] || [];
        const waypoints = isMorning
          ? [SCHOOL, ...stops.slice().reverse(), SCHOOL]
          : [SCHOOL, ...stops.slice().reverse()];
        const result = await fetchOSRMRoute(waypoints);
        if (result) {
          routeCoordsRef.current[cfg.busId] = result.coords;
        }
      }

      if (cancelled) return;

      const offsets = [0, 0.35];

      function tick() {
        tickRef.current += 1;

        const buses = BUS_CONFIGS.map((cfg, i) => {
          const coords = routeCoordsRef.current[cfg.busId];
          if (!coords || coords.length === 0) return null;

          const rawProgress = ((tickRef.current / LOOP_DURATION) + offsets[i]) % 1;
          const progress = rawProgress <= 0.5
            ? rawProgress * 2
            : (1 - rawProgress) * 2;

          const idx = Math.min(
            Math.floor(progress * (coords.length - 1)),
            coords.length - 1
          );
          const nextIdx = Math.min(idx + 1, coords.length - 1);
          const frac = (progress * (coords.length - 1)) - idx;

          const lat = coords[idx][0] + (coords[nextIdx][0] - coords[idx][0]) * frac;
          const lng = coords[idx][1] + (coords[nextIdx][1] - coords[idx][1]) * frac;

          const remaining = 1 - progress;
          const speed = Math.round(25 + Math.random() * 15);

          const stops = BUS_STOPS[cfg.busId] || [];
          const nextStop = stops.length > 0 ? stops[stops.length - 1].name : SCHOOL.name;

          return {
            id: cfg.busId,
            name: cfg.name,
            lat,
            lng,
            speed,
            busStatus: progress >= 0.98 ? 'Arrived' : `On the way to ${nextStop}`,
            nextStop,
            eta: progress >= 0.98 ? 'Arrived' : `${Math.round(remaining * 10)} min`,
            isDemo: true,
          };
        }).filter(Boolean);

        setDemoBuses(buses);
      }

      tick();
      intervalRef.current = setInterval(tick, TICK_MS);
    }

    fetchRoutes();

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [demoEnabled]);

  return {
    demoEnabled, toggleDemo, demoBuses,
    demoScenario, setDemoScenario,
    demoGpsOffline, setDemoGpsOffline,
    demoMissingStudents: DEMO_MISSING_STUDENTS,
    demoNotDroppedOff: DEMO_NOT_DROPPED_OFF,
  };
}
