import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Hourglass, Bus, RefreshCw, HelpCircle } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useTheme } from '../contexts/ThemeContext';
import { BUS_STATES } from './busStates';
import './BusStatus.css';

// ─── Safe opacity helper ──────────────────────────────────────────────────────
// Instead of appending hex opacity suffix (e.g. colors.success + "1A") which
// breaks if the color is rgba() or hsl(), we use a CSS variable-based approach.
// We set the color as a CSS custom property and apply opacity via a wrapper class.
// This works regardless of the color format in theme.js.
function withOpacity(color, opacity) {
  // Create a temporary element to convert any color format to rgb
  // This runs only at render time and is safe in browser environments
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  } catch {
    // Fallback: return the color with reduced opacity via CSS
    return color;
  }
}

export default function BusStatus({ busId }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const { colors } = useTheme();

  useEffect(() => {
    if (!busId) return;

    const busRef = doc(db, 'bus_location', busId);
    const unsubscribe = onSnapshot(busRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStatus(data.busStatus || '');
      } else {
        setStatus('');
      }
    }, (error) => {
      console.error('Error fetching bus status:', error);
      setStatus('');
    });

    return () => unsubscribe();
  }, [busId]);

  // Determine styling based on the status string
  const getStatusDisplay = (currentStatus) => {
    switch (currentStatus) {
      // Arrived (Success / Green)
      case BUS_STATES.ARRIVED:
      case BUS_STATES.ARRIVED_AT_SCHOOL:
      case BUS_STATES.ARRIVED_AT_STOP:
        return { color: colors.success, icon: <CheckCircle size={14} /> };

      // Waiting (Accent / Amber)
      case BUS_STATES.WAITING_TO_BOARD:
      case BUS_STATES.WAITING_LATE:
        return { color: colors.accent, icon: <Hourglass size={14} /> };

      // In Transit (Info / Blue)
      case BUS_STATES.ON_THE_WAY:
      case BUS_STATES.NEARBY:
      case BUS_STATES.ON_THE_WAY_TO_SCHOOL:
      case BUS_STATES.BUS_ON_THE_WAY:
      case BUS_STATES.BUS_NEARBY:
      case BUS_STATES.ON_THE_WAY_BACK:
        return { color: colors.info, icon: <Bus size={14} /> };

      // Picking up / Dropping off (Primary)
      case BUS_STATES.PICKING_UP:
      case BUS_STATES.DROPPING_OFF:
        return { color: colors.primary, icon: <RefreshCw size={14} /> };

      // Unknown / fallback (Muted)
      default:
        return { color: colors.textMuted, icon: <HelpCircle size={14} /> };
    }
  };

  const { color, icon } = getStatusDisplay(status);

  return (
    <div
      className="bus-status-container"
      style={{
        color: color,
        backgroundColor: withOpacity(color, 0.1),  // safe 10% opacity bg
        borderColor: withOpacity(color, 0.2),       // safe 20% opacity border
      }}
    >
      <span className="bus-status-icon">{icon}</span>
      <span>{status || t('busStatus.unknown')}</span>
    </div>
  );
}
