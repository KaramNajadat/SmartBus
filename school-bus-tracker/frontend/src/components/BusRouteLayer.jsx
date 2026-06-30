import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Polyline, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import {
  SCHOOL,
  BUS_STOPS,
  fetchOSRMRoute,
  getPickupRoute,
  getDropoffRoute,
  isMorningPeriod,
} from '../utils/busRoute';
import { haversineMeters } from '../utils/geo';

const schoolIcon = L.divIcon({
  className: 'bus-route-school-icon',
  html: `<div style="
    width: 38px; height: 38px; border-radius: 50%;
    background: #10b981; border: 3px solid white;
    box-shadow: 0 2px 10px rgba(16,185,129,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
  ">🏫</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

function createStopIcon(index) {
  return L.divIcon({
    className: 'bus-route-stop-icon',
    html: `<div style="
      width: 32px; height: 32px; border-radius: 50%;
      background: #f59e0b; border: 3px solid white;
      box-shadow: 0 2px 10px rgba(245,158,11,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800; color: #1a1a2e;
      font-family: system-ui, sans-serif;
    ">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const visitedStopIcon = L.divIcon({
  className: 'bus-route-stop-visited-icon',
  html: `<div style="
    width: 32px; height: 32px; border-radius: 50%;
    background: #10b981; border: 3px solid white;
    box-shadow: 0 2px 10px rgba(16,185,129,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: white;
  ">✓</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Radius within which a stop is considered "arrived at" — bus advances past it
const STOP_ARRIVAL_RADIUS = 100; // meters

const ROUTE_COLORS = {
  BUS_01: { morning: '#3b82f6', afternoon: '#8b5cf6', active_morning: '#2563eb', active_afternoon: '#7c3aed' },
  BUS_02: { morning: '#06b6d4', afternoon: '#a855f7', active_morning: '#0891b2', active_afternoon: '#9333ea' },
};

function findClosestIndex(coords, busPos) {
  let minDist = Infinity;
  let closest = 0;
  for (let i = 0; i < coords.length; i++) {
    const dlat = coords[i][0] - busPos.lat;
    const dlng = coords[i][1] - busPos.lng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }
  return closest;
}

function SingleBusRoute({ busId, busPosition, isMorning, stopIndexOffset = 0, visitedStopIds = new Set() }) {
  const { t } = useTranslation();
  const [routeData, setRouteData] = useState(null);
  const [connectorCoords, setConnectorCoords] = useState(null);
  const lastConnectorPos = useRef(null);
  const connectorSplitIdx = useRef(0);

  const stops = BUS_STOPS[busId] || [];
  const colors = ROUTE_COLORS[busId] || ROUTE_COLORS.BUS_01;
  const routeColor = isMorning ? colors.morning : colors.afternoon;

  useEffect(() => {
    const fetchRoute = isMorning ? getPickupRoute : getDropoffRoute;
    fetchRoute(busId).then(setRouteData);
  }, [isMorning, busId]);

  // When bus is off-route, fetch a road-following connector from bus to nearest route point
  useEffect(() => {
    if (!routeData?.coords || !busPosition) {
      setConnectorCoords(null);
      return;
    }

    const idx = findClosestIndex(routeData.coords, busPosition);
    const closestPt = routeData.coords[idx];
    const dlat = closestPt[0] - busPosition.lat;
    const dlng = closestPt[1] - busPosition.lng;
    const distToRoute = Math.sqrt(dlat * dlat + dlng * dlng) * 111_000;

    if (distToRoute < 300) {
      setConnectorCoords(null);
      lastConnectorPos.current = null;
      return;
    }

    if (lastConnectorPos.current) {
      const ml = busPosition.lat - lastConnectorPos.current.lat;
      const mg = busPosition.lng - lastConnectorPos.current.lng;
      if (Math.sqrt(ml * ml + mg * mg) * 111_000 < 100) return;
    }

    lastConnectorPos.current = { lat: busPosition.lat, lng: busPosition.lng };

    const routeStart = routeData.coords[0];
    fetchOSRMRoute([
      { lat: busPosition.lat, lng: busPosition.lng },
      { lat: routeStart[0], lng: routeStart[1] },
    ]).then(result => {
      if (result?.coords) {
        setConnectorCoords(result.coords);
      }
    });
  }, [routeData, busPosition]);

  let displayCoords = routeData?.coords || null;
  if (routeData?.coords && busPosition) {
    const busCoord = [busPosition.lat, busPosition.lng];
    let idx = findClosestIndex(routeData.coords, busPosition);
    const closestPt = routeData.coords[idx];
    const dlat = closestPt[0] - busPosition.lat;
    const dlng = closestPt[1] - busPosition.lng;
    const distToRoute = Math.sqrt(dlat * dlat + dlng * dlng) * 111_000;

    if (distToRoute < 300) {
      // Advance past stops the bus is physically near OR that have been
      // scan-confirmed (all students for that stop have been dropped off).
      for (const stop of stops) {
        const nearByGPS = haversineMeters(busPosition.lat, busPosition.lng, stop.lat, stop.lng) < STOP_ARRIVAL_RADIUS;
        const visitedByScan = visitedStopIds.has(stop.id);
        if (nearByGPS || visitedByScan) {
          const stopIdx = findClosestIndex(routeData.coords, stop);
          if (stopIdx >= idx) idx = Math.min(stopIdx + 1, routeData.coords.length - 1);
        }
      }
      displayCoords = [busCoord, ...routeData.coords.slice(idx)];
    } else if (connectorCoords) {
      displayCoords = [...connectorCoords, ...routeData.coords];
    }
  }

  const durationLabel = routeData?.duration
    ? `${Math.round(routeData.duration / 60)} min`
    : null;
  const distanceLabel = routeData?.distance
    ? `${(routeData.distance / 1000).toFixed(1)} km`
    : null;

  return (
    <>
      {/* Route — trimmed to only show ahead of bus */}
      {displayCoords && (
        <Polyline
          positions={displayCoords}
          pathOptions={{
            color: '#ffffff',
            weight: 8,
            opacity: 0.6,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      {displayCoords && (
        <Polyline
          positions={displayCoords}
          pathOptions={{
            color: routeColor,
            weight: 5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {/* Stop markers */}
      {stops.map((stop, idx) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lng]}
          icon={visitedStopIds.has(stop.id) ? visitedStopIcon : createStopIcon(stopIndexOffset + idx)}
          zIndexOffset={400}
        >
          <Popup>
            <div style={{ fontFamily: 'system-ui', minWidth: '160px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
                📍 {t('map.stop')} {stopIndexOffset + idx + 1}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{stop.name}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{busId}</div>
              {durationLabel && distanceLabel && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {t('schoolAdmin.route')}: {distanceLabel} · ~{durationLabel}
                </div>
              )}
            </div>
          </Popup>
          <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>{stop.name}</span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

export default function BusRouteLayer({ busId, busPositions = {}, visitedStopIds = new Set() }) {
  const { t } = useTranslation();
  const [isMorning, setIsMorning] = useState(isMorningPeriod());

  useEffect(() => {
    const interval = setInterval(() => {
      setIsMorning(isMorningPeriod());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Determine which buses to show routes for
  const busIds = busId
    ? (Array.isArray(busId) ? busId : [busId])
    : Object.keys(BUS_STOPS);

  let stopCounter = 0;

  return (
    <>
      {/* School marker (shared by all buses) */}
      <Marker position={[SCHOOL.lat, SCHOOL.lng]} icon={schoolIcon} zIndexOffset={500}>
        <Popup>
          <div style={{ fontFamily: 'system-ui', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              🏫 {SCHOOL.name}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{t('map.schoolLocation')}</div>
          </div>
        </Popup>
        <Tooltip direction="top" offset={[0, -22]} opacity={0.9}>
          <span style={{ fontSize: '11px', fontWeight: 700 }}>🏫 {SCHOOL.name}</span>
        </Tooltip>
      </Marker>

      {/* Per-bus routes */}
      {busIds.map((id) => {
        const offset = stopCounter;
        stopCounter += (BUS_STOPS[id] || []).length;
        return (
          <SingleBusRoute
            key={id}
            busId={id}
            busPosition={busPositions[id] || null}
            isMorning={isMorning}
            stopIndexOffset={offset}
            visitedStopIds={visitedStopIds}
          />
        );
      })}
    </>
  );
}
