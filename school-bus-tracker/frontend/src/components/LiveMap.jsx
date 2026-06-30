import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../firebase';
import BusRouteLayer from './BusRouteLayer';
import { isMorningPeriod } from '../utils/busRoute';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function MapUpdater({ center }) {
  const map = useMap();
  const hasCentered = useRef(false);
  useEffect(() => {
    if (center && !hasCentered.current) {
      map.setView(center, map.getZoom());
      hasCentered.current = true;
    }
  }, [center, map]);
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    const timer = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [map]);
  return null;
}

const liveBusIcon = L.divIcon({
  className: 'live-bus-icon',
  html: `<div style="
    width: 36px; height: 36px; border-radius: 50%;
    background: #2563eb; border: 3px solid white;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.3), 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    animation: pulse-ring 2s ease-out infinite;
  ">🚌</div>
  <style>
    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 3px rgba(37,99,235,0.3), 0 2px 8px rgba(0,0,0,0.3); }
      70% { box-shadow: 0 0 0 10px rgba(37,99,235,0), 0 2px 8px rgba(0,0,0,0.3); }
      100% { box-shadow: 0 0 0 3px rgba(37,99,235,0), 0 2px 8px rgba(0,0,0,0.3); }
    }
  </style>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export default function LiveMap({ busId, masterView, demoBuses = [], visitedStopIds = new Set() }) {
  const { t } = useTranslation();
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);

  const fallbackCenter = [25.411472, 55.507611]; // Ajman University campus

  const firstRealBus = buses.length > 0 && buses[0].lat && buses[0].lng
    ? [buses[0].lat, buses[0].lng]
    : null;
  const firstDemoBus = demoBuses.length > 0
    ? [demoBuses[0].lat, demoBuses[0].lng]
    : null;
  const liveCenter = firstRealBus || firstDemoBus || null;

  useEffect(() => {
    const busLocRef = collection(db, 'bus_location');
    let q;

    if (busId && !masterView) {
      if (Array.isArray(busId)) {
        q = query(busLocRef, where('__name__', 'in', busId));
      } else {
        q = query(busLocRef, where('__name__', '==', busId));
      }
    } else {
      q = query(busLocRef);
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBuses(records);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching bus location:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [busId, masterView]);

  // Build per-bus position map for BusRouteLayer (real + demo)
  const busPositions = {};
  buses.forEach(bus => {
    if (bus.lat && bus.lng) {
      busPositions[bus.id] = { lat: bus.lat, lng: bus.lng };
    }
  });
  demoBuses.forEach(bus => {
    if (bus.lat && bus.lng) {
      busPositions[bus.id] = { lat: bus.lat, lng: bus.lng };
    }
  });

  // Count total stops for route indicator
  const activeBusIds = busId
    ? (Array.isArray(busId) ? busId : [busId])
    : [];
  const demoIds = demoBuses.map(b => b.id);
  const allVisibleIds = [...new Set([...activeBusIds, ...demoIds])];

  if (loading && demoBuses.length === 0) return <div className="map-container">{t('map.loading')}</div>;

  return (
    <div className="map-container" style={{ position: 'relative' }}>
      <MapContainer center={liveCenter || fallbackCenter} zoom={13} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {liveCenter && <MapUpdater center={liveCenter} />}
        <MapResizer />

        {/* Bus routes — shows routes for all visible buses */}
        <BusRouteLayer
          busId={allVisibleIds.length > 0 ? allVisibleIds : busId}
          busPositions={busPositions}
          visitedStopIds={visitedStopIds}
        />

        {/* Real Firebase buses (hidden during demo) */}
        {demoBuses.length === 0 && buses.map((bus) =>
          bus.lat && bus.lng ? (
            <Marker key={bus.id} position={[bus.lat, bus.lng]} icon={liveBusIcon}>
              <Popup>
                <div style={{ fontFamily: 'system-ui', minWidth: '180px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    🚌 {bus.name || `Bus ${bus.id}`}
                  </div>
                  <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div><strong>{t('map.busId')}:</strong> {bus.id}</div>
                    <div><strong>{t('map.speed')}:</strong> {bus.speed ?? '—'} km/h</div>
                    <div><strong>{t('map.status')}:</strong> {bus.busStatus || t('map.active')}</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null
        )}

        {/* Demo buses — same icon as live */}
        {demoBuses.map((bus) => (
          <Marker
            key={`demo-${bus.id}`}
            position={[bus.lat, bus.lng]}
            icon={liveBusIcon}
          >
            <Popup>
              <div style={{ fontFamily: 'system-ui', minWidth: '180px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                  🚌 {bus.name}
                </div>
                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>{t('map.busId')}:</strong> {bus.id}</div>
                  <div><strong>{t('map.speed')}:</strong> {bus.speed} km/h</div>
                  <div><strong>{t('map.status')}:</strong> {bus.busStatus}</div>
                  <div style={{ marginTop: '4px', padding: '4px 8px', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{t('map.nextStop')}</div>
                    <div style={{ fontWeight: 600, color: '#0369a1' }}>{bus.nextStop || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#0369a1' }}>{t('map.eta')}: {bus.eta}</div>
                  </div>
                </div>
                <div style={{ marginTop: '6px', fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>
                  🧪 {t('map.demoMode')}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Offline Hardware Overlay */}
      {buses.length === 0 && demoBuses.length === 0 && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            padding: '24px 40px',
            borderRadius: '12px',
            border: '1px solid var(--borders)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'auto'
          }}>
            <div style={{ fontSize: '32px' }}>📡</div>
            <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '18px', fontWeight: '600' }}>
              {t('map.gpsOfflineTitle')}
            </h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px', maxWidth: '300px' }}>
              {t('map.gpsOfflineSub')}
            </p>
          </div>
        </div>
      )}

      {/* Route indicator */}
      <div style={{
        position: 'absolute', top: demoBuses.length > 0 ? '36px' : '10px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, pointerEvents: 'none',
        background: isMorningPeriod() ? 'rgba(59, 130, 246, 0.9)' : 'rgba(139, 92, 246, 0.9)',
        color: '#fff',
        padding: '4px 14px', borderRadius: '20px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {isMorningPeriod() ? `🚌 ${t('map.pickupRoute')}` : `🚌 ${t('map.dropoffRoute')}`}
      </div>

      {/* Demo mode indicator */}
      {demoBuses.length > 0 && (
        <div style={{
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, pointerEvents: 'none',
          background: 'rgba(245, 158, 11, 0.9)', color: '#1a1a2e',
          padding: '4px 14px', borderRadius: '20px',
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          🧪 {t('map.demoBanner', { count: demoBuses.length })}
        </div>
      )}
    </div>
  );
}
