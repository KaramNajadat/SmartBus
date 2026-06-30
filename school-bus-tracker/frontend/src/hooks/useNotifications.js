import { useState, useEffect, useRef, useCallback } from 'react';
import i18n from '../i18n';
import { db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, getDocs, arrayUnion,
} from 'firebase/firestore';
import { getTodayDateString } from '../utils/schedule';

export default function useNotifications(role) {
  const [notifications, setNotifications] = useState([]);
  const shownIdsRef = useRef(new Set());
  const sentKeysRef = useRef(new Set());

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const today = getTodayDateString();
    const q = query(collection(db, 'notifications'), where('date', '==', today));
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(docs);

      docs.forEach(n => {
        if (!shownIdsRef.current.has(n.id) && !(n.readBy || []).includes(role)) {
          shownIdsRef.current.add(n.id);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(i18n.t('notif.studentAlert'), {
              body: n.message,
              icon: '/favicon.ico',
              tag: n.id,
            });
          }
        }
      });
    });
  }, [role]);

  const sendNotification = useCallback(async ({ type, message, studentNames, busId }) => {
    const today = getTodayDateString();
    const dedupKey = `${type}:${busId}:${today}`;
    if (sentKeysRef.current.has(dedupKey)) return;

    const existing = await getDocs(query(
      collection(db, 'notifications'),
      where('type', '==', type),
      where('busId', '==', busId),
      where('date', '==', today),
    ));

    sentKeysRef.current.add(dedupKey);
    if (!existing.empty) return;

    await addDoc(collection(db, 'notifications'), {
      type,
      message,
      studentNames: studentNames || [],
      busId,
      date: today,
      sentAt: serverTimestamp(),
      readBy: [],
    });
  }, []);

  const dismissNotification = useCallback(async (notifId) => {
    await updateDoc(doc(db, 'notifications', notifId), {
      readBy: arrayUnion(role),
    });
  }, [role]);

  const unreadNotifications = notifications.filter(n => !(n.readBy || []).includes(role));

  return { notifications, unreadNotifications, sendNotification, dismissNotification };
}
