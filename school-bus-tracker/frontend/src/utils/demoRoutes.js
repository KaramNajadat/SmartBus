/**
 * demoRoutes.js — Simulated bus routes for demo mode.
 *
 * Uses the same stops as the real bus routes so the demo
 * visually matches live GPS tracking.
 */

import { SCHOOL, BUS_STOPS } from './busRoute';

export const DEMO_ROUTES = [
  {
    busId: 'BUS_01',
    name: 'Bus 01 — City Centre Route',
    color: '#2563eb',
    waypoints: [
      { lat: SCHOOL.lat, lng: SCHOOL.lng, stop: SCHOOL.name },
      { lat: 25.4155, lng: 55.4975 },
      { lat: BUS_STOPS.BUS_01[1].lat, lng: BUS_STOPS.BUS_01[1].lng, stop: BUS_STOPS.BUS_01[1].name },
      { lat: 25.4100, lng: 55.4840 },
      { lat: BUS_STOPS.BUS_01[0].lat, lng: BUS_STOPS.BUS_01[0].lng, stop: BUS_STOPS.BUS_01[0].name },
    ],
  },
  {
    busId: 'BUS_02',
    name: 'Bus 02 — Al Mowaihat Route',
    color: '#7c3aed',
    waypoints: [
      { lat: BUS_STOPS.BUS_02[0].lat, lng: BUS_STOPS.BUS_02[0].lng, stop: BUS_STOPS.BUS_02[0].name },
      { lat: 25.3980, lng: 55.5010 },
      { lat: 25.4030, lng: 55.5035 },
      { lat: 25.4080, lng: 55.5050 },
      { lat: SCHOOL.lat, lng: SCHOOL.lng, stop: SCHOOL.name },
    ],
  },
];

/**
 * Given a route and a progress value (0–1), returns the interpolated
 * position along the waypoint path, plus next-stop info and ETA.
 */
export function interpolateRoute(route, progress) {
  const pts = route.waypoints;
  if (!pts || pts.length < 2) return { lat: 0, lng: 0 };

  const p = Math.max(0, Math.min(1, progress));

  const dists = [];
  let totalDist = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversine(pts[i - 1], pts[i]);
    dists.push(d);
    totalDist += d;
  }

  const targetDist = p * totalDist;
  let accumulated = 0;
  let segIdx = 0;

  for (let i = 0; i < dists.length; i++) {
    if (accumulated + dists[i] >= targetDist) {
      segIdx = i;
      break;
    }
    accumulated += dists[i];
    if (i === dists.length - 1) segIdx = i;
  }

  const segProgress = dists[segIdx] > 0
    ? (targetDist - accumulated) / dists[segIdx]
    : 0;

  const from = pts[segIdx];
  const to = pts[segIdx + 1] || pts[segIdx];
  const lat = from.lat + (to.lat - from.lat) * segProgress;
  const lng = from.lng + (to.lng - from.lng) * segProgress;

  let nextStop = null;
  for (let i = segIdx + 1; i < pts.length; i++) {
    if (pts[i].stop) {
      nextStop = pts[i].stop;
      break;
    }
  }

  const speed = Math.round(25 + Math.random() * 15);
  const busStatus = p >= 0.98
    ? 'Arrived at destination'
    : `On the way to ${nextStop || 'next stop'}`;
  const eta = p >= 0.98 ? 'Arrived' : `${Math.round((1 - p) * 8)} min`;

  return { lat, lng, nextStop, eta, speed, busStatus };
}

function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}
