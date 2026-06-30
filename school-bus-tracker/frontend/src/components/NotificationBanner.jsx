import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Bus } from 'lucide-react';
import './NotificationBanner.css';

export default function NotificationBanner({ notifications, onDismiss }) {
  const { t } = useTranslation();
  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="notif-stack">
      {notifications.map((n) => (
        <div key={n.id} className="notif-card">
          <div className="notif-card__icon">
            <Bus size={18} />
          </div>
          <div className="notif-card__body">
            <p className="notif-card__title">{t('notif.studentsStillOnBus')}</p>
            <p className="notif-card__message">{n.message}</p>
            {n.studentNames?.length > 0 && (
              <div className="notif-card__students">
                {n.studentNames.map(name => (
                  <span key={name} className="notif-card__student-chip">{name}</span>
                ))}
              </div>
            )}
          </div>
          <button
            className="notif-card__dismiss"
            onClick={() => onDismiss(n.id)}
            title={t('common.dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
