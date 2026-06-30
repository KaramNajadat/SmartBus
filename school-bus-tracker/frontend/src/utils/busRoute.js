/**
 * busRoute.js — Bus route definitions and OSRM route fetching.
 *
 * Defines the school location and per-bus pickup stops, fetches actual road
 * routes from OSRM, and caches the results.
 */

export const SCHOOL = {
  lat: 25.412801517691587,
  lng: 55.50658383826939,
  name: 'Ajman University',
};

// Per-bus stop definitions
export const BUS_STOPS = {
  BUS_01: [
    {
      id: 'stop-1',
      lat: 25.400071494945728,
      lng: 55.478725760355346,
      name: 'Ajman City Centre',
    },
    {
      id: 'stop-2',
      lat: 25.41734835925975,
      lng: 55.4895065146375,
      name: 'Sheikh Zayed Mosque',
    },
  ],
  BUS_02: [
    {
      id: 'stop-3',
      lat: 25.39365902210464,
      lng: 55.49941249608778,
      name: 'Al Mowaihat',
    },
  ],
};

export async function fetchOSRMRoute(waypoints) {
  try {
    const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.length > 0) {
      return {
        coords: data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const routeCache = {};

function cacheKey(busId, type) {
  return `${busId}_${type}`;
}

/**
 * Get pickup route for a specific bus.
 * Morning: School → stops (in order) → School
 */
export async function getPickupRoute(busId = 'BUS_01') {
  const key = cacheKey(busId, 'pickup');
  if (routeCache[key]) return routeCache[key];

  const stops = BUS_STOPS[busId] || BUS_STOPS.BUS_01;
  const waypoints = [SCHOOL, ...stops.slice().reverse(), SCHOOL];
  const result = await fetchOSRMRoute(waypoints);
  routeCache[key] = result || {
    coords: waypoints.map(p => [p.lat, p.lng]),
    distance: null,
    duration: null,
  };
  return routeCache[key];
}

/**
 * Afternoon drop-off route for a specific bus.
 * School → stops (in order)
 */
export async function getDropoffRoute(busId = 'BUS_01') {
  const key = cacheKey(busId, 'dropoff');
  if (routeCache[key]) return routeCache[key];

  const stops = BUS_STOPS[busId] || BUS_STOPS.BUS_01;
  const waypoints = [SCHOOL, ...stops.slice().reverse()];
  const result = await fetchOSRMRoute(waypoints);
  routeCache[key] = result || {
    coords: waypoints.map(p => [p.lat, p.lng]),
    distance: null,
    duration: null,
  };
  return routeCache[key];
}

export function isMorningPeriod() {
  const hour = new Date().getHours();
  return hour < 12;
}
