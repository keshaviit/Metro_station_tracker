import { useEffect, useState, useCallback } from 'react';

/**
 * useNotification
 * Requests browser Notification permission and provides
 * a function to fire notifications via Service Worker for background support.
 */
export function useNotification() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'denied'
  );

  // Sync state
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied';
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return 'denied';
    }
  }, []);

  const notify = useCallback((title, body, icon = '/metro-icon.png') => {
    if (permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            registration.showNotification(title, {
              body,
              icon,
              badge: icon,
              vibrate: [200, 100, 200],
              tag: 'metro-alert',
              renotify: true,
            });
          })
          .catch(() => {
            new Notification(title, { body, icon });
          });
      } else {
        new Notification(title, { body, icon });
      }
    }
  }, [permission]);

  return { permission, requestPermission, notify };
}
